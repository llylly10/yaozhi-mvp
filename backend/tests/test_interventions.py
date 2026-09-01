"""错因×干预四形态回归测试（v1.1 §5.3）。

背景：`ecb5632` 落地四种干预形态（改 router.py 54 行）时未加测试。本文件补护栏，
重点盯两条容易被后续重构破坏的规则：
  1. 知识遗忘类只给记忆卡、不推刷题（文档里的核心差异化，前端不渲染不等于接口没发）
  2. 情境拆解先筛情境题再补足 3 道（先取 3 道再筛会只剩 1 道，已发生过）
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_interventions.db"
settings.seed_on_startup = True

from app.main import app  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402

Base.metadata.create_all(engine)  # TestClient 不带上下文不触发 startup，显式建库+种子
from seed.seed import seed  # noqa: E402

_s = SessionLocal()
try:
    seed(_s)
finally:
    _s.close()

from sqlalchemy import select  # noqa: E402

from app.models import Question  # noqa: E402

client = TestClient(app)


def fresh_user() -> str:
    r = client.post("/sessions/demo", json={"account": f"iv-{uuid.uuid4().hex[:8]}",
                                            "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    assert client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True}).status_code == 200
    return uid


def training_for(question_code: str, option: str) -> dict:
    """走完「答错→出卡→训练」，返回 /training 载荷。"""
    user = fresh_user()
    db = SessionLocal()
    try:
        qid = db.execute(select(Question).where(Question.code == question_code)).scalar_one().id
    finally:
        db.close()
    r = client.post("/attempts", json={
        "user_id": user, "question_id": qid, "selected_option": option,
        "confidence": "中", "time_spent": 30, "idempotency_key": f"iv-{uuid.uuid4().hex}"})
    assert r.status_code == 202, r.text
    t = client.get(f"/training/{r.json()['session_id']}")
    assert t.status_code == 200, t.text
    return t.json()


def test_memory_card_mode_gives_cards_not_questions():
    """知识遗忘类 → 记忆卡，不推刷题。"""
    t = training_for("Q-ANS-02", "D")  # MIS-ANS-04 知识遗忘
    assert t["mode"] == "记忆卡"
    assert t["cards"], "记忆卡形态必须有卡片内容"
    assert all(c["front"] and c["back"] for c in t["cards"]), "卡片正反两面都要有内容"
    assert t["questions"] == [], "记忆卡形态不应返回刷题题目"


def test_memory_card_submit_is_self_assessed_pass():
    """记忆卡无答题：空 answers = 自评完成，进入复测。"""
    t = training_for("Q-ANS-02", "D")
    r = client.post(f"/training/{t['training_id']}/submit", json={"answers": {}})
    assert r.status_code == 200, r.text
    assert r.json()["score"] == 1.0
    assert r.json()["session_state"] == "retesting"


def test_confusion_pair_variant_mode_returns_three_questions():
    t = training_for("Q-ANS-01", "A")  # MIS-ANS-01 概念混淆
    assert t["mode"] == "混淆对变式"
    assert len(t["questions"]) == 3


def test_chain_reteach_mode_returns_chain_node_summary():
    """机制理解类 → 先给断环环节的讲解文本，再练变式。"""
    t = training_for("Q-ANS-01", "D")  # MIS-ANS-03 机制理解不足
    assert t["mode"] == "断环重讲"
    assert t["reteach"], "断环重讲必须给出链环讲解"
    assert {"level", "title", "summary"} <= set(t["reteach"])
    assert t["reteach"]["summary"], "讲解文本不能为空"
    assert len(t["questions"]) == 3


def test_context_training_puts_context_question_first():
    """审题应用类 → 情境题排在最前，并补足 3 道训练量。

    当前训练题池只有 1 道情境题（Q-ANS-08），所以只断言排序与题量，
    不断言「全是情境题」——那需要顾问补内容，不是代码能保证的。
    """
    t = training_for("Q-ANS-06", "A")  # MIS-ANS-08 审题与应用失误
    assert t["mode"] == "情境拆解"
    assert len(t["questions"]) == 3, "情境拆解也要补足 3 道，不能只剩 1 道"
    db = SessionLocal()
    try:
        types = [db.get(Question, q["id"]).condition_type for q in t["questions"]]
    finally:
        db.close()
    assert types[0] != "normal", f"情境题应排在最前，实际顺序：{types}"
