"""问 AI（课程问答）回归：同意门 / 用药拒绝 / 无命中拒答 / Mock 摘录 / 空问题。

Provider 说明：测试环境无 QWEN key，凡走到生成步的用例均断言 mock 降级；
真模型分支由 answer_with_refs 的单元契约覆盖（见 test_llm_provider，如有）。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_qa.db"
settings.seed_on_startup = True

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine, migrate  # noqa: E402
from app.main import app  # noqa: E402
from app.rag.retriever import Hit  # noqa: E402

client = TestClient(app)


def _rebuild():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    migrate()
    from seed.seed import seed as run_seed
    db = SessionLocal()
    try:
        run_seed(db)
        db.commit()
    finally:
        db.close()


def _new_user(account: str = "qa_stu01") -> str:
    r = client.post("/sessions/demo", json={"account": account, "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    return r.json()["user_id"]


def _consent(uid: str):
    r = client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True})
    assert r.status_code == 200, r.text


def _fake_hits():
    """混合检索桩：1 条教材 + 1 条题库，覆盖双源引用结构。"""
    return [
        Hit(source="textbook", page=70, book_page=61,
            chapter="第5章 传出神经系统药理概论",
            text="阿托品为M胆碱受体阻断药，可散瞳、升高眼压，闭角型青光眼禁用。",
            score=1.0, raw_score=9.9,
            label="教材 第5章 传出神经系统药理概论 p61"),
        Hit(source="itembank", code="01-003", chapter="第6章 作用于胆碱受体的药物",
            text="题干：阿托品对眼的作用是\nA.缩瞳 B.散瞳\n答案：B\n解析：阻断M受体致瞳孔括约肌松弛。",
            score=0.8, raw_score=7.2,
            label="题库 01-003 第6章 作用于胆碱受体的药物"),
    ]


def test_qa_requires_consent():
    """未完成知情同意 → 403（问答采集对话原文，须先过同意门）。"""
    _rebuild()
    uid = _new_user("qa_noconsent")
    r = client.post(f"/users/{uid}/qa/ask", json={"question": "阿托品为什么散瞳"})
    assert r.status_code == 403, r.text


def test_qa_empty_question_422():
    _rebuild()
    uid = _new_user("qa_empty")
    _consent(uid)
    r = client.post(f"/users/{uid}/qa/ask", json={"question": "   "})
    assert r.status_code == 422, r.text


def test_qa_refuses_medication_without_model():
    """用药决策类：规则前置拒绝，不调模型不检索。"""
    _rebuild()
    uid = _new_user("qa_med")
    _consent(uid)
    r = client.post(f"/users/{uid}/qa/ask",
                    json={"question": "我孩子发烧能吃布洛芬吗，剂量多少"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["refused"] is True and body["refuse_reason"] == "medication"
    assert body["provider"] == "rule" and body["citations"] == []
    assert "不提供用药建议" in body["answer"]


def test_qa_no_evidence_refusal(monkeypatch):
    """无检索命中（教材 + 题库双路皆空）→ 诚实拒答。"""
    _rebuild()
    uid = _new_user("qa_noev")
    _consent(uid)
    monkeypatch.setattr("app.rag.retrieve_mixed", lambda *a, **k: [])
    r = client.post(f"/users/{uid}/qa/ask", json={"question": "阿托品为什么散瞳"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["refused"] is True and body["refuse_reason"] == "no_evidence"


def test_external_provider_defaults_qwen(monkeypatch):
    """外部 Provider 默认 qwen3.7-flash/阿里云百炼地址；external_* 优先，qwen_* 仅回退；无 key 抛错。"""
    from app.config import settings as cfg
    from app.llm import provider as pv
    monkeypatch.setattr(cfg, "external_api_key", "")
    monkeypatch.setattr(cfg, "qwen_api_key", "")
    monkeypatch.delenv("YAOZHI_EXTERNAL_API_KEY", raising=False)
    monkeypatch.delenv("YAOZHI_QWEN_API_KEY", raising=False)
    try:
        pv.ExternalApiProvider()
        raise AssertionError("无 key 应抛 ProviderError")
    except Exception as e:
        assert "YAOZHI_EXTERNAL_API_KEY" in str(e)
    monkeypatch.setattr(cfg, "external_api_key", "test-key")
    monkeypatch.setattr(cfg, "external_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    p = pv.ExternalApiProvider()
    assert p.model == "qwen3.7-flash", p.model
    assert p._base_url == "https://dashscope.aliyuncs.com/compatible-mode/v1", p._base_url
    # qwen 回退链
    monkeypatch.setattr(cfg, "external_api_key", "")
    monkeypatch.setattr(cfg, "external_model", "")
    monkeypatch.setattr(cfg, "external_base_url", "")
    monkeypatch.setattr(cfg, "qwen_api_key", "qwen-key")
    monkeypatch.setattr(cfg, "qwen_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    p2 = pv.ExternalApiProvider()
    assert p2._api_key == "qwen-key" and p2.model == "qwen3.7-flash"


def test_qa_mock_fallback_with_citations(monkeypatch):
    """无 key 环境 → Mock 摘录降级，引用与检索切片一一对应（含双源字段）。"""
    from app.config import settings as cfg
    from app.llm import provider as pv
    monkeypatch.setattr(cfg, "external_api_key", "")
    monkeypatch.setattr(cfg, "qwen_api_key", "")
    monkeypatch.delenv("YAOZHI_EXTERNAL_API_KEY", raising=False)
    monkeypatch.delenv("YAOZHI_QWEN_API_KEY", raising=False)
    pv._cached_external = None
    _rebuild()
    uid = _new_user("qa_mock")
    _consent(uid)
    monkeypatch.setattr("app.rag.retrieve_mixed", lambda *a, **k: _fake_hits())
    r = client.post(f"/users/{uid}/qa/ask", json={"question": "阿托品为什么散瞳"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == "mock" and body["refused"] is False
    assert len(body["citations"]) == 2
    sources = {c["source"] for c in body["citations"]}
    assert sources == {"textbook", "itembank"}, sources
    tb = next(c for c in body["citations"] if c["source"] == "textbook")
    it = next(c for c in body["citations"] if c["source"] == "itembank")
    assert tb["book_page"] == 61 and "第5章" in tb["chapter"]
    assert it["code"] == "01-003" and "第6章" in it["chapter"]
