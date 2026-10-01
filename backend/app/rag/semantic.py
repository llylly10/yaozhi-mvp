"""教材语义向量检索（2026-09-29 落地，替代 retriever.SemanticMiniLMRetriever 计划态占位）。

定位（产品决策 2026-09-29：本期语料只用教材）：
- 语料范围 = 仅人卫《药理学》第 9 版 OCR（corpus/ocr_textbook9e，538 页），
  不引入 NMPA 说明书 / 诊疗方案等外部语料（题库解析路保持 BM25 不变）；
- 模型 = BAAI/bge-small-zh-v1.5（fastembed ONNX 本地 CPU 推理：无 torch、无 API key、免费）；
- 页向量离线预构建（backend/build_semantic_cache.py → app/rag/cache/*.npz，约 1.5MB 入库），
  运行时**零下载零构建**：fastembed 未装 / 缓存缺失 / 语料指纹不匹配 任一不满足，
  语义路自动关闭，检索退回纯 BM25 双路混合（与语料缺失同策略，绝不阻塞诊断与问答）。

检索语义：
- bge 512 token 上限 vs 整页千字 OCR → 页文本按 ~450 字切片编码，页分数 = 页内各片
  余弦的**最大值**（max 池化，避免平均稀释唯一命中片）；
- 查询编码带 bge 检索指令前缀（官方推荐，显著优于裸句）；
- 相似度 = L2 归一化后内积（等价余弦），float32 确定性可回放；
- 页分数即绝对余弦（0~1），**不做路内 top1 归一化**：BM25 路有稀有词门槛做精度兜底、
  靠归一化跨路对齐；语义路的精度兜底就是绝对余弦门槛（min_cos），再做 top1 放大会把
  弱相关页抬成满分污染证据。
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time

log = logging.getLogger("yaozhi.rag.semantic")

MODEL_NAME = "BAAI/bge-small-zh-v1.5"
QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："
CHUNK_CHARS = 450    # bge-small-zh 上下文 512 token；中文 ≈1 token/字，留余量
CHUNK_STRIDE = 380   # 切片步长（相邻片重叠 ~70 字，避免术语被边界切断）

_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
_CACHE_FILE = os.path.join(_CACHE_DIR, "textbook_bge_small_zh.npz")

_STATE_LOCK = threading.Lock()
_state: dict | None = None       # {"vectors", "pages", "meta"}（页向量缓存）
_state_dir: str | None = None
_model: object | None = None     # fastembed TextEmbedding 单例
_unavailable: dict[str, str] = {}  # ocr_dir → 不可用原因（进程内记忆，避免逐查询重算指纹）


def _default_ocr_dir() -> str:
    from .corpus import OCR_DIR
    return OCR_DIR


def _enabled() -> bool:
    try:
        from ..config import settings
        return bool(getattr(settings, "rag_semantic_enabled", True))
    except Exception:
        return True


def _min_cos() -> float:
    try:
        from ..config import settings
        return float(getattr(settings, "rag_semantic_min_cos", 0.35))
    except Exception:
        return 0.35


def corpus_fingerprint(ocr_dir: str) -> str | None:
    """语料指纹：全部 body_*.txt 的 (文件名, 字节数, 内容) SHA1 前 16 位。

    缓存与语料**内容**强绑定（不含 mtime——git clone / Docker COPY 会改时间戳）：
    语料任何增删改都换指纹 → 运行时判不匹配即关语义路，需重跑 build_semantic_cache.py。
    """
    import glob as _g
    files = sorted(_g.glob(os.path.join(ocr_dir, "body_*.txt")))
    if not files:
        return None
    h = hashlib.sha1()
    h.update(str(len(files)).encode())
    for f in files:
        with open(f, "rb") as fh:
            data = fh.read()
        h.update(os.path.basename(f).encode())
        h.update(str(len(data)).encode())
        h.update(data)
    return h.hexdigest()[:16]


def _chunks(text: str) -> list[str]:
    """页文本 → 编码切片。尾部 <24 字残片丢弃（≤23 字内容损失可忽略，BM25 路兜底精确词召回）。"""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= CHUNK_CHARS:
        return [text]
    out = [text[i:i + CHUNK_CHARS] for i in range(0, len(text), CHUNK_STRIDE)]
    return [c for c in out if len(c) >= 24] or [text[:CHUNK_CHARS]]


def _encode(model, texts: list[str]):
    import numpy as np
    vecs = np.asarray(list(model.embed(list(texts))), dtype="float32")
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0.0] = 1.0
    return vecs / norms


def _get_model():
    """fastembed 模型单例（首次调用触发加载；缺模型文件时由 fastembed 走 HF 下载）。"""
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        # 缓存目录可经 YAOZHI_FASTEMBED_CACHE 指到数据卷（容器内 /srv/data/...），
        # 避免容器重建后重复下载 100MB 模型；未设置时用 fastembed 默认位置。
        cache_dir = os.environ.get("YAOZHI_FASTEMBED_CACHE") or None
        _model = TextEmbedding(MODEL_NAME, cache_dir=cache_dir)
        log.info("语义模型已加载：%s", MODEL_NAME)
    return _model


def _get_state(ocr_dir: str | None) -> dict | None:
    """惰性装载页向量缓存；依赖/缓存/指纹任一不满足 → None（并记忆原因）。"""
    global _state, _state_dir
    d = os.path.abspath(ocr_dir) if ocr_dir else _default_ocr_dir()
    if _state is not None and _state_dir == d:
        return _state
    if d in _unavailable:
        return None
    with _STATE_LOCK:
        if _state is not None and _state_dir == d:
            return _state
        fp = corpus_fingerprint(d)
        if fp is None:
            _unavailable[d] = f"语料缺失（{d} 下无 body_*.txt）"
            return None
        if not os.path.exists(_CACHE_FILE):
            _unavailable[d] = f"语义缓存缺失（{_CACHE_FILE}），先在 backend 下跑 build_semantic_cache.py"
            return None
        try:
            import numpy as np
            z = np.load(_CACHE_FILE, allow_pickle=False)
            meta = json.loads(str(z["meta"]))
        except Exception as e:
            _unavailable[d] = f"语义缓存读取失败：{e}"
            return None
        if meta.get("fingerprint") != fp:
            _unavailable[d] = (f"语料指纹不匹配（缓存 {meta.get('fingerprint')} ≠ 语料 {fp}），"
                               "语料已变更，需重跑 build_semantic_cache.py")
            return None
        try:
            import fastembed  # noqa: F401 运行时查询编码依赖；未装 → 语义路关闭
        except Exception as e:
            _unavailable[d] = f"fastembed 未安装：{e}"
            return None
        _state = {"vectors": z["vectors"], "pages": z["pages"], "meta": meta}
        _state_dir = d
        log.info("语义检索就绪：%d 页 / %d 片，模型 %s，指纹 %s",
                 meta.get("pages"), meta.get("chunks"), meta.get("model"), fp)
        return _state


def search(query: str, k: int = 4, ocr_dir: str | None = None,
           min_cos: float | None = None) -> list[tuple[int, float]]:
    """语义检索教材页：返回 [(pdf_page, cos)] 按分数降序（≤k 条）；不可用/异常 → []。"""
    if not query or not _enabled():
        return []
    st = _get_state(ocr_dir)
    if st is None:
        return []
    if min_cos is None:
        min_cos = _min_cos()
    try:
        q = _encode(_get_model(), [QUERY_PREFIX + query])[0]
        scores = st["vectors"] @ q
    except Exception as e:
        log.warning("语义编码/检索失败，本轮退回纯 BM25：%s", e)
        return []
    best: dict[int, float] = {}  # 片级余弦 → 页级 max 池化
    for pg, sc in zip(st["pages"].tolist(), scores.tolist()):
        if sc > best.get(pg, float("-inf")):
            best[pg] = sc
    hits = [(pg, sc) for pg, sc in best.items() if sc >= min_cos]
    hits.sort(key=lambda t: (-t[1], t[0]))
    return hits[:max(0, k)]


def build_cache(ocr_dir: str | None = None, force: bool = False,
                warmup: bool = False) -> dict:
    """预构建页向量缓存（仅 CLI：backend/build_semantic_cache.py；请求链路绝不调用）。

    warmup=True：缓存已新鲜时仍加载模型并试编码一条（Docker 镜像构建期预热，
    避免容器首查触发 100MB 模型下载或离线环境失败）。
    """
    from .corpus import load_pages
    d = os.path.abspath(ocr_dir) if ocr_dir else _default_ocr_dir()
    pages = load_pages(d)
    if not pages:
        return {"ok": False, "reason": f"语料缺失：{d}"}
    fp = corpus_fingerprint(d)
    out = {"ok": True, "model": MODEL_NAME, "pages": len(pages),
           "fingerprint": fp, "cache": _CACHE_FILE}
    if not force and os.path.exists(_CACHE_FILE):
        try:
            import numpy as np
            meta = json.loads(str(np.load(_CACHE_FILE, allow_pickle=False)["meta"]))
            if meta.get("fingerprint") == fp:
                out["cached"] = True
                out["chunks"] = meta.get("chunks")
                out["dim"] = meta.get("dim")
                if not warmup:
                    return out
        except Exception:
            pass
    t0 = time.time()
    model = _get_model()  # 首次调用下载模型（HF_ENDPOINT 镜像，~100MB 一次）
    chunks: list[str] = []
    owners: list[int] = []
    for p in pages:
        for c in _chunks(p.text):
            chunks.append(c)
            owners.append(p.pdf_page)
    vecs = _encode(model, chunks)
    import numpy as np
    meta = {"model": MODEL_NAME, "dim": int(vecs.shape[1]), "fingerprint": fp,
            "pages": len(pages), "chunks": len(chunks),
            "built_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    os.makedirs(_CACHE_DIR, exist_ok=True)
    np.savez_compressed(_CACHE_FILE, vectors=vecs,
                        pages=np.asarray(owners, dtype="int32"),
                        meta=np.array(json.dumps(meta, ensure_ascii=False)))
    _encode(model, [QUERY_PREFIX + "预热"])  # 触发 tokenizer/onnx 运行时初始化
    _invalidate()
    out.update(cached=False, chunks=len(chunks), dim=int(vecs.shape[1]),
               seconds=round(time.time() - t0, 1))
    return out


def status(ocr_dir: str | None = None) -> dict:
    """语义路诊断信息（供调试 / 管理接口）。"""
    d = os.path.abspath(ocr_dir) if ocr_dir else _default_ocr_dir()
    st = _get_state(d)
    if st is not None:
        m = st["meta"]
        return {"enabled": _enabled(), "available": True, "model": m.get("model"),
                "pages": m.get("pages"), "chunks": m.get("chunks"),
                "fingerprint": m.get("fingerprint"), "reason": None}
    return {"enabled": _enabled(), "available": False, "model": MODEL_NAME,
            "pages": None, "chunks": None, "fingerprint": None,
            "reason": _unavailable.get(d, "未知")}


def _invalidate():
    """缓存文件变更后失效进程内状态（build_cache 重建后调用）。"""
    global _state, _state_dir
    _state = None
    _state_dir = None
    _unavailable.clear()


def reset_for_tests():
    """测试隔离：清空语义路全部进程内状态（缓存状态 / 模型单例 / 不可用记忆）。"""
    global _state, _state_dir, _model
    _state = None
    _state_dir = None
    _model = None
    _unavailable.clear()
