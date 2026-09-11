"""艾宾浩斯抗遗忘长时记忆复测系统测试（ADR-Retest-01）

覆盖三个应用场景：
1. 今日待办预警胶囊（获取到期胶囊、答题晋升/打回机制）
2. 错题本记忆衰退度与一键唤醒
3. 章节学习前置温故知新微测
"""
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
settings.database_url = "sqlite:///./test_retest.db"
settings.seed_on_startup = True

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.db import Base, SessionLocal, engine, migrate  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Attempt, DiagnosticDomain, Question  # noqa: E402

client = TestClient(app)

# 初始化测试数据库结构
Base.metadata.create_all(engine)
migrate()
from seed.seed import seed as run_seed  # noqa: E402
_init_db = SessionLocal()
try:
    run_seed(_init_db)
    _init_db.commit()
finally:
    _init_db.close()


def _new_user(account_prefix: str = "retest") -> str:
    acc = f"{account_prefix}_{uuid.uuid4().hex[:6]}"
    r = client.post("/sessions/demo", json={"account": acc, "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    return r.json()["user_id"]


def _consent(user_id: str):
    return client.post(
        f"/users/{user_id}/consent",
        json={"user_agreement": True, "privacy_policy": True, "data_collection": True},
    )


def test_retest_capsule_get_and_promote():
    """场景一测试：获取今日待办胶囊，并作答通过促进艾宾浩斯阶段晋级（阶段2 -> 阶段3）。"""
    uid = _new_user("retest_capsule")
    _consent(uid)

    # 1) 获取胶囊（自动为新用户初始化临界待复测数据）
    r = client.get(f"/users/{uid}/retest-capsule")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["has_capsule"] is True
    assert data["stage"] in (1, 2)
    assert "retention_pct" in data
    assert len(data["questions"]) >= 1

    sched_id = data["schedule_id"]
    q = data["questions"][0]

    # 获取该题正确答案
    db = SessionLocal()
    try:
        q_db = db.get(Question, q["id"])
        correct_ans = q_db.answer
    finally:
        db.close()

    # 2) 提交正确作答
    answers = {q["id"]: correct_ans}
    if len(data["questions"]) > 1:
        q2 = data["questions"][1]
        db = SessionLocal()
        try:
            q2_db = db.get(Question, q2["id"])
            answers[q2["id"]] = q2_db.answer
        finally:
            db.close()

    sub_r = client.post(
        f"/users/{uid}/retest-capsule/submit",
        json={"schedule_id": sched_id, "answers": answers},
    )
    assert sub_r.status_code == 200, sub_r.text
    sub_data = sub_r.json()
    assert sub_data["passed"] is True
    assert sub_data["score"] >= 0.5
    assert sub_data["new_stage"] == 3  # 晋升至阶段3（7天稳态）
    assert sub_data["next_due_days"] == 7
    assert sub_data["memory_boost"] >= 90


def test_retest_capsule_failure_resets_to_stage1():
    """场景一测试：复测未通过时打回阶段 1，24小时后重新安排复测。"""
    uid = _new_user("retest_fail")
    _consent(uid)

    r = client.get(f"/users/{uid}/retest-capsule")
    assert r.status_code == 200
    data = r.json()
    sched_id = data["schedule_id"]
    q = data["questions"][0]

    # 提交错误选项
    answers = {q["id"]: "Z"}
    if len(data["questions"]) > 1:
        answers[data["questions"][1]["id"]] = "Z"

    sub_r = client.post(
        f"/users/{uid}/retest-capsule/submit",
        json={"schedule_id": sched_id, "answers": answers},
    )
    assert sub_r.status_code == 200
    sub_data = sub_r.json()
    assert sub_data["passed"] is False
    assert sub_data["new_stage"] == 1  # 重置为阶段1
    assert sub_data["next_due_days"] == 1


def test_wrong_book_memory_decay_and_awaken():
    """场景二测试：错题本展示记忆衰退度指标（retention_pct、decay_level）并支持一键唤醒。"""
    uid = _new_user("decay")
    _consent(uid)

    db = SessionLocal()
    try:
        q = db.execute(select(Question)).scalars().first()
        two_days_ago = datetime.now(timezone.utc) - timedelta(hours=48)
        att = Attempt(
            user_id=uid,
            question_id=q.id,
            selected_option="Z",
            is_correct=False,
            idempotency_key=uuid.uuid4().hex,
            created_at=two_days_ago,
        )
        db.add(att)
        db.commit()
        db.refresh(att)
        att_id = att.id
    finally:
        db.close()

    # 查错题本
    wb_r = client.get(f"/users/{uid}/wrong-book")
    assert wb_r.status_code == 200
    items = wb_r.json()
    assert len(items) >= 1
    found = next((x for x in items if x["attempt_id"] == att_id), None)
    assert found is not None
    assert "retention_pct" in found
    assert found["decay_level"] in ("fresh", "warning", "critical")
    assert found["days_since"] >= 1.5

    # 测试场景二的一键抗遗忘唤醒
    awk_r = client.post(
        f"/users/{uid}/wrong-book/awaken",
        json={"attempt_id": att_id},
    )
    assert awk_r.status_code == 200
    awk_data = awk_r.json()
    assert "question" in awk_data
    assert "hint" in awk_data


def test_chapter_warmup_flow():
    """场景三测试：章节学习前置温故知新微测。"""
    uid = _new_user("warmup")
    _consent(uid)

    db = SessionLocal()
    try:
        dom = db.execute(select(DiagnosticDomain)).scalars().first()
        dom_id = dom.id
    finally:
        db.close()

    # 获取热身微测
    w_r = client.get(f"/users/{uid}/chapters/{dom_id}/warmup")
    assert w_r.status_code == 200
    w_data = w_r.json()
    assert w_data["has_warmup"] is True
    assert "question" in w_data
    q_id = w_data["question"]["id"]

    # 提交热身微测
    sub_r = client.post(
        f"/users/{uid}/chapters/{dom_id}/warmup/submit",
        json={"question_id": q_id, "selected_option": "A"},
    )
    assert sub_r.status_code == 200
    sub_data = sub_r.json()
    assert "is_correct" in sub_data
    assert "correct_answer" in sub_data
    assert "message" in sub_data
