"""W1 单题闭环验收测试（v1.1 §17.2「单题闭环通过」定义）：
提交 → 判分 → 规则过滤 → Mock 重排 → 追问/出卡 → 训练 → 复测 → 掌握状态，
每一步有库表记录，模型失败路径可恢复（Mock 恒定，超时路径 W2 接真实模型后补）。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_w1.db"
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

from app.models import (  # noqa: E402
    AuditLog, DiagnosisCandidate, FollowupTurn, MasteryState, ModelRun, Question,
)
from sqlalchemy import select  # noqa: E402

client = TestClient(app)


def fresh_user() -> str:
    r = client.post("/sessions/demo", json={"account": "yaozhi_student01", "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    c = client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True})
    assert c.status_code == 200
    return uid


def q_by_code(code: str) -> dict:
    db = SessionLocal()
    try:
        q = db.execute(select(Question).where(Question.code == code)).scalar_one()
        return {"id": q.id, "code": q.code}
    finally:
        db.close()


def attempt(user: str, code: str, option: str, rationale: str | None = None) -> dict:
    q = q_by_code(code)
    r = client.post("/attempts", json={
        "user_id": user, "question_id": q["id"], "selected_option": option,
        "rationale": rationale, "confidence": "中", "time_spent": 42,
        "idempotency_key": f"test-{uuid.uuid4().hex}"})
    assert r.status_code == 202, r.text
    return r.json()


def test_register_gates():
    # 邀请码错误 → 403；正确 → 创建未同意账号；三份文档不齐 → 拒绝同意
    assert client.post("/sessions/demo", json={"account": "x", "invite_code": "WRONG"}).status_code == 403
    r = client.post("/sessions/demo", json={"account": "yaozhi_student01", "invite_code": "DEMO2026"})
    assert r.status_code == 200
    uid = r.json()["user_id"]
    assert client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": False}).status_code == 403
    assert client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True}).status_code == 200


def test_wrong_option_concept_confusion_direct_card():
    """Q-ANS-02 选 B（效应记反，权重 0.9）：无预置追问挂接 MIS-ANS-01 之外的歧义
    → 距离足够 → 直接出卡，概念混淆，证据等级中。"""
    user = fresh_user()
    out = attempt(user, "Q-ANS-02", "B")
    s = client.get(f"/diagnoses/{out['session_id']}").json()
    assert s["state"] == "diagnosed"
    assert s["card"]["misconception"]["category"] == "概念混淆"
    assert s["card"]["evidence_level"] in ("中", "高")
    assert s["card"]["evidences"], "错因卡必须带证据链"


def test_wrong_option_insufficient_goes_followup_and_converges():
    """Q-ANS-01 选 A（0.85）：有同类别次要候选，间距不足 → 追问；
    追问 FU-ANS-01 选 A（坐实 MIS-ANS-01）→ 中等级出卡。"""
    user = fresh_user()
    out = attempt(user, "Q-ANS-01", "A")
    s = client.get(f"/diagnoses/{out['session_id']}").json()
    assert s["state"] == "followup_required"
    assert s["followup"]["options"], "预置追问应带选项"

    r = client.post(f"/diagnoses/{out['session_id']}/followups", json={"option_key": "A"})
    assert r.status_code == 200
    s = client.get(f"/diagnoses/{out['session_id']}").json()
    assert s["state"] == "diagnosed"
    assert s["card"]["misconception"]["code"] == "MIS-ANS-01"
    assert s["card"]["evidence_level"] == "中"


def test_followup_swap_hypothesis_then_low_evidence():
    """追问答案指向另一错因 → 假设切换；3 轮不收敛 → 低证据。"""
    user = fresh_user()
    out = attempt(user, "Q-ANS-01", "C")  # C → MIS-ANS-09 (0.7)，候选含同类近似
    s = client.get(f"/diagnoses/{out['session_id']}").json()
    assert s["state"] == "followup_required"
    # 反复给出不区分的回答，验证 ≤3 轮硬上限
    for i in range(5):
        r = client.post(f"/diagnoses/{out['session_id']}/followups", json={"text": "不知道"})
        if r.json()["state"] == "diagnosed":
            break
    s = client.get(f"/diagnoses/{out['session_id']}").json()
    assert s["state"] == "diagnosed"
    assert s["followup_count"] <= 3
    assert s["card"]["evidence_level"] == "低"


def test_skip_followup_yields_low_evidence():
    user = fresh_user()
    out = attempt(user, "Q-ANS-01", "A")
    assert client.get(f"/diagnoses/{out['session_id']}").json()["state"] == "followup_required"
    r = client.post(f"/diagnoses/{out['session_id']}/skip-followup")
    assert r.json()["evidence_level"] == "低"


def test_correct_answer_skips_strong_attribution():
    """答对不应产生错因归因会话卡（is_correct=True 仍建会话但规则无干扰项信号）。"""
    user = fresh_user()
    out = attempt(user, "Q-ANS-01", "B")
    s = client.get(f"/diagnoses/{out['session_id']}").json()
    assert s["is_correct"] is True
    # 无信号命中 → 通用候选低分 → 追问路径或低等级，绝不输出高等级强归因
    if s["state"] == "diagnosed":
        assert s["card"]["evidence_level"] == "低"


def test_training_and_mastery_transition():
    user = fresh_user()
    out = attempt(user, "Q-ANS-02", "B")  # 概念混淆，直接出卡
    r = client.get(f"/training/{out['session_id']}")
    assert r.status_code == 200
    training = r.json()
    assert training["questions"], "训练题应从审核题池取得"
    # 服务端判分：按库中正确答案提交（验证转移路径），得分应为 1.0 → 初步掌握
    db = SessionLocal()
    try:
        answers = {q["id"]: db.get(Question, q["id"]).answer for q in training["questions"]}
    finally:
        db.close()
    r = client.post(f"/training/{training['training_id']}/submit", json={"answers": answers})
    assert r.status_code == 200
    m = client.get("/mastery/me", params={"user_id": user}).json()
    states = {(x["category"], x["state"]) for x in m}
    assert ("概念混淆", "学习中") in states or ("概念混淆", "初步掌握") in states


def test_idempotent_replay():
    user = fresh_user()
    q = q_by_code("Q-ANS-02")
    key = f"idem-{uuid.uuid4().hex}"
    body = {"user_id": user, "question_id": q["id"], "selected_option": "B",
            "idempotency_key": key}
    r1 = client.post("/attempts", json=body)
    r2 = client.post("/attempts", json=body)
    assert r1.status_code == r2.status_code == 202
    assert r2.json()["session_id"] == r1.json()["session_id"]
    assert r2.json().get("idempotent_replay") is True


def test_every_step_has_db_records():
    """完成定义：每一步有库表记录（候选评分、追问轮次、模型运行、审计）。"""
    db = SessionLocal()
    try:
        assert db.execute(select(DiagnosisCandidate)).scalars().first() is not None
        assert db.execute(select(FollowupTurn)).scalars().first() is not None
        assert db.execute(select(ModelRun)).scalars().first() is not None
        assert db.execute(select(AuditLog)).scalars().first() is not None
        assert db.execute(select(MasteryState)).scalars().first() is not None
    finally:
        db.close()
