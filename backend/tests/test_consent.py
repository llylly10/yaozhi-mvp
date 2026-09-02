"""US-0 同意门回归测试（需求文档 v0.5 US-0 / 实施方案 v1.1 §合规）。

盯紧四条容易被回归破坏的规则：
  1. 三份文档未全部勾选 → 403，同意门生效
  2. 撤回需二次确认（confirm=true），否则 400
  3. 撤回后任何学习数据读写 → 403，且数据进入删除流程
  4. 撤回后重新勾选同意 → 旧数据物理清除（不得复用）
  5. 删除回执可凭流水号留存核对；到期清理（days=0 即时物理删除）
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_consent.db"
settings.seed_on_startup = True

from app.main import app  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402

Base.metadata.create_all(engine)
from seed.seed import seed  # noqa: E402

_s = SessionLocal()
try:
    seed(_s)
finally:
    _s.close()

client = TestClient(app)


def fresh_user() -> str:
    r = client.post("/sessions/demo", json={"account": f"cs-{uuid.uuid4().hex[:8]}",
                                            "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    return r.json()["user_id"]


def consent(uid: str) -> None:
    r = client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True})
    assert r.status_code == 200, r.text


def first_question_id(uid: str) -> str:
    qs = client.get(f"/users/{uid}/assessment").json()["questions"]
    return qs[0]["id"]


def test_consent_requires_all_three():
    uid = fresh_user()
    # 只勾两份 → 应拒绝
    r = client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": False})
    assert r.status_code == 403
    # 三份齐全 → 通过
    consent(uid)


def test_withdraw_requires_confirm():
    uid = fresh_user()
    consent(uid)
    # 未二次确认 → 400
    r = client.post(f"/users/{uid}/consent/withdraw", json={"confirm": False})
    assert r.status_code == 400
    # 确认 → 200，带流水号回执
    r = client.post(f"/users/{uid}/consent/withdraw", json={"confirm": True})
    assert r.status_code == 200
    body = r.json()
    assert body["receipt"].startswith("DEL-")
    assert body["physical_delete_after_days"] == 30


def test_access_blocked_after_withdraw():
    uid = fresh_user()
    consent(uid)
    qid = first_question_id(uid)
    # 先产生一条作答
    client.post("/attempts", json={
        "user_id": uid, "question_id": qid, "selected_option": "A",
        "idempotency_key": f"ivk-{uuid.uuid4().hex[:8]}"})
    # 撤回
    client.post(f"/users/{uid}/consent/withdraw", json={"confirm": True})
    # 撤回后所有数据入口拒绝
    assert client.get(f"/users/{uid}/wrong-book").status_code == 403
    assert client.post("/attempts", json={
        "user_id": uid, "question_id": qid, "selected_option": "A",
        "idempotency_key": f"ivk2-{uuid.uuid4().hex[:8]}"}).status_code == 403
    assert client.get(f"/users/{uid}/learning-plan").status_code == 403
    assert client.get(f"/users/{uid}/profile-summary").status_code == 403
    assert client.get(f"/users/{uid}/mastery").status_code == 403


def test_reconsent_purges_old_data():
    uid = fresh_user()
    consent(uid)
    qid = first_question_id(uid)
    client.post("/attempts", json={
        "user_id": uid, "question_id": qid, "selected_option": "A",
        "idempotency_key": f"ivk-{uuid.uuid4().hex[:8]}"})
    # 撤回
    w = client.post(f"/users/{uid}/consent/withdraw", json={"confirm": True}).json()
    assert w["receipt"].startswith("DEL-")
    # 重新同意 → 返回 purged_previous_attempts >= 1
    r = client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True})
    assert r.status_code == 200
    assert r.json().get("purged_previous_attempts", 0) >= 1


def test_deletion_receipt_and_purge():
    uid = fresh_user()
    consent(uid)
    w = client.post(f"/users/{uid}/consent/withdraw", json={"confirm": True}).json()
    receipt = w["receipt"]
    # 回执可查
    r = client.get(f"/users/{uid}/deletion-receipt")
    assert r.status_code == 200
    assert r.json()["receipt"] == receipt
    # days=0 强制即时物理删除（days 为查询参数）
    p = client.post("/admin/purge-withdrawn?days=0")
    assert p.status_code == 200
    purged = [x for x in p.json()["purged"] if x["user_id"] == uid]
    assert purged, "撤回用户应被物理删除"
    assert purged[0]["receipt"] == receipt
