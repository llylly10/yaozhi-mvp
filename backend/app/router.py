import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import (
    Attempt, DiagnosticDomain, DiagnosisSession, DemoUser, FollowupNode,
    Misconception, Question, TrainingSession, TrainingSessionQuestion, audit,
)
from .diagnosis import engine as dx
from .mastery import engine as mastery

router = APIRouter()


# ---------- 演示账号（US-0 同意门） ----------

class DemoSessionIn(BaseModel):
    consent: bool = Field(..., description="须为 true：已阅读并同意隐私与使用说明")


@router.post("/sessions/demo")
def create_demo_session(body: DemoSessionIn, db: Session = Depends(get_db)):
    if not body.consent:
        raise HTTPException(403, "须先同意隐私与使用说明")
    user = DemoUser(consented=True)
    db.add(user)
    db.commit()
    audit(db, str(user.id), "consent.granted", f"user:{user.id}")
    return {"user_id": user.id, "display_name": user.display_name}


# ---------- 作答提交（幂等） ----------

class AttemptIn(BaseModel):
    user_id: str
    question_id: str
    selected_option: str
    rationale: str | None = None
    confidence: str | None = None
    time_spent: int | None = None
    idempotency_key: str


@router.post("/attempts", status_code=202)
def submit_attempt(body: AttemptIn, db: Session = Depends(get_db)):
    dup = db.execute(select(Attempt).where(Attempt.idempotency_key == body.idempotency_key)).scalar_one_or_none()
    if dup:
        session = db.execute(select(DiagnosisSession).where(
            DiagnosisSession.attempt_id == dup.id)).scalar_one_or_none()
        return {"attempt_id": dup.id, "session_id": session.id if session else None,
                "state": session.state if session else None, "idempotent_replay": True}
    question = db.get(Question, body.question_id)
    if not question or question.review_status != "published":
        raise HTTPException(404, "题目不存在或未发布")
    attempt = Attempt(user_id=body.user_id, question_id=question.id,
                      selected_option=body.selected_option,
                      is_correct=(body.selected_option == question.answer),
                      rationale=body.rationale, confidence=body.confidence,
                      time_spent=body.time_spent, idempotency_key=body.idempotency_key)
    db.add(attempt)
    db.commit()
    session = dx.start_session(db, attempt)
    return {"attempt_id": attempt.id, "session_id": session.id,
            "state": session.state, "is_correct": attempt.is_correct}


# ---------- 诊断查询与追问 ----------

@router.get("/diagnoses/{session_id}")
def get_diagnosis(session_id: str, db: Session = Depends(get_db)):
    s = db.get(DiagnosisSession, session_id) or _404()
    attempt = db.get(Attempt, s.attempt_id)
    question = db.get(Question, attempt.question_id)
    card = None
    if s.state == "diagnosed":
        m = db.get(Misconception, s.hypothesis_id)
        from .models import DiagnosisEvidence
        evidences = db.execute(select(DiagnosisEvidence).where(
            DiagnosisEvidence.session_id == s.id)).scalars().all()
        card = {
            "misconception": {"code": m.code, "name": m.name, "category": m.category},
            "evidence_level": s.evidence_level,
            "evidences": [{"type": e.evidence_type, "source": e.source_ref, "content": e.content}
                          for e in evidences],
        }
    followup = dx.current_followup(db, s)
    return {
        "session_id": s.id, "state": s.state, "chain_focus": s.chain_focus,
        "followup_count": s.followup_count, "question": {"code": question.code, "stem": question.stem},
        "is_correct": attempt.is_correct, "answer": question.answer,
        "card": card,
        "followup": None if followup is None else {
            "node_id": followup.id, "question_text": followup.question_text,
            "options": followup.options, "turn_max": dx.MAX_FOLLOWUP_ROUNDS,
        },
    }


@router.post("/diagnoses/{session_id}/followups")
def answer_followup(session_id: str, body: dict, db: Session = Depends(get_db)):
    s = db.get(DiagnosisSession, session_id) or _404()
    try:
        s = dx.answer_followup(db, s, body)
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"state": s.state, "evidence_level": s.evidence_level,
            "followup_count": s.followup_count, "chain_focus": s.chain_focus}


