"""纯 Python BM25（词法检索，免费本地零 key）。

中文不做分词：以"术语/关键词"为导向的检索更适合按字典字串匹配（药名、机制词多为
2-6 字专业术语）。故这里采用 **CJK n-gram(2~4) 混合 + 拉丁词干** 的轻量 tokenizer，
对"利多卡因/局麻/β受体拮抗药"这类组合能稳定命中，对整句语义不敏感——这正是
词法检索的定位：召回"提到该术语的教材页"，语义精排交给后续（rerank/追问）。

标量 BM25 参数用标准 k1=1.5, b=0.75。
"""
from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass, field

from .corpus import Page

_LATIN = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_\-\/\.]*")
_CJK = re.compile(r"[\u4e00-\u9fff]")


def tokenize(text: str) -> list[str]:
    """中英混合 token 化：英文/数字整词；中文连续段切 2-gram 与 3-gram。"""
    toks: list[str] = []
    # 拉丁/数字词
    for m in _LATIN.finditer(text):
        t = m.group(0).lower()
        if len(t) >= 2:
            toks.append(t)
    # 中文：剥离非汉字符后对整段汉字串做 n-gram（中文无词界，术语靠 2/3-gram 命中）。
    # 教材正文多为长连续汉字，直接在整个汉字串上滑窗，避免词/句切分依赖。
    zh = "".join(_CJK.findall(text))
    if zh:
        for n in (2, 3):
            if len(zh) < n:
                continue
            toks.extend(zh[i:i + n] for i in range(len(zh) - n + 1))
        if len(zh) == 1:
            toks.append(zh)
    return toks


@dataclass
class _Doc:
    id: int
    obj: object                 # 任意文档对象（Page / Item / str）
    toks: list[str]
    tf: Counter = field(default_factory=Counter)
    dl: int = 0

    def __post_init__(self):
        self.tf = Counter(self.toks)
        self.dl = len(self.toks)


class BM25:
    """通用 BM25 索引：docs 为任意对象列表，texts 为对应可检索文本。

    教材页与题库解析共用同一套打分；两路的分数**不可直接跨路比较**（语料规模、文档
    长度分布不同），混合检索时由上层按各自 top1 做归一化后再融合（见 retriever）。
    """

    def __init__(self, docs: list, texts: list[str], k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.docs: list[_Doc] = []
        self.df: Counter[str] = Counter()
        self.avgdl: float = 0.0
        self._n: int = 0
        if docs:
            self._build(docs, texts)

    def _build(self, docs: list, texts: list[str]):
        for i, (obj, text) in enumerate(zip(docs, texts)):
            d = _Doc(id=i, obj=obj, toks=tokenize(text))
            self.docs.append(d)
            for t in set(d.toks):
                self.df[t] += 1
        self._n = len(self.docs)
        self.avgdl = sum(d.dl for d in self.docs) / self._n if self._n else 0.0

    @property
    def empty(self) -> bool:
        return self._n == 0

    @property
    def n(self) -> int:
        """文档数（供上层计算文档频率 / 稀有词）。"""
        return self._n

    def _score(self, qf: Counter, doc: _Doc) -> float:
        s = 0.0
        for term, q_count in qf.items():
            df = self.df.get(term, 0)
            if df == 0:
                continue
            idf = math.log(1 + (self._n - df + 0.5) / (df + 0.5))
            tf = doc.tf.get(term, 0)
            if tf == 0:
                continue
            denom = tf + self.k1 * (1 - b_norm(self.b, doc.dl, self.avgdl))
            s += idf * q_count * tf * (self.k1 + 1) / denom
        return s

    def _tiebreak(self, doc: _Doc):
        return doc.id

    def search(self, query: str, k: int = 3, min_score: float = 0.0) -> list[tuple[object, float]]:
        """返回按分降序的 (doc, score)。空语料/无命中返回 []。"""
        if self.empty or not query:
            return []
        qf = Counter(tokenize(query))
        scored = [(d, self._score(qf, d)) for d in self.docs]
        scored = [(d, s) for d, s in scored if s > min_score]
        scored.sort(key=lambda x: (-x[1], self._tiebreak(x[0])))
        return [(d.obj, s) for d, s in scored[:k]]


def b_norm(b: float, dl: int, avgdl: float) -> float:
    """b * dl / avgdl，avgdl 为 0 时退化为 0（空语料保护）。"""
    return 0.0 if not avgdl else b * dl / avgdl


class BM25Index(BM25):
    """教材页索引（Page 为文档单元），兼容早期调用签名 BM25Index(pages)。"""

    def __init__(self, pages: list[Page], k1: float = 1.5, b: float = 0.75):
        super().__init__(pages, [p.text for p in pages], k1=k1, b=b)

    def _tiebreak(self, doc: _Doc):
        return getattr(doc.obj, "pdf_page", doc.id)

    def search(self, query: str, k: int = 3, min_score: float = 0.0) -> list[tuple[Page, float]]:
        return super().search(query, k=k, min_score=min_score)
