"""RAG 检索模块单测（2026-09-08）。

用临时小语料目录隔离，不依赖 538 页真实教材，离线可跑。
覆盖：tokenize、BM25 命中正确页、retrieve_top_k、语料缺失 no-op。
"""
import os
import sys

import pytest

# 允许在未装包环境下直接 import app.rag（conftest 未约束路径时）
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

from app.rag import bm25  # noqa: E402
from app.rag.retriever import reset_for_tests, retrieve_top_k  # noqa: E402


@pytest.fixture()
def tiny_corpus(tmp_path):
    """构造 3 页微型"教材"，页内容含药理术语，用于断言检索排序。"""
    import app.rag.retriever as r
    d = tmp_path / "ocr"
    d.mkdir()
    (d / "body_001.txt").write_text("局麻药利多卡因阻断钠通道。利多卡因是酰胺类局麻药。", encoding="utf-8")
    (d / "body_002.txt").write_text("抗结核药异烟肼抑制分枝杆菌细胞壁合成。异烟肼引起周围神经炎可用维生素B6预防。", encoding="utf-8")
    (d / "body_003.txt").write_text("阿托品阻断M胆碱受体，引起散瞳、口干、心率加快。", encoding="utf-8")
    reset_for_tests()
    yield str(d)
    reset_for_tests()


def test_tokenize_mixes_latin_and_cjk():
    toks = bm25.tokenize("利多卡因 lidocaine Na通道")
    # 拉丁整词应存在（>=2 长度）
    assert "lidocaine" in toks
    # 中文 2/3-gram 应存在
    assert "利多" in toks and "利多卡" in toks
    assert "通道" in toks


def test_bm25_hits_correct_page(tiny_corpus):
    hits = retrieve_top_k("利多卡因局麻", k=1, ocr_dir=tiny_corpus)
    assert hits, "应有命中"
    assert hits[0].page == 1  # body_001 利多卡因
    assert hits[0].score > 0


def test_bm25_discriminates_drug(tiny_corpus):
    # 异烟肼应排到 body_002，而不是其它页
    hits = retrieve_top_k("异烟肼抗结核", k=1, ocr_dir=tiny_corpus)
    assert hits and hits[0].page == 2


def test_retrieve_graceful_no_corpus():
    reset_for_tests()
    assert retrieve_top_k("阿托品", k=1, ocr_dir="/nonexistent/dir") == []


def test_corpus_load_pages_sorted(tiny_corpus):
    from app.rag import corpus
    pages = corpus.load_pages(tiny_corpus)
    nums = [p.pdf_page for p in pages]
    assert nums == sorted(nums) == [1, 2, 3]
    # 每页文本已清洗（无孤立行噪声的连续串）
    assert all(len(p.text) > 10 for p in pages)
