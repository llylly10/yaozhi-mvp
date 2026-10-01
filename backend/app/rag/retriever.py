"""检索门面：教材页 + 题库解析 双路 BM25 混合召回（2026-09-10）。

背景：教材 OCR 以「页」为单元（约千字、双栏串行破碎），跨药对比/异同类问题两处论述
常不在同页，单路召回会漏证据 → 模型判"依据不足"拒答。题库解析是小粒度、单主题聚焦的
已审校语料，正好补位。故改为双路召回 + 分路归一化后融合。

- 两路 BM25 分数**不可直接比较**（语料规模与文档长度分布不同），故各路按自身 top1 归一化
  到 (0,1]，再融合排序；融合后仍强制**每路至少 1 条**（只要该路有命中），保证跨源互补。
- 教材路命中页再过一层「页内滑窗」：整页千字里挑与问题最贴近的 ~320 字窗口，缓解
  双栏串行造成的语义噪声，且无需重跑 OCR。
- 语义向量路（2026-09-29 落地，见 semantic.py）：教材页 bge-small-zh 本地向量检索，
  与教材 BM25 在路内融合（同页取较大值、语义独有页并入候选）；缓存/依赖缺失自动
  关闭退回纯词法，行为与升级前一致。本期语料只用教材（不接外部语料）。
"""
from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass, field

from .bm25 import BM25, BM25Index
from .corpus import load_pages
from .itemcorpus import Item, load_items

log = logging.getLogger("yaozhi.rag")

_INDEX_LOCK = threading.Lock()
_cached_index: BM25Index | None = None
_init_attempted = False
_ITEM_LOCK = threading.Lock()
_cached_item_index: BM25 | None = None
_item_init_attempted = False

# 页内滑窗：教材单页常达千字且双栏串行，整页喂模型噪声大 → 取最佳窗口
WINDOW_CHARS = 320
WINDOW_STRIDE = 120
# 教材路相关性门槛：只考核「稀有词」（在 <20% 教材页出现的问题 2-gram，如"阿司/匹林/头孢"），
# 过滤掉"作用/药物/机制"这类通用词带来的伪相关页，名额让给题库路。
TEXTBOOK_MIN_COVER = 0.50
RARE_DF_RATIO = 0.20
_CJK = re.compile(r"[\u4e00-\u9fff]")


@dataclass
class Hit:
    """统一命中结构（两路共用）。"""
    source: str          # "textbook" | "itembank"
    text: str            # 喂模型的切片文本（教材=页内窗口，题库=题干+答案+解析）
    chapter: str = ""    # 章节标签
    score: float = 0.0   # 归一化后的融合分
    raw_score: float = 0.0
    page: int = 0        # textbook: PDF 页号
    book_page: int = 0   # textbook: 教材书页
    code: str = ""       # itembank: 题号，如 "01-003"
    label: str = ""      # 展示用出处，如 "教材 第7章 p90" / "题库 01-139 第8章 局部麻醉药"
    item: object = field(default=None, repr=False)  # itembank: 原始 Item（可选）
    semantic: bool = False  # 教材路：该页由语义向量召回/融合胜出（溯源展示用）


def _build_index(ocr_dir: str | None = None) -> BM25Index:
    """惰性构建教材页索引（线程安全）。语料缺失返回空索引。"""
    global _cached_index, _init_attempted
    if _cached_index is not None or _init_attempted:
        return _cached_index or BM25Index([])
    with _INDEX_LOCK:
        if _cached_index is not None or _init_attempted:
            return _cached_index or BM25Index([])
        _init_attempted = True
        pages = load_pages(ocr_dir)
        if not pages:
            log.info("RAG：教材 OCR 语料缺失，教材路检索关闭（no-op）。dir=%s", ocr_dir)
            _cached_index = BM25Index([])
        else:
            _cached_index = BM25Index(pages)
            log.info("RAG：教材 BM25 索引就绪，%d 页（语料 %s）", len(pages), ocr_dir or "默认")
    return _cached_index


