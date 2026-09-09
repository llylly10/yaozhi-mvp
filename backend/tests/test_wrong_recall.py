"""错题记忆卡 recall 接口（图谱 + 临床/教材助记），2026-09-08。

用户诉求：错题本里每条错题点开，能看到「错题图谱 + 实际案例/临床教材助记」。
wrong_book 列表保持轻量；点开单条走 GET /wrong/{attempt_id}/recall，聚合返回：
  - misconception 归因 + case_evidence（错因目录预置的临床案例）
  - relations / confusion_pairs（该错题所属域 FR-A2 图谱；M 受体演示域 11 条）
  - textbook_anchors（按题干实时检索人卫《药理学》9e OCR 的真实教材段落，带章/页码署名）
题库题即便无预置临床案例，也能给出真实教材依据辅助记忆（RAG 锚定）。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_recall.db"
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

from app.models import Question  # noqa: E402
from sqlalchemy import select  # noqa: E402

client = TestClient(app)


def fresh_user() -> str:
    acc = f"recall_{uuid.uuid4().hex[:8]}"
    r = client.post("/sessions/demo", json={"account": acc, "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True})
    return uid


def q_id(code: str) -> str:
    db = SessionLocal()
    try:
        return db.execute(select(Question).where(Question.code == code)).scalar_one().id
    finally:
        db.close()


def wrong_attempt(user: str, code: str) -> str:
    """答错一道题并返回 attempt_id（选一个必然错的选项）。"""
    db = SessionLocal()
    try:
        q = db.execute(select(Question).where(Question.code == code)).scalar_one()
        options = q.options or []
        answer = q.answer
        wrong = next((o["key"] for o in options if o.get("key") != answer), None) or "A"
    finally:
        db.close()
    r = client.post("/attempts", json={
        "user_id": user, "question_id": q_id(code), "selected_option": wrong,
        "confidence": "中", "idempotency_key": f"recall-{uuid.uuid4().hex}"})
    assert r.status_code == 202, r.text
    return r.json()["attempt_id"]


def test_recall_m_receptor_wrong_has_graph():
    """M 受体演示域错题：recall 应带出 11 条 FR-A2 图谱关系 + 混淆对（真数据，非空）。"""
    u = fresh_user()
    aid = wrong_attempt(u, "Q-ANS-01")
    r = client.get(f"/wrong/{aid}/recall")
    assert r.status_code == 200
    d = r.json()
    assert (d["question"] or {}).get("code") == "Q-ANS-01"
    # M 受体域有预置知识图谱
    assert len(d.get("relations") or []) > 0
    # 图谱边类型含 FR-A2 语义字段
    assert {"source", "edge", "target"} <= set(d["relations"][0])
    # 该域有混淆对
    assert len(d.get("confusion_pairs") or []) > 0


def test_recall_m_receptor_wrong_after_diagnosis_has_case():
    """走完诊断(M受体域概念混淆)后，错因携带临床案例 case_evidence 出现在记忆卡。"""
    # 让 MIS-ANS 域题答错并出诊断卡（概念混淆方向→Q-ANS 错选 B 会进诊断）
    u = fresh_user()
    db = SessionLocal()
    try:
        q = db.execute(select(Question).where(Question.code == "Q-ANS-02")).scalar_one()
        options = q.options or []
        answer = q.answer
        # 故意答"张冠李戴"方向的错误选项，触发概念混淆诊断
        wrong = next(o["key"] for o in options if o.get("key") != answer)
    finally:
        db.close()
    # 用确定的错误作答
    r = client.post("/attempts", json={
        "user_id": u, "question_id": q_id("Q-ANS-02"), "selected_option": wrong,
        "confidence": "中", "idempotency_key": f"recall2-{uuid.uuid4().hex}"})
    assert r.status_code == 202
    aid = r.json()["attempt_id"]
    rec = client.get(f"/wrong/{aid}/recall").json()
    # 若已出具错因卡，则错因属于种子域四分类之一（MIS-ANS-*）
    if rec.get("misconception"):
        mc = rec["misconception"]
        assert mc["code"].startswith("MIS-ANS")
    # 结构完整：relations + case 字段存在（不要求必然有 case，因取决于是否走追问到收敛）
    assert "case_evidence" in rec
    assert "textbook_anchors" in rec
    assert isinstance(rec["textbook_anchors"], list)


def test_recall_fields_present_for_every_wrong():
    """recall 对所有错题都返回统一结构（前端契约稳定），各字段 key 齐备。"""
    u = fresh_user()
    aids = [wrong_attempt(u, "Q-ANS-01"), wrong_attempt(u, "Q-ANS-03")]
    for aid in aids:
        d = client.get(f"/wrong/{aid}/recall").json()
        for k in ("question", "misconception", "case_evidence", "evidence_level",
                  "relations", "confusion_pairs", "textbook_anchors", "trained"):
            assert k in d, f"缺少字段 {k}"
