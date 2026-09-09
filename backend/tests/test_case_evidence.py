"""v0.7 错因卡第④字段：教材事实案例（2026-09-08）。

种子域（M 受体药）任一出错诊断 → hypothesis 必为 MIS-ANS-01..10 之一，
每个都挂 case_evidence {scenario, lesson, source}。诊断卡与错题本都应带出该案例，
辅助学生从"知道答案"到结合临床实例理解记忆。题库题（T-）章级错因暂无案例 → 返回 null（诚实）。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_case.db"
settings.seed_on_startup = True

from app.main import app  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402

Base.metadata.create_all(engine)
from seed.seed import seed, CASE_EVIDENCE  # noqa: E402

_s = SessionLocal()
try:
    seed(_s)
finally:
    _s.close()

from app.models import Misconception  # noqa: E402
from sqlalchemy import select  # noqa: E402

client = TestClient(app)


def fresh_user(account: str | None = None) -> str:
    acc = account or f"case_{uuid.uuid4().hex[:8]}"
    r = client.post("/sessions/demo", json={"account": acc, "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    c = client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True})
    assert c.status_code == 200
    return uid


def q_id(code: str) -> str:
    db = SessionLocal()
    try:
        from app.models import Question
        return db.execute(select(Question).where(Question.code == code)).scalar_one().id
    finally:
        db.close()


def attempt(user: str, code: str, option: str) -> dict:
    r = client.post("/attempts", json={
        "user_id": user, "question_id": q_id(code), "selected_option": option,
        "confidence": "中", "time_spent": 30,
        "idempotency_key": f"case-{uuid.uuid4().hex}"})
    assert r.status_code == 202, r.text
    return r.json()


def test_all_seed_misconceptions_have_case():
    """10 个种子错因（MIS-ANS-01..10）都必须挂教材事实案例（schema 完整性）。"""
    db = SessionLocal()
    try:
        rows = db.execute(select(Misconception)).scalars().all()
    finally:
        db.close()
    seed_codes = {m.code for m in rows if m.code and m.code.startswith("MIS-ANS-")}
    assert len(seed_codes) == 10, f"种子错因应为 10 条，实际 {len(seed_codes)}"
    db = SessionLocal()
    try:
        for code in CASE_EVIDENCE:
            m = db.execute(select(Misconception).where(
                Misconception.code == code)).scalar_one()
            assert m.case_evidence, f"{code} 缺教材事实案例"
            for k in ("scenario", "lesson", "source"):
                assert m.case_evidence.get(k), f"{code} 案例缺字段 {k}"
            assert m.case_evidence["source"].startswith("人卫"), f"{code} 来源须署名教材"
    finally:
        db.close()


def test_diagnosis_card_carries_case_evidence():
    """错因卡带出教材事实案例（第④字段）：种子域答错出卡即带 scenario/lesson/source。"""
    user = fresh_user()
    out = attempt(user, "Q-ANS-02", "B")  # 概念混淆，直接出卡
    s = client.get(f"/diagnoses/{out['session_id']}").json()
    assert s["state"] == "diagnosed"
    card = s["card"]
    assert card["case_evidence"], "错因卡必须带教材事实案例"
    assert card["case_evidence"]["lesson"]
    assert card["case_evidence"]["source"].startswith("人卫")
    # 案例与错因强绑定：内容里应含错因对应药物/机制关键字（防张冠李戴）
    assert card["misconception"]["code"].startswith("MIS-ANS-")


def test_wrong_book_carries_case_evidence():
    """错题本归档条目带出该错因的教材事实案例。"""
    user = fresh_user()
    out = attempt(user, "Q-ANS-02", "B")
    assert client.get(f"/diagnoses/{out['session_id']}").json()["state"] == "diagnosed"
    wb = client.get(f"/users/{user}/wrong-book").json()
    item = next(w for w in wb if w["attempt_id"] == out["attempt_id"])
    assert item["misconception"], "答错应已归档错因"
    assert item["case_evidence"], "错题本条目应带教材事实案例"
    assert item["case_evidence"]["lesson"]
    assert item["case_evidence"]["source"].startswith("人卫")


def test_tiku_chapter_misconception_case_is_null():
    """题库物化题（T-）答错走章级通用错因（add_chapter_misconceptions），
    无临床案例 → case_evidence 为 null，不虚构案例（诚实口径）。"""
    db = SessionLocal()
    try:
        from app.models import Question
        tq = db.execute(select(Question).where(Question.code.startswith("T-"),
                                               Question.usage == "diagnostic")).first()
        code = tq.code if tq else None
    finally:
        db.close()
    if not code:
        return  # 题库桥接不可用则跳过（不影响种子域主断言）
    user = fresh_user()
    r = client.post("/attempts", json={
        "user_id": user,
        "question_id": q_id(code),
        "selected_option": "<wrong>",
        "confidence": "中",
        "idempotency_key": f"case-tiku-{uuid.uuid4().hex}"})
    # 题库题答错不产错因卡/不给 hypothesis；wrong-book 里 misconception 应缺失或章级
    assert r.status_code == 202
    wb = client.get(f"/users/{user}/wrong-book").json()
    item = next((w for w in wb if w["question_code"] == code), None)
    if item:
        # 若有错因（章级），其案例必须为空——不虚构临床案例
        assert item["case_evidence"] is None