def _build_item_index(db) -> BM25 | None:
    """惰性构建题库解析索引（线程安全）。无 db / 无数据 → None（该路关闭）。"""
    global _cached_item_index, _item_init_attempted
    if db is None:
        return _cached_item_index
    if _cached_item_index is not None or _item_init_attempted:
        return _cached_item_index
    with _ITEM_LOCK:
        if _cached_item_index is not None or _item_init_attempted:
            return _cached_item_index
        _item_init_attempted = True
        items = load_items(db)
        if not items:
            log.info("RAG：题库解析语料为空，题库路检索关闭（no-op）。")
            _cached_item_index = None
        else:
            _cached_item_index = BM25(items, [it.text for it in items])
            log.info("RAG：题库解析 BM25 索引就绪，%d 题", len(items))
    return _cached_item_index


def reset_for_tests():
    """测试隔离：清空各路缓存索引（含语义路进程内状态），允许换语料/换库重建。"""
    global _cached_index, _init_attempted, _cached_item_index, _item_init_attempted
    _cached_index = None
    _init_attempted = False
    _cached_item_index = None
    _item_init_attempted = False
    from . import semantic as _sem
    _sem.reset_for_tests()


def _rag_enabled() -> bool:
    try:
        from ..config import settings
        return bool(getattr(settings, "rag_enabled", True))
    except Exception:
        return True


def _query_grams(query: str) -> set[str]:
    """问题侧的中文 2-gram 集合（滑窗选窗用）。"""
    zh = "".join(_CJK.findall(query or ""))
    if len(zh) < 2:
        return set()
    return {zh[i:i + 2] for i in range(len(zh) - 1)}


def _rare_grams(idx: BM25, qg: set[str]) -> set[str]:
    """问题 2-gram 中的稀有部分（文档频率 < RARE_DF_RATIO 的页才出现）。

    "作用/药物/机制"这类高频 gram 几乎每页都有，拿它们算覆盖率会把无关页判成相关；
    药名、专有机制词才是真正的区分信号。
    """
    if not qg or not idx.n:
        return set()
    # 注意：df=0 的 gram（语料里根本没有）要排除——它不是"稀有"，而是检索不到，
    # 计入分母会无谓拉低覆盖率，把本该保留的页也过滤掉。
    return {g for g in qg
            if 0 < idx.df.get(g, 0) / idx.n < RARE_DF_RATIO}


def coverage(text: str, qg: set[str]) -> float:
    """文本覆盖了多少问题的中文 2-gram（0~1）。用于过滤教材路的"高频词误召回"。"""
    if not qg or not text:
        return 1.0
    zh = "".join(_CJK.findall(text))
    if len(zh) < 2:
        return 0.0
    grams = {zh[i:i + 2] for i in range(len(zh) - 1)}
    return len(qg & grams) / len(qg)


def best_window(text: str, query: str, size: int = WINDOW_CHARS) -> str:
    """在长文本里挑与问题最贴近的窗口（整页 OCR 双栏串行的降噪手段）。

    策略：固定窗口 + 步长滑窗，取「窗口内命中问题 2-gram 数量」最大的窗口；
    打平时取靠前窗口。命中数全为 0 时返回开头一段。
    """
    if not text:
        return ""
    if len(text) <= size:
        return text
    qg = _query_grams(query)
    if not qg:
        return text[:size]
    best_i, best_n = 0, -1
    for i in range(0, max(1, len(text) - size + 1), WINDOW_STRIDE):
        zh = "".join(_CJK.findall(text[i:i + size]))
        grams = {zh[j:j + 2] for j in range(len(zh) - 1)} if len(zh) >= 2 else set()
        n = len(qg & grams)
        if n > best_n:
            best_n, best_i = n, i
        if best_n >= len(qg):  # 已全覆盖，无需再找
            break
    return text[best_i:best_i + size]


