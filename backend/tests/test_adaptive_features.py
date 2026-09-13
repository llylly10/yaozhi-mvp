import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings

settings.database_url = "sqlite:///./test_adaptive.db"
settings.seed_on_startup = True

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.db import Base, SessionLocal, engine, migrate
from app.models import DemoUser, DiagnosisSession, Question, TrainingSession, TrainingSessionQuestion, Attempt
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def init_test_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    migrate()
    from seed.seed import seed as run_seed
    db = SessionLocal()
    try:
        run_seed(db)
    finally:
        db.close()
    yield


@pytest.fixture
def consented_user():
    db = SessionLocal()
    try:
        u = DemoUser(display_name="自适应测试生", consented=True)
        db.add(u)
        db.commit()
        db.refresh(u)
        user_id = str(u.id)
    finally:
        db.close()
    return user_id


def test_custom_quiz_config_and_generation(consented_user):
    # 1. 配置接口
    res = client.get(f"/users/{consented_user}/custom-quiz/config")
    assert res.status_code == 200
    data = res.json()
    assert "chapters" in data and len(data["chapters"]) > 0
    assert "cognitive_levels" in data
    assert "difficulties" in data
    assert "preset_modes" in data and len(data["preset_modes"]) == 4

    # 2. 组卷接口
    gen_res = client.post(
        f"/users/{consented_user}/custom-quiz/generate",
        json={"mode": "exam_sprint", "total_count": 5}
    )
    assert gen_res.status_code == 200
    gen_data = gen_res.json()
    assert gen_data["total"] >= 1
    assert len(gen_data["questions"]) >= 1
    q0 = gen_data["questions"][0]
    assert "stem" in q0 and "options" in q0 and "cognitive_level" in q0

    # 3. 提交与 BKT 实时打分联动
    q_id = q0["id"]
    ans_key = q0["options"][0]["key"]
    sub_res = client.post(
        f"/users/{consented_user}/custom-quiz/submit",
        json={
            "quiz_id": gen_data["quiz_id"],
            "mode": "exam_sprint",
            "answers": {q_id: ans_key}
        }
    )
    assert sub_res.status_code == 200
    sub_data = sub_res.json()
    assert "score" in sub_data
    assert "domain_breakdown" in sub_data
    assert "cognitive_breakdown" in sub_data
    assert len(sub_data["results"]) == 1


def test_qa_with_context_and_question_linkage(consented_user):
    # 带错题背景向 AI 提问
    res = client.post(
        f"/users/{consented_user}/qa/ask",
        json={
            "question": "阿托品为什么会散瞳？",
            "context": "【错题背景】题目考查 M 受体阻断剂对瞳孔括约肌的作用。"
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert "answer" in data
    assert "refused" in data


def test_learning_plan_bkt_daily_recommendation(consented_user):
    res = client.get(f"/users/{consented_user}/learning-plan")
    assert res.status_code == 200
    data = res.json()
    assert "tasks" in data
    assert "done_tasks" in data
    assert "daily_recommendation" in data
    for t in data["tasks"]:
        assert "bkt_probability" in t
        assert "urgency_score" in t


def test_ai_variant_generation_endpoint(consented_user):
    import uuid
    db = SessionLocal()
    try:
        q = db.execute(select(Question).where(Question.review_status == "published")).scalars().first()
        assert q is not None
        
        att_id = str(uuid.uuid4())
        att = Attempt(id=att_id, user_id=consented_user, question_id=q.id,
                      selected_option="A", is_correct=False,
                      rationale="测试作答", idempotency_key=f"ATT-TEST-{att_id}")
        db.add(att)
        db.flush()

        diag_id = str(uuid.uuid4())
        ds = DiagnosisSession(id=diag_id, attempt_id=att.id, state="diagnosed")
        db.add(ds)
        ts = TrainingSession(diagnosis_id=diag_id, status="in_progress", score=0.0)
        db.add(ts)
        db.flush()
        db.add(TrainingSessionQuestion(training_session_id=ts.id, question_id=q.id, sequence_no=0))
        db.commit()
        ts_id = str(ts.id)
    finally:
        db.close()

    res = client.post(f"/training/{ts_id}/generate-ai-variant")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["verified"] is True
    assert data["question"]["is_ai_variant"] is True
    assert "verification_method" in data["question"]
