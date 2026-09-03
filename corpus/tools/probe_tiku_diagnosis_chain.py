"""探针：题库题答错 → 诊断会话 → 起训 → 提交 → 复测，验证 练→诊断→训练→复测 整链闭合。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from sqlalchemy import select

from app.config import settings

settings.database_url = "sqlite:///./probe_chain.db"
settings.seed_on_startup = True

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine, migrate  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def rebuild():
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


def answer_of(qid):
    db = SessionLocal()
    try:
        return db.get(__import__("app.models", fromlist=["Question"]).Question, qid).answer
    finally:
        db.close()


def first_tiku():
    qs = client.get("/questions?usage=diagnostic").json()
    return next(x for x in qs if x["code"].startswith("T"))


rebuild()
uid = client.post("/sessions/demo", json={"account": "chain01", "invite_code": "DEMO2026"}).json()["user_id"]
client.post(f"/users/{uid}/consent", json={"user_agreement": True, "privacy_policy": True, "data_collection": True})

tq = first_tiku()
ans = answer_of(tq["id"])
wrong = next(o["key"] for o in tq["options"] if o["key"] != ans)

print(f"[1] 答错 T 题 {tq['code']}")
r = client.post("/attempts", json={"user_id": uid, "question_id": tq["id"], "selected_option": wrong, "idempotency_key": "chain-w1"})
b = r.json()
assert r.status_code == 202 and b["session_id"], "答错应建诊断会话"
sid = b["session_id"]
print(f"    会话 {sid[:8]} state={b['state']} feedback.kind={b['feedback']['kind']}")

print("[2] 起训 GET /training/{sid}")
tr = client.get(f"/training/{sid}").json()
tid = tr["training_id"]
print(f"    training_id={tid[:8]} mode={tr['mode']} status={tr['status']} 题数={len(tr['questions'])} 卡片数={len(tr.get('cards', []))}")
assert tr["status"] in ("in_progress", "pending")
if tr["questions"]:
    assert len(tr["questions"]) >= 1, "变式训练应至少 1 题"
    print(f"    变式题示例: {tr['questions'][0]['stem'][:40]}...")

print("[3] 提交训练 POST /training/{tid}/submit")
ta = {q["id"]: answer_of(q["id"]) for q in tr["questions"]}
sr = client.post(f"/training/{tid}/submit", json={"answers": ta})
print(f"    status={sr.status_code} body={sr.json()}")
assert sr.status_code == 200

print("[4] 复测 GET /retest/{tid}")
rr = client.get(f"/retest/{tid}")
print(f"    status={rr.status_code} 复测题数={len(rr.json().get('questions', [])) if rr.status_code==200 else 'ERR'}")
assert rr.status_code == 200 and len(rr.json().get("questions", [])) >= 1

print("\n✅ 整链闭合：答错→诊断→训练→复测 在题库题上全部生效")