@router.post("/diagnoses/{session_id}/skip-followup")
def skip_followup(session_id: str, db: Session = Depends(get_db)):
    s = db.get(DiagnosisSession, session_id) or _404()
    try:
        s = dx.answer_followup(db, s, {"skip": True})
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"state": s.state, "evidence_level": s.evidence_level}


# ---------- 训练与掌握度 ----------

@router.get("/training/{session_id}")
def get_training(session_id: str, db: Session = Depends(get_db)):
    s = db.get(DiagnosisSession, session_id) or _404()
    ts = db.execute(select(TrainingSession).where(TrainingSession.diagnosis_id == s.id)).scalar_one_or_none()
    if ts is None:
        if s.state != "diagnosed":
            raise HTTPException(409, f"会话状态 {s.state} 不能开始训练")
        ts = dx.start_training(db, s)
    rows = db.execute(select(TrainingSessionQuestion).where(
        TrainingSessionQuestion.training_session_id == ts.id).order_by(
        TrainingSessionQuestion.sequence_no)).scalars().all()
    return {"training_id": ts.id, "status": ts.status,
            "questions": [{"id": r.question_id, "stem": db.get(Question, r.question_id).stem,
                           "options": db.get(Question, r.question_id).options} for r in rows]}


class TrainingSubmitIn(BaseModel):
    """answers: {question_id: option_key}，服务端判分（后端为唯一事实来源）。"""
    answers: dict[str, str]


@router.post("/training/{training_id}/submit")
def submit_training(training_id: str, body: TrainingSubmitIn, db: Session = Depends(get_db)):
    ts = db.get(TrainingSession, training_id) or _404()
    rows = db.execute(select(TrainingSessionQuestion).where(
        TrainingSessionQuestion.training_session_id == ts.id)).scalars().all()
    correct = sum(
        1 for r in rows
        if body.answers.get(r.question_id) == db.get(Question, r.question_id).answer)
    ts.score = round(correct / max(len(rows), 1), 3)
    ts.status = "completed"
    s = db.get(DiagnosisSession, ts.diagnosis_id)
    s.state = "retesting" if ts.score >= 0.6 else "diagnosed"
    attempt = db.get(Attempt, s.attempt_id)
    question = db.get(Question, attempt.question_id)
    m = db.get(Misconception, s.hypothesis_id)
    mastery.transition(db, attempt.user_id, question.domain_id, m.category,
                       "training_passed" if ts.score >= 0.6 else "training_failed")
    db.commit()
    return {"training_id": ts.id, "score": ts.score, "session_state": s.state}


@router.get("/mastery/me")
def my_mastery(user_id: str, db: Session = Depends(get_db)):
    from .models import MasteryState
    rows = db.execute(select(MasteryState).where(MasteryState.user_id == user_id)).scalars().all()
    return [{"domain": r.domain_id, "category": r.category, "state": r.state, "reason": r.reason}
            for r in rows]


@router.get("/domains")
def list_domains(db: Session = Depends(get_db)):
    rows = db.execute(select(DiagnosticDomain).where(
        DiagnosticDomain.status == "published")).scalars().all()
    return [{"id": d.id, "code": d.code, "name": d.name, "chapter_ref": d.chapter_ref,
             "mastery_threshold": float(d.mastery_threshold)} for d in rows]


@router.get("/questions")
def list_questions(domain: str | None = None, usage: str = "diagnostic", db: Session = Depends(get_db)):
    """题目清单（演示/摸底用）。正式摸底卷接口 W3 提供（/courses/{id}/assessment）。"""
    stmt = select(Question).where(Question.usage == usage, Question.review_status == "published")
    if domain:
        stmt = stmt.where(Question.domain_id == domain)
    rows = db.execute(stmt).scalars().all()
    return [{"id": q.id, "code": q.code, "stem": q.stem, "options": q.options, "type": q.type}
            for q in rows]


@router.get("/questions/{question_id}")
def get_question(question_id: str, db: Session = Depends(get_db)):
    """演示/摸底取题。正式摸底卷接口 W3 提供（/courses/{id}/assessment）。"""
    q = db.get(Question, question_id) or _404()
    return {"id": q.id, "code": q.code, "stem": q.stem, "options": q.options, "type": q.type}


def _404():
    raise HTTPException(404, "资源不存在")
