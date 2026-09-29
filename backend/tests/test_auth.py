"""W2 账号鉴权回归测试（2026-09-28 补齐）：密码注册/登录、Bearer token 门禁、
归属校验（路径 user_id / 请求体 user_id / 会话作用域）、登出撤销、管理密钥。

设计基线：YAOZHI_AUTH_REQUIRED 默认 false（本地开发/既有测试零改动）；
本模块用 fixture 临时开启并在结束时恢复，不影响其他测试模块的执行。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_auth.db"
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

client = TestClient(app)

ADMIN_KEY = "test-admin-key"


@pytest.fixture(autouse=True)
def _auth_env():
    """本模块临时开启鉴权与管理密钥，结束恢复原值（settings 是进程级单例）。"""
    old_req, old_key = settings.auth_required, settings.admin_key
    settings.auth_required = True
    settings.admin_key = ADMIN_KEY
    yield
    settings.auth_required, settings.admin_key = old_req, old_key


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def register(password: str | None = None, account: str | None = None) -> tuple[str, dict]:
    acc = account or f"au-{uuid.uuid4().hex[:8]}"
    body: dict = {"account": acc, "invite_code": "DEMO2026"}
    if password:
        body["password"] = password
    r = client.post("/sessions/demo", json=body)
    assert r.status_code == 200, r.text
    return acc, r.json()


def consent(uid: str, token: str) -> None:
    r = client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True},
        headers=_auth(token))
    assert r.status_code == 200, r.text


def test_register_with_password_then_login():
    acc, j = register(password="pw-123456")
    assert j["has_password"] is True and j["token"]
    r = client.post("/auth/login", json={"account": acc, "password": "pw-123456"})
    assert r.status_code == 200 and r.json()["token"]
    # 错误密码 → 401
    r = client.post("/auth/login", json={"account": acc, "password": "wrong"})
    assert r.status_code == 401
    # 已设密码账号走 /sessions/demo：不带密码 → 401；带正确密码、不带邀请码 → 200
    r = client.post("/sessions/demo", json={"account": acc, "invite_code": "DEMO2026"})
    assert r.status_code == 401
    r = client.post("/sessions/demo", json={"account": acc, "password": "pw-123456"})
    assert r.status_code == 200 and r.json()["user_id"] == j["user_id"]


def test_passwordless_invite_login_compat():
    """存量无密码账号：凭邀请码进入（W1 兼容），本次可顺手设密码。"""
    acc, j = register()  # 不带密码
    assert j["has_password"] is False and j["token"]
    r = client.post("/sessions/demo", json={"account": acc, "invite_code": "DEMO2026"})
    assert r.status_code == 200 and r.json()["user_id"] == j["user_id"]
    # 无密码账号密码登录应拒绝（尚无凭据）
    r = client.post("/auth/login", json={"account": acc, "password": "whatever"})
    assert r.status_code == 401
    # 首次设密码后，邀请码登录对其停用
    r = client.post("/sessions/demo", json={"account": acc, "invite_code": "DEMO2026",
                                            "password": "new-pw"})
    assert r.status_code == 200 and r.json()["has_password"] is True
    r = client.post("/sessions/demo", json={"account": acc, "invite_code": "DEMO2026"})
    assert r.status_code == 401


def test_token_gate_and_ownership():
    _, a = register(password="pw-a")
    _, b = register()  # B 无密码，凭邀请码
    # 无 token → 401
    r = client.get(f"/users/{a['user_id']}/exists")
    assert r.status_code == 401
    # 自己的 token → 200
    r = client.get(f"/users/{a['user_id']}/exists", headers=_auth(a["token"]))
    assert r.status_code == 200
    # 他人 token 访问别人数据 → 403
    r = client.get(f"/users/{b['user_id']}/exists", headers=_auth(a["token"]))
    assert r.status_code == 403


def test_attempt_body_ownership_and_session_scope():
    _, a = register(password="pw-a")
    consent(a["user_id"], a["token"])
    _, b = register()
    qs = client.get(f"/users/{a['user_id']}/assessment", headers=_auth(a["token"])).json()["questions"]
    qid = qs[0]["id"]
    idem = f"auth-{uuid.uuid4().hex[:12]}"
    # 他人 token 冒名提交 → 403
    r = client.post("/attempts", headers=_auth(b["token"]), json={
        "user_id": a["user_id"], "question_id": qid, "selected_option": "Z",
        "idempotency_key": idem})
    assert r.status_code == 403
    # 本人提交 → 202（答错建会话）
    r = client.post("/attempts", headers=_auth(a["token"]), json={
        "user_id": a["user_id"], "question_id": qid, "selected_option": "Z",
        "idempotency_key": idem})
    assert r.status_code == 202, r.text
    sid = r.json().get("session_id")
    assert sid
    # 会话作用域归属：A 可读，B 不可
    r = client.get(f"/diagnoses/{sid}", headers=_auth(a["token"]))
    assert r.status_code == 200
    r = client.get(f"/diagnoses/{sid}", headers=_auth(b["token"]))
    assert r.status_code == 403


def test_logout_revokes_token():
    acc, j = register(password="pw-x")
    hdrs = _auth(j["token"])
    assert client.get(f"/users/{j['user_id']}/exists", headers=hdrs).status_code == 200
    r = client.post("/auth/logout", headers=hdrs)
    assert r.status_code == 200
    assert client.get(f"/users/{j['user_id']}/exists", headers=hdrs).status_code == 401


def test_admin_key_gates():
    _, j = register()
    # 管理密钥未携带 → 403（/admin/* 与 /eval/run）
    assert client.post("/admin/purge-withdrawn").status_code == 403
    assert client.post("/eval/run").status_code == 403
    # 携带正确密钥 → 200（purge 无撤回用户，返回空集，不影响其他测试）
    r = client.post("/admin/purge-withdrawn", headers={"X-Admin-Key": ADMIN_KEY})
    assert r.status_code == 200
    # 公共内容接口不受管理密钥影响
    assert client.get("/domains").status_code == 200


def test_legacy_open_mode_when_disabled():
    """回归：YAOZHI_AUTH_REQUIRED=false 时一切照旧（本地开发/既有脚本零改动）。"""
    settings.auth_required = False
    try:
        _, j = register()
        assert client.get(f"/users/{j['user_id']}/exists").status_code == 200
    finally:
        settings.auth_required = True
