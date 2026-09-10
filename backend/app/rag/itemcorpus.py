"""题库解析语料（第二检索源，2026-09-10）。

**为什么需要它**：教材 OCR 以「整页」为检索单元，每页约千字且是双栏串行拼起来的破碎文本；
跨药对比、异同类问题（如"阿托品和毛果芸香碱对眼的作用有何不同"）涉及的两处论述往往
不在同一页，BM25 单路召回天然拿不到，模型只能判"依据不足"拒答。

题目解析是**现成的小粒度语料**：
- 已质量审计（2026-09-03）：723 条 published，解析中位 157 字、无占位符、结论与标答冲突 0；
- 单主题聚焦（一道题只讲一个考点），正好补教材页级检索"太粗、跨页召回不了"的短板；
- 自带 chapter_ref（CH<n> ↔ 大纲章号），可直接给出处；
- 与题库/错因/变式训练同源，答案口径一致，不会出现"教材说 A、解析说 B"。

红线不变：只作为**证据切片**供模型 grounded 作答，仍不得凭空作答；题干与解析不因本模块
进入任何对外传播渠道（与教材 OCR 同一版权纪律）。
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_CH = re.compile(r"CH(\d+)")


@dataclass
class Item:
    """一条题库题（检索单元 = 题干 + 选项 + 答案 + 解析）。"""
    code: str            # 展示用题号，如 "01-003"
    stem: str
    options_text: str
    answer: str
    analysis: str
    chapter_ref: str = ""    # 原始值，如 "CH7" / "CH5,CH7"（并列章题）
    chapter_label: str = ""  # 展示标签，如 "第7章 作用于肾上腺素受体的药物"

    @property
    def text(self) -> str:
        """检索文本：题干 + 选项 + 答案 + 解析（解析权重最高，故置于末位但会重复命中）。"""
        parts = [self.stem]
        if self.options_text:
            parts.append(self.options_text)
        if self.answer:
            parts.append(f"答案：{self.answer}")
        if self.analysis:
            parts.append(f"解析：{self.analysis}")
        return "\n".join(parts)


def _chapter_label(chapter_ref: str, chap_map: dict[int, str]) -> str:
    """chapter_ref → 展示标签。并列章题（含逗号）取第一个章号，避免歧义链过长。"""
    if not chapter_ref:
        return ""
    m = _CH.search(chapter_ref)
    if not m:
        return chapter_ref
    no = int(m.group(1))
    title = chap_map.get(no, "")
    return f"第{no}章 {title}" if title else f"第{no}章"


def load_items(db) -> list[Item]:
    """读取 published 且有解析的题库题 → Item 列表。

    db：SQLAlchemy Session（仅本函数内读取，返回的 Item 为纯数据，不持有 session）。
    无数据 / 表缺失 → 返回 []（上层静默跳过，等价于该路检索关闭）。
    """
    if db is None:
        return []
    try:
        from ..models import SyllabusChapter, TikuQuestion
        chap_map = {int(c.book_chapter_no): c.title
                    for c in db.query(SyllabusChapter).all()}
        rows = (db.query(TikuQuestion)
                .filter(TikuQuestion.review_status == "published")
                .all())
    except Exception:
        return []
    out: list[Item] = []
    for r in rows:
        analysis = (r.analysis or "").strip()
        if not analysis:
            continue
        opts = r.options or []
        opt_text = " ".join(f"{o.get('key', '')}.{o.get('text', '')}" for o in opts)
        out.append(Item(
            code=f"{r.paper_no}-{int(r.qid):03d}",
            stem=(r.stem or "").strip(),
            options_text=opt_text.strip(),
            answer=(r.answer or "").strip(),
            analysis=analysis,
            chapter_ref=r.chapter_ref or "",
            chapter_label=_chapter_label(r.chapter_ref or "", chap_map),
        ))
    return out
