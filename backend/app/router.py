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

DEMO_INVITE_CODE = "DEMO2026"


class DemoSessionIn(BaseModel):
    account: str = Field(default="yaozhi_student01", max_length=32)
    invite_code: str = Field(..., max_length=32)


@router.post("/sessions/demo")
def create_demo_session(body: DemoSessionIn, db: Session = Depends(get_db)):
    """注册（第 1 步）：演示账号 + 邀请码。同意在第 2 步单独记录。"""
    if body.invite_code.strip().upper() != DEMO_INVITE_CODE:
        raise HTTPException(403, "邀请码不正确，请向项目组索取演示邀请码")
    user = DemoUser(consented=False, display_name=body.account.strip() or "演示学生")
    db.add(user)
    db.commit()
    audit(db, str(user.id), "account.registered", f"user:{user.id}", account=body.account)
    return {"user_id": user.id, "display_name": user.display_name}


class ConsentIn(BaseModel):
    user_agreement: bool
    privacy_policy: bool
    data_collection: bool


@router.post("/users/{user_id}/consent")
def record_consent(user_id: str, body: ConsentIn, db: Session = Depends(get_db)):
    """同意（第 2 步）：三份文档须全部同意，个性化功能依赖采集知情同意。"""
    user = db.get(DemoUser, user_id) or _404()
    if not (body.user_agreement and body.privacy_policy and body.data_collection):
        raise HTTPException(403, "三份文档须全部勾选同意")
    user.consented = True
    db.commit()
    audit(db, user_id, "consent.granted", f"user:{user_id}",
          user_agreement=True, privacy_policy=True, data_collection=True,
          doc_version="2026-08-30")
    return {"user_id": user_id, "consented": True}


# ---------- 作答提交（幂等） ----------

class AttemptIn(BaseModel):
    user_id: str
    question_id: str
    selected_option: str
    rationale: str | None = None
    confidence: str | None = None
    time_spent: int | None = None
    idempotency_key: str


@router.get("/users/{user_id}/wrong-book")
def wrong_book(user_id: str, db: Session = Depends(get_db)):
    """错题本：答错的作答 + 已出具的诊断结论。"""
    rows = db.execute(select(Attempt).where(
        Attempt.user_id == user_id, Attempt.is_correct == False)).scalars().all()  # noqa: E712
    out = []
    for a in rows:
        q = db.get(Question, a.question_id)
        s = db.execute(select(DiagnosisSession).where(
            DiagnosisSession.attempt_id == a.id)).scalar_one_or_none()
        mis = db.get(Misconception, s.hypothesis_id) if s and s.hypothesis_id else None
        out.append({
            "attempt_id": a.id, "question_code": q.code, "stem": q.stem,
            "selected": a.selected_option, "answer": q.answer,
            "misconception": {"name": mis.name, "category": mis.category} if mis else None,
            "evidence_level": s.evidence_level if s else None,
            "mastery_state": None,
        })
    return out


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
        # 用户可见的证据链用可读标签，不暴露内部 ID（v1.1 证据化输出）
        label = {"选项标注": "作答记录", "作答理由": "你的解题思路", "追问回答": "追问回答", "知识库切片": "知识点原文"}
        source_label = {"选项标注": f"题目 {question.code}", "作答理由": "", "追问回答": "", "知识库切片": "教材知识点"}
        card = {
            "misconception": {"code": m.code, "name": m.name, "category": m.category},
            "evidence_level": s.evidence_level,
            "evidences": [{"type": label.get(e.evidence_type, e.evidence_type),
                           "source": source_label.get(e.evidence_type, ""),
                           "content": e.content} for e in evidences],
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
