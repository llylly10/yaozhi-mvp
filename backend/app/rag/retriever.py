"""检索门面：BM25 词法（默认） + 语义 embedding（可插拔升级项）。

- 首次调用按 settings.rag_enabled 惰性建索引（~58 万字，一次 ~0.5-1s 内存索引）。
- 语料缺失 / rag_enabled=false → 返回空检索结果（上层静默跳过，不影响诊断链路）。
- SemanticMiniLMRetriever：本地 all-MiniLM-L6-v2 已在 HF 缓存（888M，含 onnx），
  库 sentence_transformers 尚未装。接口与 BM25 相同（retrieve(query,k)），
  待装库后把 get_retriever 的默认实现换成它即可无痛升级；云 Qwen embedding 同理。
"""
from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass

from .bm25 import BM25Index
from .corpus import load_pages

log = logging.getLogger("yaozhi.rag")

_INDEX_LOCK = threading.Lock()
_cached_index: BM25Index | None = None
_init_attempted = False


@dataclass
class Hit:
    page: int
    book_page: int
    chapter: str
    text: str
    score: float


def _build_index(ocr_dir: str | None = None) -> BM25Index:
    """惰性构建全局索引（线程安全）。语料缺失返回空索引。"""
    global _cached_index, _init_attempted
    if _cached_index is not None or _init_attempted:
        return _cached_index or BM25Index([])
    with _INDEX_LOCK:
        if _cached_index is not None or _init_attempted:
            return _cached_index or BM25Index([])
        _init_attempted = True
        pages = load_pages(ocr_dir)
        if not pages:
            log.info("RAG：教材 OCR 语料缺失，检索关闭（no-op）。dir=%s", ocr_dir)
            _cached_index = BM25Index([])
        else:
            _cached_index = BM25Index(pages)
            log.info("RAG：BM25 索引就绪，%d 页（语料 %s）", len(pages), ocr_dir or "默认")
    return _cached_index


def reset_for_tests():
    """测试隔离：清空缓存索引，允许换语料目录重建。"""
    global _cached_index, _init_attempted
    _cached_index = None
    _init_attempted = False


def _rag_enabled() -> bool:
    try:
        from ..config import settings
        return bool(getattr(settings, "rag_enabled", True))
    except Exception:
        return True


def retrieve_top_k(query: str, k: int = 3, min_score: float = 0.0,
                   ocr_dir: str | None = None) -> list[Hit]:
    """按 query 检索教材 top-k 页。语料缺失/关闭 → []。"""
    if not query or not _rag_enabled():
        return []
    idx = _build_index(ocr_dir)
    if idx.empty:
        return []
    out: list[Hit] = []
    for page, score in idx.search(query, k=k, min_score=min_score):
        out.append(Hit(page=page.pdf_page, book_page=page.book_page,
                       chapter=page.chapter, text=page.text, score=round(float(score), 4)))
    return out


def get_retriever(ocr_dir: str | None = None):
    """语义 embedding 预留：目前返回 BM25 门面函数；将来换 SemanticMiniLMRetriever。"""
    return lambda q, k=3: retrieve_top_k(q, k=k, ocr_dir=ocr_dir)


class SemanticMiniLMRetriever:
    """（计划态占位）本地语义 embedding 检索。

    前提：装 sentence_transformers 并指向已缓存的 all-MiniLM-L6-v2。
    用法：句向量建库 + 查询向量余弦 topk；中文贴合中等偏低。接入点与 BM25 相同。
    """

    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        raise NotImplementedError(
            "语义 embedding 为计划态：先装 sentence_transformers 并离线加载模型后再启用。"
            "当前默认走 BM25 词法检索（get_retriever）。")
