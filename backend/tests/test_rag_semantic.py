# -*- coding: utf-8 -*-
"""语义向量路单测（2026-09-29）。

全部离线确定性：不下载模型、不依赖 fastembed 安装——
- 页级 max 池化 / 门槛过滤 / 排序 / k 截断：monkeypatch 注入伪状态与假编码器；
- 检索器融合（同页取大、语义独有页并入、top_k 补缺）：monkeypatch retriever._semantic_hits；
- 降级行为：合成语料指纹与真实缓存不匹配 → 语义路关闭，检索行为与升级前一致。
"""
import os
import sys

import pytest

_BACKEND = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, _BACKEND)
sys.path.insert(0, os.path.join(_BACKEND, "app"))

from app.rag import retriever as retriever_mod  # noqa: E402
from app.rag import semantic  # noqa: E402
from app.rag.retriever import (  # noqa: E402
    Hit, reset_for_tests, retrieve_mixed, retrieve_top_k,
)


@pytest.fixture(autouse=True)
def _clean():
    reset_for_tests()
    yield
    reset_for_tests()


class _FakeModel:
    """假编码器：任意文本 → 用例注入的固定向量。"""

    def __init__(self, vec):
        self._vec = vec

    def embed(self, texts, **_kw):
        for _ in texts:
            yield list(self._vec)


def _state(vectors, pages):
    import numpy as np
    return {"vectors": np.asarray(vectors, dtype="float32"),
            "pages": np.asarray(pages, dtype="int32"),
            "meta": {"model": "fake", "pages": len(set(pages)), "chunks": len(pages)}}


def test_page_max_pooling_threshold_and_k(monkeypatch):
    # 页1 两片 0.9/0.2 → 页分 0.9（max 池化）；页2 一片 0.5
    monkeypatch.setattr(semantic, "_get_state", lambda ocr_dir: _state(
        [[0.9, 0.0], [0.2, 0.0], [0.5, 0.0]], [1, 1, 2]))
    monkeypatch.setattr(semantic, "_get_model", lambda: _FakeModel([1.0, 0.0]))
    assert semantic.search("任意问题", k=3, ocr_dir="whatever", min_cos=0.35) == [
        (1, pytest.approx(0.9)), (2, pytest.approx(0.5))]
    # 门槛抬到 0.6 → 弱页被过滤
    assert semantic.search("任意问题", k=3, ocr_dir="whatever", min_cos=0.6) == [
        (1, pytest.approx(0.9))]
    # k 截断
    assert semantic.search("任意问题", k=1, ocr_dir="whatever", min_cos=0.35) == [
        (1, pytest.approx(0.9))]


def test_semantic_disabled_by_config(monkeypatch):
    monkeypatch.setattr(semantic, "_get_state", lambda ocr_dir: _state([[1.0, 0.0]], [7]))
    monkeypatch.setattr(semantic, "_get_model", lambda: _FakeModel([1.0, 0.0]))
    from app.config import settings
    monkeypatch.setattr(settings, "rag_semantic_enabled", False)
    assert semantic.search("任意", k=3) == []


def test_encode_failure_degrades_to_empty(monkeypatch):
    # 编码/模型异常 → 空结果不抛出（与"检索失败不阻塞诊断/问答"策略一致）
    monkeypatch.setattr(semantic, "_get_state", lambda ocr_dir: _state([[1.0, 0.0]], [7]))

    def _boom():
        raise RuntimeError("onnx down")

    monkeypatch.setattr(semantic, "_get_model", _boom)
    assert semantic.search("任意", k=3) == []


def test_chunks_boundaries():
    assert semantic._chunks("短文本") == ["短文本"]
    cs = semantic._chunks("药" * 1000)
    assert all(len(c) >= 24 for c in cs)
    assert sum(len(c) for c in cs) >= 950  # 重叠切片需覆盖正文


def test_unavailable_without_matching_cache(tmp_path):
    # 合成语料指纹 ≠ 真实缓存（或环境无缓存）→ 语义路关闭且给出原因，检索返回空不抛错
    d = tmp_path / "ocr"
    d.mkdir()
    (d / "body_001.txt").write_text("利多卡因是酰胺类局部麻醉药。", encoding="utf-8")
    assert semantic.search("利多卡因", k=2, ocr_dir=str(d)) == []
    st = semantic.status(str(d))
    assert st["available"] is False and st["reason"]


def test_reset_for_tests_clears_state():
    semantic._state = {"vectors": None, "pages": None, "meta": {}}
    semantic._state_dir = "/x"
    semantic._unavailable["/x"] = "y"
    reset_for_tests()
    assert semantic._state is None and semantic._state_dir is None
    assert semantic._unavailable == {}


def test_retriever_fusion_and_topup(tmp_path, monkeypatch):
    d = tmp_path / "ocr"
    d.mkdir()
    (d / "body_001.txt").write_text("阿托品阻断M胆碱受体，引起散瞳、口干、心率加快。", encoding="utf-8")
    (d / "body_002.txt").write_text("胰岛素促进组织摄取葡萄糖，降低血糖，用于糖尿病治疗。", encoding="utf-8")
    q = "阿托品散瞳"

    def fake_semantic_hits(query, k, ocr_dir):
        assert ocr_dir == str(d)
        return [Hit(source="textbook", text="", chapter="", score=0.6, raw_score=0.6,
                    page=2, book_page=0, label="教材 第X章 p2", semantic=True)]

    monkeypatch.setattr(retriever_mod, "_semantic_hits", fake_semantic_hits)

    # retrieve_mixed：BM25 命中页1（满分 1.0），语义独有页2（0.6）并入候选
    hits = retrieve_mixed(q, k=3, db=None, ocr_dir=str(d))
    pages = [h.page for h in hits]
    assert 1 in pages and 2 in pages
    assert pages.index(1) < pages.index(2)  # BM25 满分仍居首
    assert not next(h for h in hits if h.page == 1).semantic

    # retrieve_top_k：BM25 仅 1 页命中（<k=2）→ 语义页补缺
    top = retrieve_top_k(q, k=2, ocr_dir=str(d))
    assert [h.page for h in top] == [1, 2]
    assert top[1].semantic


def test_fusion_same_page_takes_max(tmp_path, monkeypatch):
    d = tmp_path / "ocr"
    d.mkdir()
    (d / "body_001.txt").write_text("阿托品阻断M胆碱受体，引起散瞳、口干、心率加快。", encoding="utf-8")
    (d / "body_002.txt").write_text("胰岛素促进组织摄取葡萄糖，降低血糖，用于糖尿病治疗。", encoding="utf-8")
    q = "阿托品散瞳"

    def fake_semantic_hits(query, k, ocr_dir):
        # 页1 BM25 归一化分=1.0，语义 0.98 → 取大者 1.0 且不打语义标记；页2 语义 0.7 并入
        return [Hit(source="textbook", text="", chapter="", score=0.98, raw_score=0.98,
                    page=1, book_page=0, label="教材 第X章 p1", semantic=True),
                Hit(source="textbook", text="", chapter="", score=0.7, raw_score=0.7,
                    page=2, book_page=0, label="教材 第X章 p2", semantic=True)]

    monkeypatch.setattr(retriever_mod, "_semantic_hits", fake_semantic_hits)
    hits = retrieve_mixed(q, k=3, db=None, ocr_dir=str(d))
    h1 = next(h for h in hits if h.page == 1)
    assert h1.score == pytest.approx(1.0) and not h1.semantic  # BM25 更高，保持原样
