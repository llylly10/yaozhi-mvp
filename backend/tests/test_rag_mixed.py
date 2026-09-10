"""双路混合检索单测（2026-09-10）：教材页 + 题库解析。

隔离：临时 sqlite（仅建 tiku_questions / syllabus_chapters 相关表）+ 临时微型教材目录，
不依赖 538 页真实教材与主库；每例前后 reset_for_tests() 清索引缓存。
"""
import os
import sys

import pytest

_BACKEND = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, _BACKEND)
sys.path.insert(0, os.path.join(_BACKEND, "app"))

# 注意：这里**不能** import app.db——app.db 在首次 import 时就按当时的 settings.database_url
# 固定全局 engine，会污染其它测试模块（test_study_map 等）的库指向。故本文件用自建临时库。
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.models import Base, SyllabusChapter, TikuQuestion  # noqa: E402
from app.rag.retriever import (  # noqa: E402
    best_window, reset_for_tests, retrieve_mixed, retrieve_top_k,
)

_TMP_DB = "./test_rag_mixed.db"


def _mk_tiny_corpus(tmp_path):
    d = tmp_path / "ocr"
    d.mkdir()
    (d / "body_001.txt").write_text(
        "阿托品阻断M胆碱受体，引起散瞳、口干、心率加快。阿托品禁用于闭角型青光眼。",
        encoding="utf-8")
    (d / "body_002.txt").write_text(
        "毛果芸香碱激动M胆碱受体，引起缩瞳、降低眼压，用于青光眼治疗。",
        encoding="utf-8")
    return str(d)


@pytest.fixture()
def env(tmp_path):
    """建临时库（2 章 + 3 题）+ 微型教材目录，返回 (db, ocr_dir)。"""
    eng = create_engine(f"sqlite:///{_TMP_DB}")
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    db.add(SyllabusChapter(book_chapter_no=7, title="作用于肾上腺素受体的药物"))
    db.add(SyllabusChapter(book_chapter_no=8, title="局部麻醉药"))
    db.add(TikuQuestion(
        paper_no="01", qid=139, type="A1",
        stem="利多卡因属于哪一类局部麻醉药", options=[{"key": "A", "text": "酰胺类"}],
        answer="A", chapter_ref="CH8", review_status="published",
        analysis="利多卡因是酰胺类局麻药，通过阻断电压门控钠通道产生局麻作用，作用快而强。"))
    db.add(TikuQuestion(
        paper_no="02", qid=7, type="A1",
        stem="普鲁卡因与利多卡因的主要区别", options=[{"key": "A", "text": "化学结构类别不同"}],
        answer="A", chapter_ref="CH8", review_status="published",
        analysis="普鲁卡因为酯类，利多卡因为酰胺类；酯类易被血浆假性胆碱酯酶水解，作用较短。"))
    db.add(TikuQuestion(  # 未发布：不得作为证据源进入检索
        paper_no="03", qid=1, type="A1", stem="未发布题不应被检索",
        options=[], answer="A", chapter_ref="CH8", review_status="draft",
        analysis="未通过审核的解析不得进入检索语料。"))
    db.commit()
    reset_for_tests()
    yield db, _mk_tiny_corpus(tmp_path)
    db.close()
    eng.dispose()
    reset_for_tests()


def test_item_index_excludes_unpublished(env):
    """只有 published 题进入第二检索源（draft 解析不得作为证据展示）。"""
    db, ocr = env
    hits = retrieve_mixed("未发布题不应被检索", k=4, db=db, ocr_dir=ocr)
    codes = [h.code for h in hits if h.source == "itembank"]
    assert "03-001" not in codes


def test_mixed_retrieval_finds_itembank_only_term(env):
    """教材语料里根本没有"利多卡因"→ 旧单路会漏；新双路应命中题库解析。"""
    db, ocr = env
    hits = retrieve_mixed("利多卡因是哪一类局麻药", k=4, db=db, ocr_dir=ocr)
    assert hits, "应有命中"
    it = [h for h in hits if h.source == "itembank"]
    assert it, "题库路必须召回（教材页无该词）"
    assert it[0].code == "01-139"
    assert "第8章 局部麻醉药" == it[0].chapter


def test_mixed_covers_both_sources(env):
    """k=4 且两路都有命中时，结果必须同时包含教材与题库（跨源互补保底）。"""
    db, ocr = env
    hits = retrieve_mixed("阿托品散瞳与毛果芸香碱缩瞳的区别", k=4, db=db, ocr_dir=ocr)
    sources = {h.source for h in hits}
    assert "textbook" in sources, sources
    # 教材两页都命中时，题库路仍要被保底带入
    assert "itembank" in sources, sources
    assert len(hits) <= 4


def test_scores_normalized_within_source(env):
    """各路 top1 归一化到 1.0，其余 ≤1.0，保证跨路可比。"""
    db, ocr = env
    hits = retrieve_mixed("局麻药利多卡因普鲁卡因", k=4, db=db, ocr_dir=ocr)
    for src in ("textbook", "itembank"):
        vals = [h.score for h in hits if h.source == src]
        assert all(0.0 <= v <= 1.0 for v in vals), vals


def test_mixed_degrades_to_textbook_without_db(env):
    """db=None（无库场景/旧调用）→ 退化为纯教材路，不报错。"""
    db, ocr = env
    hits = retrieve_mixed("阿托品散瞳", k=2, db=None, ocr_dir=ocr)
    assert hits and all(h.source == "textbook" for h in hits)


def test_best_window_picks_relevant_span():
    """整页长文本里挑出与问题最贴近的窗口，而非固定取开头。"""
    noise = "无关内容" * 200          # 1200 字噪声
    gold = "利多卡因是酰胺类局麻药，阻断钠通道。" * 3
    text = noise + gold + noise
    win = best_window(text, "利多卡因酰胺类局麻药", size=200)
    assert "利多卡因" in win
    assert len(win) <= 200


def test_retrieve_top_k_backward_compatible(env):
    """兼容接口仍只走教材路，行为与升级前一致（诊断证据链路依赖）。"""
    db, ocr = env
    hits = retrieve_top_k("阿托品散瞳", k=1, ocr_dir=ocr)
    assert hits and hits[0].page == 1
    assert hits[0].source == "textbook"