def _textbook_hits(query: str, k: int, ocr_dir: str | None,
                   min_cover: float = TEXTBOOK_MIN_COVER) -> list[Hit]:
    """教材路召回。整页覆盖率低于门槛的页视为噪声丢弃（名额让给题库路）。

    说明：只从 BM25 top-k 里筛，不做候选扩大——实测把候选放大到 3k 会让"刚好过门槛"
    的弱相关页回填进来，反而稀释证据（见 2026-09-10 六问复评）。
    """
    idx = _build_index(ocr_dir)
    if idx.empty:
        return []
    qg = _query_grams(query)
    key = _rare_grams(idx, qg) or qg   # 稀有词为空（问题过于通用）时退化为全量
    out = []
    for page, score in idx.search(query, k=k, min_score=0.0):
        if coverage(page.text, key) < min_cover:
            continue
        out.append(Hit(
            source="textbook",
            text=best_window(page.text, query),
            chapter=page.chapter,
            raw_score=float(score),
            page=page.pdf_page,
            book_page=page.book_page,
            label=f"教材 {page.chapter} p{page.book_page}".replace("  ", " ").strip(),
        ))
        if len(out) >= k:
            break
    return out


def _itembank_hits(query: str, k: int, db) -> list[Hit]:
    idx = _build_item_index(db)
    if idx is None or idx.empty:
        return []
    out = []
    for item, score in idx.search(query, k=k, min_score=0.0):
        out.append(Hit(
            source="itembank",
            text=item.text,
            chapter=item.chapter_label,
            raw_score=float(score),
            code=item.code,
            label=f"题库 {item.code} {item.chapter_label}".replace("  ", " ").strip(),
            item=item,
        ))
    return out


def _semantic_min_cos() -> float:
    try:
        from ..config import settings
        return float(getattr(settings, "rag_semantic_min_cos", 0.35))
    except Exception:
        return 0.35


def _semantic_hits(query: str, k: int, ocr_dir: str | None) -> list[Hit]:
    """语义向量路（2026-09-29 落地，教材语料专用）：本地 bge-small-zh 页向量余弦检索。

    - 仅教材语料（产品决策 2026-09-29：本期不接 NMPA 说明书等外部语料）；页向量离线
      预构建入 app/rag/cache/，运行时零下载；依赖/缓存缺失/语料指纹不匹配 → []
      （自动退回纯 BM25，行为与升级前一致）；
    - 命中不过「稀有词覆盖」门槛——语义相关性由向量直接度量，词法门槛会把换了说法的
      语义命中（如"突然停药"↔"反跳现象"）挡在门外，与引入语义路的目标相悖；
    - 分数 = 绝对余弦（0~1），不做路内 top1 归一化：BM25 路靠归一化对齐跨路量纲，
      语义路的精度兜底就是绝对门槛 min_cos，top1 放大会把弱相关页抬成满分。
    """
    from . import semantic
    pairs = semantic.search(query, k=k, ocr_dir=ocr_dir, min_cos=_semantic_min_cos())
    if not pairs:
        return []
    idx = _build_index(ocr_dir)
    if idx is None or idx.empty:
        return []
    by_page: dict = {}
    for doc in idx.docs:
        p = doc.obj
        by_page[getattr(p, "pdf_page", None)] = p
    out = []
    for pg, cos in pairs:
        p = by_page.get(pg)
        if p is None:
            continue
        out.append(Hit(source="textbook", text=best_window(p.text, query),
                       chapter=p.chapter, score=round(float(cos), 4), raw_score=float(cos),
                       page=p.pdf_page, book_page=p.book_page,
                       label=f"教材 {p.chapter} p{p.book_page}·语义".replace("  ", " ").strip(),
                       semantic=True))
    return out


def _blend_semantic(tb: list[Hit], sem: list[Hit]) -> list[Hit]:
    """教材路内融合（BM25 词法 + 语义余弦）：同页取两路分数较大值，语义独有页并入候选。

    不做加权求和：两路分数基准不同（BM25 为 top1 归一化分、语义为绝对余弦），max 保证
    任一路的强信号都不被另一路稀释；语义分带 min_cos 绝对门槛自证精度。语义胜出的页
    标记 semantic=True 并在 label 追加「·语义」，供证据卡溯源展示。
    """
    if not sem:
        return tb
    by_page = {h.page: h for h in tb}
    merged = list(tb)
    for h in sem:
        t = by_page.get(h.page)
        if t is None:
            merged.append(h)
        elif h.score > t.score:
            t.score, t.raw_score = h.score, h.raw_score
            t.semantic = True
            if "·语义" not in t.label:
                t.label += "·语义"
    merged.sort(key=lambda h: (-h.score, h.page))
    return merged


def _normalize(hits: list[Hit]) -> list[Hit]:
    """路内归一化：按该路 top1 分数缩放至 (0,1]，便于跨路比较。"""
    if not hits:
        return hits
    top = max(h.raw_score for h in hits)
    if top <= 0:
        for h in hits:
            h.score = 0.0
        return hits
    for h in hits:
        h.score = round(h.raw_score / top, 4)
    return hits


def retrieve_mixed(query: str, k: int = 4, db=None, ocr_dir: str | None = None) -> list[Hit]:
    """混合召回：教材页（BM25+语义融合）+ 题库解析，各路 top-k 后归一化融合，返回融合 top-k。

    融合规则（配额制 + 按分补齐）：
    1. 两路各自归一化 → 各取配额 min(k//2, 该路命中数) 条，保证教材无关时题库路
       仍能占住名额（这正是引入第二检索源要解决的"跨药对比召回不了"问题）；
    2. 剩余名额用两路池子里分数最高的补齐；
    3. 任一路无命中时，名额全部让给另一路（db=None 即退化为纯教材路）。
    """
    if not query or not _rag_enabled():
        return []
    tb = _normalize(_textbook_hits(query, k, ocr_dir))
    tb = _blend_semantic(tb, _semantic_hits(query, k, ocr_dir))  # 教材路内词法+语义融合
    it = _normalize(_itembank_hits(query, k, db))
    pool = tb + it
    if not pool:
        return []
    half = max(1, k // 2)
    picked = tb[:half] + it[:half]
    if len(picked) > k:
        picked = picked[:k]
    taken = {id(h) for h in picked}
    rest = sorted((h for h in pool if id(h) not in taken), key=lambda h: -h.score)
    picked += rest[:max(0, k - len(picked))]
    picked.sort(key=lambda h: -h.score)
    return picked


def retrieve_top_k(query: str, k: int = 3, min_score: float = 0.0,
                   ocr_dir: str | None = None) -> list[Hit]:
    """（兼容接口）仅教材路，返回 Hit 列表（字段与原实现一致，新增 source/label）。"""
    if not query or not _rag_enabled():
        return []
    idx = _build_index(ocr_dir)
    if idx.empty:
        return []
    out: list[Hit] = []
    for page, score in idx.search(query, k=k, min_score=min_score):
        out.append(Hit(source="textbook", text=page.text, chapter=page.chapter,
                       score=round(float(score), 4), raw_score=float(score),
                       page=page.pdf_page, book_page=page.book_page,
                       label=f"教材 {page.chapter} p{page.book_page}".replace("  ", " ").strip()))
    # 语义补充（2026-09-29）：BM25（含稀有词门槛过滤）命中不足 k 条时用语义路补缺。
    # 语义分是绝对余弦、与 BM25 量纲不同，故只补缺不重排既有命中，也不套 min_score。
    if len(out) < k:
        got = {h.page for h in out}
        for h in _semantic_hits(query, k, ocr_dir):
            if h.page in got:
                continue
            out.append(h)
            if len(out) >= k:
                break
    return out


def get_retriever(db=None, ocr_dir: str | None = None):
    """返回混合检索函数（q, k）→ list[Hit]；语义向量路已在 retrieve_mixed 内融合。"""
    return lambda q, k=4: retrieve_mixed(q, k=k, db=db, ocr_dir=ocr_dir)


__all__ = ["Hit", "Item", "retrieve_mixed", "retrieve_top_k", "get_retriever",
           "reset_for_tests", "best_window"]
