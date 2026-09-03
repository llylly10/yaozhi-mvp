import random
import time
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Literal
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import (
    Attempt, DiagnosticDomain, DiagnosisCandidate, DiagnosisEvidence, DiagnosisSession, DemoUser,
    FollowupNode, FollowupTurn, MasteryState, Misconception, Question, QuestionEvidence,
    TrainingSession, TrainingSessionQuestion, audit, now,
)
from .diagnosis import engine as dx
from .mastery import engine as mastery

router = APIRouter()

# US-0 AC4：撤回同意后 24h 内逻辑删除、30 天内物理删除
PURGE_AFTER_DAYS = 30


def _is_tiku_bridged(q: Question | None) -> bool:
    """题库物化题判定：code 统一 T<paper>-<qid>（seed_tiku_bridge 物化，无错因标注）。"""
    return q is not None and (q.code or "").startswith("T")


def _q_public(db: Session, q: Question) -> dict:
    """题目公共序列化：统一补章信息（前端题头/摸底展示用）。"""
    d = db.get(DiagnosticDomain, q.domain_id) if q.domain_id else None
    return {"id": q.id, "code": q.code, "stem": q.stem, "options": q.options,
            "type": q.type, "domain_id": q.domain_id,
            "chapter": d.chapter_ref if d else "",
            "chapter_name": d.name if d else ""}


def _tiku_feedback(db: Session, q: Question) -> dict:
    """题库物化题的解析型反馈（题目绑定证据，ADR-02 / 9/5 冻结口径）：
    答错不归因到错因（无标注不硬猜），给解析 + 教材锚点来源 + 章信息。"""
    ev = db.execute(select(QuestionEvidence).where(
        QuestionEvidence.question_id == q.id,
        QuestionEvidence.support_type == "解析")).scalar_one_or_none()
    d = db.get(DiagnosticDomain, q.domain_id) if q.domain_id else None
    return {"kind": "tiku", "analysis": ev.content_text if ev else "",
            "source": ev.evidence_chunk_id if ev else "",
            "chapter_ref": d.chapter_ref if d else "",
            "chapter_name": d.name if d else ""}


def _active_user(user_id: str, db: Session) -> DemoUser:
    """US-0 AC5：已撤回同意的用户，其数据不得以任何形式留存或复用。

    所有读写用户学习数据的入口都先过这一关；例外是同意接口本身，
    因为需求允许「撤回后如需继续使用，须重新勾选同意」。
    """
    user = db.get(DemoUser, user_id) or _404()
    if user.withdrawn_at is not None:
        raise HTTPException(403, "该账号已撤回同意，学习数据已停止使用并进入删除流程")
    return user


def _purge_user_data(db: Session, user_id: str) -> int:
    """物理删除用户全部学习数据，返回被删除的作答条数。

    审计日志（audit_logs）保留：删除回执需要留痕，且它记录的是操作本身而非学习内容。
    """
    attempt_ids = list(db.execute(
        select(Attempt.id).where(Attempt.user_id == user_id)).scalars())
    n = len(attempt_ids)
    if attempt_ids:
        sess_ids = list(db.execute(
            select(DiagnosisSession.id).where(DiagnosisSession.attempt_id.in_(attempt_ids))).scalars())
        if sess_ids:
            ts_ids = list(db.execute(
                select(TrainingSession.id).where(TrainingSession.diagnosis_id.in_(sess_ids))).scalars())
            if ts_ids:
                db.execute(delete(TrainingSessionQuestion).where(
                    TrainingSessionQuestion.training_session_id.in_(ts_ids)))
                db.execute(delete(TrainingSession).where(TrainingSession.id.in_(ts_ids)))
            db.execute(delete(DiagnosisCandidate).where(DiagnosisCandidate.session_id.in_(sess_ids)))
            db.execute(delete(DiagnosisEvidence).where(DiagnosisEvidence.session_id.in_(sess_ids)))
            db.execute(delete(FollowupTurn).where(FollowupTurn.session_id.in_(sess_ids)))
            db.execute(delete(DiagnosisSession).where(DiagnosisSession.id.in_(sess_ids)))
        db.execute(delete(Attempt).where(Attempt.user_id == user_id))
    db.execute(delete(MasteryState).where(MasteryState.user_id == user_id))
    return n


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
    """同意（第 2 步）：三份文档须全部同意，个性化功能依赖采集知情同意。

    已撤回过的账号重新勾选 → 先清空旧数据再重新开始（US-0 AC5：撤回后不得复用）。
    """
    user = db.get(DemoUser, user_id) or _404()
    if not (body.user_agreement and body.privacy_policy and body.data_collection):
        raise HTTPException(403, "三份文档须全部勾选同意")
    purged = 0
    if user.withdrawn_at is not None:
        purged = _purge_user_data(db, user_id)
        user.withdrawn_at = None
        user.purged_at = None
        user.deletion_receipt = None
    user.consented = True
    user.consented_at = now()
    db.commit()
    audit(db, user_id, "consent.granted", f"user:{user_id}",
          user_agreement=True, privacy_policy=True, data_collection=True,
          doc_version="2026-08-30", reconsent_purged_attempts=purged)
    return {"user_id": user_id, "consented": True, "purged_previous_attempts": purged}


class WithdrawIn(BaseModel):
    confirm: bool = False


@router.post("/users/{user_id}/consent/withdraw")
def withdraw_consent(user_id: str, body: WithdrawIn, db: Session = Depends(get_db)):
    """US-0 AC4：撤回同意并删除学习数据。二次确认后即时逻辑删除，出具带流水号的回执。"""
    user = db.get(DemoUser, user_id) or _404()
    if not body.confirm:
        raise HTTPException(400, "撤回需二次确认：请传 confirm=true")
    if user.withdrawn_at is not None:
        return {"user_id": user_id, "receipt": user.deletion_receipt, "already_withdrawn": True,
                "logical_deleted_at": user.withdrawn_at.isoformat()}
    user.consented = False
    user.withdrawn_at = now()
    user.deletion_receipt = f"DEL-{uuid.uuid4().hex[:12].upper()}"
    audit(db, user_id, "consent.withdrawn", f"user:{user_id}",
          receipt=user.deletion_receipt, logical_deleted_at=user.withdrawn_at.isoformat(),
          physical_delete_due_days=PURGE_AFTER_DAYS)
    db.commit()
    return {"user_id": user_id, "receipt": user.deletion_receipt,
            "logical_deleted_at": user.withdrawn_at.isoformat(),
            "physical_delete_after_days": PURGE_AFTER_DAYS,
            "note": "学习记录已即时停止使用（逻辑删除），30 天内完成物理删除"}


@router.get("/users/{user_id}/deletion-receipt")
def get_deletion_receipt(user_id: str, db: Session = Depends(get_db)):
    """US-0 AC4：删除完成回执，带操作流水号，供用户留存核对。"""
    user = db.get(DemoUser, user_id) or _404()
    if user.withdrawn_at is None:
        raise HTTPException(404, "该账号未发起撤回，暂无删除回执")
    return {"user_id": user_id, "receipt": user.deletion_receipt,
            "logical_deleted_at": user.withdrawn_at.isoformat(),
            "purged_at": user.purged_at.isoformat() if user.purged_at else None,
            "physical_delete_after_days": PURGE_AFTER_DAYS}


@router.post("/admin/purge-withdrawn")
def purge_withdrawn(days: int = Query(PURGE_AFTER_DAYS), db: Session = Depends(get_db)):
    """US-0 AC4 的 30 天物理删除清理。生产环境由定时任务调用，Demo 开放便于演示数据生命周期闭环。

    审计日志保留 —— 它是删除完成的凭证，记录的也是操作本身而非学习内容。
    """
    # SQLite 不保留时区，datetime 列的 SQL 比较不可靠；改为取出后在 Python 层比较
    cutoff = now().replace(tzinfo=None) - timedelta(days=days)
    candidates = db.execute(select(DemoUser).where(
        DemoUser.withdrawn_at.isnot(None), DemoUser.purged_at.is_(None))).scalars().all()
    rows = [u for u in candidates if u.withdrawn_at is not None and u.withdrawn_at <= cutoff]
    purged = []
    for u in rows:
        n = _purge_user_data(db, u.id)
        u.purged_at = now()
        audit(db, "system", "user.purged", f"user:{u.id}", receipt=u.deletion_receipt, attempts=n)
        purged.append({"user_id": u.id, "receipt": u.deletion_receipt, "attempts_deleted": n})
    db.commit()
    return {"purged": purged, "count": len(purged), "threshold_days": days}


@router.post("/admin/reset-demo")
def reset_demo(db: Session = Depends(get_db)):
    """演示数据复位：清空全部业务数据并重新种子化，保证演示可重现。

    审计日志一并清空（演示数据无留存价值）。 SQLite 下 drop_all→create_all 重建表。
    """
    from app.db import Base, engine
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    from seed.seed import seed as run_seed
    run_seed(db)
    db.commit()
    return {"ok": True, "note": "演示数据已复位为初始种子状态"}


# ---------- 作答提交（幂等） ----------

class AttemptIn(BaseModel):
    user_id: str
    question_id: str
    selected_option: str
    rationale: str | None = None
    # 学生自评置信度：与 Attempt.confidence 枚举（高/中/低）同域。
    # 必须在此收口——否则非法值会写库成功，之后任何读取该行作答的请求都会
    # 触发 SQLAlchemy LookupError → 500，诊断卡将永久不可用（演示事故）。
    confidence: Literal["高", "中", "低"] | None = None
    time_spent: int | None = None
    idempotency_key: str


@router.get("/users/{user_id}/wrong-book")
def wrong_book(user_id: str, db: Session = Depends(get_db)):
    """错题本：答错的作答 + 已出具的诊断结论。"""
    _active_user(user_id, db)
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
    _active_user(body.user_id, db)
    dup = db.execute(select(Attempt).where(Attempt.idempotency_key == body.idempotency_key)).scalar_one_or_none()
    if dup:
        session = db.execute(select(DiagnosisSession).where(
            DiagnosisSession.attempt_id == dup.id)).scalar_one_or_none()
        dq = db.get(Question, dup.question_id)
        if _is_tiku_bridged(dq):  # 幂等重放：题库题答错已建会话则回放会话 + 补同样反馈
            if session:
                return {"attempt_id": dup.id, "session_id": session.id,
                        "state": session.state, "is_correct": dup.is_correct,
                        "feedback": _tiku_feedback(db, dq), "idempotent_replay": True}
            return {"attempt_id": dup.id, "session_id": None, "state": "answered",
                    "is_correct": dup.is_correct, "feedback": _tiku_feedback(db, dq),
                    "idempotent_replay": True}
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
    if _is_tiku_bridged(question):
        # 题库物化题：答对/答错都给解析型反馈（即时讲解），并推进章级掌握度
        # （practice_passed：薄弱→学习中→初步掌握；practice_failed：未评估/学习中→薄弱）。
        # 答错时额外创建轻量诊断会话（通用四分类归因 + 低证据 + 可细化），
        # 闭合 练→诊断→训练→复测 链路——此前该分支不进诊断，错因/训练/复测在 723 题上全失效。
        audit(db, "system", "attempt.tiku_feedback", f"question:{question.id}",
              is_correct=attempt.is_correct)
        mastery.transition(db, body.user_id, question.domain_id, None,
                           "practice_passed" if attempt.is_correct else "practice_failed")
        db.commit()
        if not attempt.is_correct:
            session = dx.start_session_tiku(db, attempt)
            if session:
                return {"attempt_id": attempt.id, "session_id": session.id,
                        "state": session.state, "is_correct": attempt.is_correct,
                        "feedback": _tiku_feedback(db, question)}
        return {"attempt_id": attempt.id, "session_id": None, "state": "answered",
                "is_correct": attempt.is_correct, "feedback": _tiku_feedback(db, question)}
    # 答对不进诊断（US-2 前提是"做错"）：直接完成会话，不产出错因卡、不写薄弱
    if attempt.is_correct:
        session = DiagnosisSession(attempt_id=attempt.id, state="completed", evidence_level=None)
        db.add(session)
        audit(db, "system", "diagnosis.skipped_correct", f"session:{session.id}")
        db.commit()
        return {"attempt_id": attempt.id, "session_id": session.id,
                "state": "completed", "is_correct": True}
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
        cands = db.execute(select(DiagnosisCandidate).where(
            DiagnosisCandidate.session_id == s.id).order_by(DiagnosisCandidate.final_rank)).scalars().all()
        alternatives = []
        for c in cands:
            cm = db.get(Misconception, c.misconception_id)
            alternatives.append({"code": cm.code, "name": cm.name,
                                 "primary": cm.id == s.hypothesis_id})
        card = {
            "misconception": {"code": m.code, "name": m.name, "category": m.category},
            "evidence_level": s.evidence_level,
            "can_refine": s.can_refine,
            "evidences": [{"type": label.get(e.evidence_type, e.evidence_type),
                           "source": source_label.get(e.evidence_type, ""),
                           "content": e.content} for e in evidences],
            "alternatives": alternatives,
        }
    turns_rows = db.execute(select(FollowupTurn).where(
        FollowupTurn.session_id == s.id).order_by(FollowupTurn.turn_no)).scalars().all()
    turns = []
    for t in turns_rows:
        turns.append({"who": "ai", "text": t.presented_text})
        if not t.skipped and t.student_answer:
            turns.append({"who": "student", "text": t.student_answer})

    followup = dx.current_followup(db, s)
    followup_out = None
    if isinstance(followup, dict) and followup["kind"] == "verify":
        qv = followup["question"]
        followup_out = {"kind": "verify", "question": {
            "id": qv.id, "stem": qv.stem, "options": qv.options}, "turn_max": dx.MAX_FOLLOWUP_ROUNDS}
    elif followup is not None:
        node = followup["node"]
        followup_out = {"kind": "node", "node_id": node.id, "question_text": node.question_text,
                        "options": node.options, "turn_max": dx.MAX_FOLLOWUP_ROUNDS}
    return {
        "turns": turns,
        "session_id": s.id, "state": s.state, "chain_focus": s.chain_focus,
        "followup_count": s.followup_count, "question": {"code": question.code, "stem": question.stem},
        "is_correct": attempt.is_correct, "answer": question.answer,
        "card": card,
        "followup": followup_out,
    }


@router.post("/diagnoses/{session_id}/followups")
def answer_followup(session_id: str, body: dict, db: Session = Depends(get_db)):
    s = db.get(DiagnosisSession, session_id) or _404()
    try:
        s = dx.answer_followup(db, s, body)
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"state": s.state, "evidence_level": s.evidence_level,
            "followup_count": s.followup_count, "chain_focus": s.chain_focus,
            "can_refine": s.can_refine}


@router.post("/diagnoses/{session_id}/skip-followup")
def skip_followup(session_id: str, db: Session = Depends(get_db)):
    s = db.get(DiagnosisSession, session_id) or _404()
    try:
        s = dx.answer_followup(db, s, {"skip": True})
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"state": s.state, "evidence_level": s.evidence_level}


class FeedbackIn(BaseModel):
    matches: bool


@router.post("/diagnoses/{session_id}/feedback")
def diagnosis_feedback(session_id: str, body: FeedbackIn, db: Session = Depends(get_db)):
    """学生对归因结论的反馈：进入评测数据（不直接作为训练标签）。"""
    s = db.get(DiagnosisSession, session_id) or _404()
    s.feedback = "matches" if body.matches else "not_matches"
    db.commit()
    audit(db, "student", "diagnosis.feedback", session_id, feedback=s.feedback)
    return {"session_id": session_id, "feedback": s.feedback}


# ---------- 学习路径 / 学习材料 / 迁移复测 ----------

@router.get("/users/{user_id}/learning-plan")
def learning_plan(user_id: str, db: Session = Depends(get_db)):
    """规则生成的学习路径（v1.1 §12.2）：按掌握状态排序薄弱项，每项生成【学材料 → 练习】任务对。

    2026-09-03 题库接入：章级薄弱（category=None，题库题答错产生）只发练习任务——
    章级诊断域暂无整理的学习材料（chain/混淆对资产在种子域），不发空材料任务。
    """
    _active_user(user_id, db)
    from .models import MasteryState
    order = {"薄弱": 0, "学习中": 1, "初步掌握": 2}
    rows = db.execute(select(MasteryState).where(MasteryState.user_id == user_id)).scalars().all()
    weak = sorted([r for r in rows if r.state in order], key=lambda r: order[r.state])
    done = [r for r in rows if r.state in ("掌握", "稳定掌握")]
    tasks = []
    for r in weak:
        domain = db.get(DiagnosticDomain, r.domain_id)
        if not domain:
            continue
        if r.state == "薄弱" and r.category:
            tasks.append({"type": "material", "domain_id": r.domain_id, "domain": domain.name,
                          "category": r.category, "state": r.state,
                          "title": f"学习：{domain.name}" + (f"（{r.category}）" if r.category else "")})
        tasks.append({"type": "practice", "domain_id": r.domain_id, "domain": domain.name,
                      "category": r.category, "state": r.state,
                      "title": f"练习：{domain.name}" + (f"（{r.category}）" if r.category else "")})
    # 已完成项：明确返回「已完成」，前端打勾展示，避免掌握态被静默过滤造成"学习后无反馈"（用户反馈）
    done_tasks = []
    for r in done:
        domain = db.get(DiagnosticDomain, r.domain_id)
        if not domain:
            continue
        done_tasks.append({"domain_id": r.domain_id, "domain": domain.name, "category": r.category,
                           "state": r.state,
                           "title": f"已完成：{domain.name}" + (f"（{r.category}）" if r.category else "")})
    return {"tasks": tasks, "done_tasks": done_tasks,
            "note": "路径按「先学后练」规则生成，可跳过；AI 个性化排序为 Post-MVP"}


@router.get("/materials/{domain_id}")
def get_materials(domain_id: str, db: Session = Depends(get_db)):
    """学习材料：推理链 + 混淆对辨析 + 题目证据要点（现有合法内容组装）。"""
    from .models import ChainNode, ConfusionPair, Question, QuestionEvidence
    domain = db.get(DiagnosticDomain, domain_id) or _404()
    chain = db.execute(select(ChainNode).where(ChainNode.domain_id == domain.id)
                       .order_by(ChainNode.level)).scalars().all()
    pairs = db.execute(select(ConfusionPair).where(ConfusionPair.domain_id == domain.id)).scalars().all()
    qs = db.execute(select(Question).where(Question.domain_id == domain.id,
                                           Question.review_status == "published")).scalars().all()
    evidence = []
    for q in qs:
        for ev in db.execute(select(QuestionEvidence).where(
                QuestionEvidence.question_id == q.id)).scalars():
            if ev.content_text:
                evidence.append({"ref": q.code, "text": ev.content_text})
    return {"domain": {"code": domain.code, "name": domain.name, "chapter_ref": domain.chapter_ref},
            "chain": [{"level": c.level, "title": c.title, "summary": c.summary} for c in chain],
            "confusion_pairs": [{"drug_a": p.drug_a, "drug_b": p.drug_b,
                                 "distinction": p.distinction_text} for p in pairs],
            "evidence": evidence[:6]}


@router.get("/retest/{training_id}")
def get_retest(training_id: str, db: Session = Depends(get_db)):
    """迁移复测：从同域题池取学生未作答过的题（不与训练题重复），近迁移新情境。"""
    from .models import Attempt, TrainingSession, TrainingSessionQuestion
    ts = db.get(TrainingSession, training_id) or _404()
    s = db.get(DiagnosisSession, ts.diagnosis_id)
    attempt = db.get(Attempt, s.attempt_id)
    user_id, domain_id = attempt.user_id, db.get(Question, attempt.question_id).domain_id
    answered = set(db.execute(select(Attempt.question_id).where(Attempt.user_id == user_id)).scalars())
    trained = set(db.execute(select(TrainingSessionQuestion.question_id).where(
        TrainingSessionQuestion.training_session_id == ts.id)).scalars())
    pool = db.execute(select(Question).where(
        Question.domain_id == domain_id, Question.usage == "retest",
        Question.review_status == "published")).scalars().all()
    if not pool:  # 无专用复测题池时回退：同域未答过的任意题
        pool = [q for q in db.execute(select(Question).where(
            Question.domain_id == domain_id, Question.review_status == "published")).scalars().all()
            if q.id not in answered]
    pool = [q for q in pool if q.id not in answered and q.id not in trained]
    picked = pool[:2]
    return {"training_id": ts.id, "questions": [
        {"id": q.id, "stem": q.stem, "options": q.options} for q in picked]}


class RetestSubmitIn(BaseModel):
    answers: dict[str, str]


@router.post("/retest/{training_id}/submit")
def submit_retest(training_id: str, body: RetestSubmitIn, db: Session = Depends(get_db)):
    from .models import Attempt, TrainingSession, TrainingSessionQuestion
    ts = db.get(TrainingSession, training_id) or _404()
    s = db.get(DiagnosisSession, ts.diagnosis_id)
    attempt = db.get(Attempt, s.attempt_id)
    question = db.get(Question, attempt.question_id)
    correct = 0
    total = 0
    for qid, opt in body.answers.items():
        q = db.get(Question, qid)
        if not q:
            continue
        total += 1
        if opt == q.answer:
            correct += 1
    passed = total > 0 and correct / total >= 0.6
    attempt2_user = attempt.user_id
    m = db.get(Misconception, s.hypothesis_id)
    s.state = "completed"
    # 题库物化题复测事件同步到章级掌握度（category=None），与训练事件一致。
    mastery_category = m.category if question.distractor_signals else None
    mastery.transition(db, attempt2_user, question.domain_id, mastery_category,
                       "retest_passed" if passed else "retest_failed")
    db.commit()
    audit(db, "system", "retest.completed", ts.id, passed=passed, correct=correct, total=total)
    return {"training_id": ts.id, "passed": passed,
            "correct": correct, "total": total}


# ---------- 摸底测试与画像 ----------

ASSESS_TIKU_CHAPTERS = 3   # 题库题覆盖章数
ASSESS_SEED_DIAG = 2       # 种子域诊断题数（有错因标注，答错可出完整诊断卡）


@router.get("/users/{user_id}/assessment")
def get_assessment(user_id: str, db: Session = Depends(get_db)):
    """摸底卷（MVP 内容底座版）：真实题库 + 诊断域混卷。

    配比：题库 published A1 物化题按章配额抽 3 题（每章 1 题，覆盖多个章节），
    种子诊断域抽 2 题（该域带错因标注，答错进入完整错因诊断示范）。
    同 user 同卷（random 以 user_id 为种子），不同用户不同卷；可复跑可回放。
    """
    _active_user(user_id, db)
    rng = random.Random(f"assess:{user_id}")
    # 题库物化题（usage=diagnostic 且 code 以 T 开头）
    tiku_qs = db.execute(select(Question).where(
        Question.usage == "diagnostic", Question.review_status == "published",
        Question.code.like("T%"))).scalars().all()
    by_ch: dict = {}
    for q in tiku_qs:
        by_ch.setdefault(q.domain_id, []).append(q)
    picked = []
    chapters = list(by_ch.keys())
    rng.shuffle(chapters)
    for c in chapters[:ASSESS_TIKU_CHAPTERS]:
        picked.append(rng.choice(by_ch[c]))
    # 种子域诊断题（Q- 前缀 = 错因标注域）
    seed_qs = db.execute(select(Question).where(
        Question.usage == "diagnostic", Question.review_status == "published",
        Question.code.like("Q-%"))).scalars().all()
    picked += rng.sample(seed_qs, min(ASSESS_SEED_DIAG, len(seed_qs)))
    rng.shuffle(picked)
    return {"questions": [_q_public(db, q) for q in picked]}


@router.post("/users/{user_id}/assessment/submit")
def submit_assessment(user_id: str, body: dict, db: Session = Depends(get_db)):
    """判分摸底卷：记录作答、输出域级正确率与薄弱项（画像数据源）。

    薄弱语义（2026-09-03 题库接入后）：
      - 种子诊断域题答错 → 按干扰项信号归因到错因类别（域级薄弱，驱动错因路径）
      - 题库物化题答错 → 无错因标注，标**章级薄弱**（category=None，驱动章级练习）
    """
    _active_user(user_id, db)
    answers: dict = body.get("answers", {})
    qids = list(answers.keys())
    questions = [db.get(Question, qid) for qid in qids]
    questions = [q for q in questions if q]
    domain_stats: dict = {}
    weak: list = []
    domain_map = {d.id: d.name for d in db.execute(select(DiagnosticDomain)).scalars()}
    for q in questions:
        picked = answers.get(q.id)
        ok = picked == q.answer
        key = q.domain_id
        st = domain_stats.setdefault(key, {"correct": 0, "total": 0})
        st["total"] += 1
        st["correct"] += int(ok)
        if not ok:
            sig = (q.distractor_signals or {}).get(picked or "") or {}
            cat = None
            mis = None
            if sig.get("misconception"):
                mis = db.execute(select(Misconception).where(
                    Misconception.code == sig["misconception"])).scalar_one_or_none()
                cat = mis.category if mis else None
            weak.append({"question_code": q.code, "stem": q.stem, "domain_id": q.domain_id,
                         "domain": domain_map.get(q.domain_id, q.domain_id),
                         "category": cat or "待诊断"})
            if _is_tiku_bridged(q) and not sig:
                # 题库物化题答错 → 章级薄弱（无错因标注不硬归因；category=None 驱动章级练习）
                mastery.transition(db, user_id, q.domain_id, None, "misdiagnosed")
            elif cat:  # 域题答错 → 该错因类别标记薄弱（驱动错因路径）；已薄弱则幂等跳过
                from .models import MasteryState
                st = db.get(MasteryState, (user_id, q.domain_id, cat))
                if st is None or st.state == "未评估":
                    mastery.transition(db, user_id, q.domain_id, cat, "misdiagnosed")
        attempt = Attempt(user_id=user_id, question_id=q.id, selected_option=picked or "",
                          is_correct=ok, idempotency_key=f"assess-{user_id}-{q.id}")
        db.add(attempt)
    db.commit()
    domains_out = [{"domain_id": k, "domain": domain_map.get(k, k), "correct": v["correct"],
                    "total": v["total"], "rate": round(v["correct"] / v["total"], 3)} for k, v in domain_stats.items()]
    return {"total": len(questions), "weak": weak, "domains": domains_out}


@router.get("/users/{user_id}/profile-summary")
def profile_summary(user_id: str, db: Session = Depends(get_db)):
    """档案页聚合：错题的 域×错因类别 分布（热力图数据）。"""
    _active_user(user_id, db)
    rows = db.execute(select(Attempt).where(
        Attempt.user_id == user_id, Attempt.is_correct == False)).scalars().all()  # noqa: E712
    heat: dict = {}
    weak: list = []
    for a in rows:
        q = db.get(Question, a.question_id)
        if not q:
            continue
        s = db.execute(select(DiagnosisSession).where(
            DiagnosisSession.attempt_id == a.id)).scalar_one_or_none()
        cat = db.get(Misconception, s.hypothesis_id).category if s and s.hypothesis_id else "待诊断"
        dname = db.get(DiagnosticDomain, q.domain_id).name if db.get(DiagnosticDomain, q.domain_id) else "未知域"
        key = (q.domain_id, dname, cat)
        heat[key] = heat.get(key, 0) + 1
        weak.append({"question_code": q.code, "stem": q.stem, "domain_id": q.domain_id,
                    "domain": dname, "category": cat})
    return {"heatmap": [{"domain_id": k[0], "domain": k[1], "category": k[2], "wrong": v}
                        for k, v in heat.items()],
            "weak": weak}


# ---------- 训练与掌握度 ----------

@router.get("/training/{session_id}")
def get_training(session_id: str, db: Session = Depends(get_db)):
    """按错因×干预路由返回训练载荷（v1.1 §5.3）：四种干预形态。"""
    from .models import ChainNode, ConfusionPair, Misconception
    s = db.get(DiagnosisSession, session_id) or _404()
    ts = db.execute(select(TrainingSession).where(TrainingSession.diagnosis_id == s.id)).scalar_one_or_none()
    if ts is None:
        if s.state != "diagnosed":
            raise HTTPException(409, f"会话状态 {s.state} 不能开始训练")
        ts = dx.start_training(db, s)
    m = db.get(Misconception, s.hypothesis_id)
    mode = m.remediation_type
    note = {
        "记忆卡": "知识遗忘类：先用记忆卡巩固要点，暂不刷题",
        "混淆对变式": "概念混淆类：围绕易混药物对做双向变式",
        "断环重讲": "机制理解类：先重讲断环环节，再做条件变化型变式",
        "情境拆解": "审题应用类：练习含特殊人群/联合用药情境的题目",
    }.get(mode, "")
    rows = db.execute(select(TrainingSessionQuestion).where(
        TrainingSessionQuestion.training_session_id == ts.id).order_by(
        TrainingSessionQuestion.sequence_no)).scalars().all()
    questions = [{"id": r.question_id, "stem": db.get(Question, r.question_id).stem,
                  "options": db.get(Question, r.question_id).options} for r in rows]

    out = {"training_id": ts.id, "status": ts.status, "mode": mode, "note": note, "questions": questions}

    # 记忆卡形态：推理链要点卡 + 混淆对辨析卡；不返回刷题题目（v1.1：知识遗忘类不推刷题）
    if mode == "记忆卡":
        chain = db.execute(select(ChainNode).where(ChainNode.domain_id == m.domain_id)
                           .order_by(ChainNode.level)).scalars().all()
        pairs = db.execute(select(ConfusionPair).where(ConfusionPair.domain_id == m.domain_id)).scalars().all()
        out["cards"] = [{"front": f"{c.title}（L{c.level}）", "back": c.summary} for c in chain] + \
                       [{"front": f"{p.drug_a} 与 {p.drug_b} 的区别？", "back": p.distinction_text} for p in pairs]
        out["questions"] = []
    # 断环重讲形态：断环环节的讲解
    if mode == "断环重讲":
        node = db.execute(select(ChainNode).where(
            ChainNode.domain_id == m.domain_id,
            ChainNode.level == (s.chain_focus or 2))).scalars().first()
        if node:
            out["reteach"] = {"level": node.level, "title": node.title, "summary": node.summary}
    # 情境拆解：题目已由 start_training 按 condition_type 优先选取，这里只补充标注
    if mode == "情境拆解" and questions:
        if all(db.get(Question, x["id"]).condition_type != "normal" for x in questions):
            out["note"] = out["note"] + " · 本组均为情境题"
    return out


class TrainingSubmitIn(BaseModel):
    """answers: {question_id: option_key}，服务端判分（后端为唯一事实来源）。
    记忆卡形态无答题：空 answers = 自评完成。"""
    answers: dict[str, str] = {}


@router.post("/training/{training_id}/submit")
def submit_training(training_id: str, body: TrainingSubmitIn, db: Session = Depends(get_db)):
    ts = db.get(TrainingSession, training_id) or _404()
    rows = db.execute(select(TrainingSessionQuestion).where(
        TrainingSessionQuestion.training_session_id == ts.id)).scalars().all()
    if rows:
        correct = sum(
            1 for r in rows
            if body.answers.get(r.question_id) == db.get(Question, r.question_id).answer)
        ts.score = round(correct / max(len(rows), 1), 3)
    else:
        ts.score = 1.0  # 记忆卡形态：自评完成即通过
    ts.status = "completed"
    s = db.get(DiagnosisSession, ts.diagnosis_id)
    s.state = "retesting" if ts.score >= 0.6 else "diagnosed"
    attempt = db.get(Attempt, s.attempt_id)
    question = db.get(Question, attempt.question_id)
    m = db.get(Misconception, s.hypothesis_id)
    # 题库物化题只写章级掌握度（category=None），与 router.submitAttempt 的 practice_failed 同维度，
    # 避免复测通过后「今日待办」的章节任务仍卡在薄弱。
    mastery_category = m.category if question.distractor_signals else None
    mastery.transition(db, attempt.user_id, question.domain_id, mastery_category,
                       "training_passed" if ts.score >= 0.6 else "training_failed")
    db.commit()
    return {"training_id": ts.id, "score": ts.score, "state": s.state}


@router.get("/users/{user_id}/mastery")
def my_mastery(user_id: str, db: Session = Depends(get_db)):
    from .models import MasteryState
    _active_user(user_id, db)
    rows = db.execute(select(MasteryState).where(MasteryState.user_id == user_id)).scalars().all()
    dmap = {d.id: d.name for d in db.execute(select(DiagnosticDomain)).scalars()}
    return [{"domain_id": r.domain_id, "domain": dmap.get(r.domain_id, r.domain_id),
             "category": r.category, "state": r.state, "reason": r.reason} for r in rows]


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
    return [{"id": q.id, "code": q.code, "stem": q.stem, "options": q.options, "type": q.type,
             "domain_id": q.domain_id} for q in rows]


@router.get("/questions/{question_id}/analysis")
def question_analysis(question_id: str, db: Session = Depends(get_db)):
    """答对后的错因分析（教学预览）：基于出题时的干扰项标注，
    展示"若误选某项会被归因为什么"。确定性内容，无模型调用。"""
    q = db.get(Question, question_id) or _404()
    evidence = db.execute(select(QuestionEvidence).where(
        QuestionEvidence.question_id == q.id)).scalars().all()
    analysis = []
    for opt in q.options:
        if opt["key"] == q.answer:
            continue
        sig = (q.distractor_signals or {}).get(opt["key"]) or {}
        mis = None
        if sig.get("misconception"):
            mis = db.execute(select(Misconception).where(
                Misconception.code == sig["misconception"])).scalar_one_or_none()
        analysis.append({
            "option": opt["key"], "option_text": opt["text"],
            "category": mis.category if mis else "待归类",
            "misconception": mis.name if mis else "该选项暂无错因标注（待顾问补充）",
            "misconception_code": mis.code if mis else None,
            "note": sig.get("note", ""),
        })
    # 假设性主错因：权重最高的干扰项标注
    primary, top_w = None, -1.0
    for a in analysis:
        sig = (q.distractor_signals or {}).get(a["option"]) or {}
        w = float(sig.get("weight", 0))
        if w > top_w:
            top_w, primary = w, a
    # 衔接追问预览：主错因关联的预置追问节点（按 code 排序）
    followups = []
    if primary and primary.get("misconception_code"):
        from .models import MisconceptionFollowup, FollowupNode
        mis_obj = db.execute(select(Misconception).where(
            Misconception.code == primary["misconception_code"])).scalar_one_or_none()
        if mis_obj:
            node_ids = db.execute(select(MisconceptionFollowup.followup_node_id).where(
                MisconceptionFollowup.misconception_id == mis_obj.id)).scalars().all()
            nodes = sorted([db.get(FollowupNode, n) for n in node_ids if db.get(FollowupNode, n)],
                           key=lambda n: n.code)
            followups = [{"question_text": n.question_text, "options": n.options} for n in nodes]
    return {"question_code": q.code, "stem": q.stem, "answer": q.answer,
            "evidence": [{"ref": e.evidence_chunk_id, "text": e.content_text} for e in evidence],
            "analysis": analysis,
            "primary": primary,
            "followups": followups}


@router.get("/questions/{question_id}")
def get_question(question_id: str, db: Session = Depends(get_db)):
    """演示/摸底取题。正式摸底卷接口 W3 提供（/courses/{id}/assessment）。"""
    q = db.get(Question, question_id) or _404()
    return {"id": q.id, "code": q.code, "stem": q.stem, "options": q.options, "type": q.type}


def _404():
    raise HTTPException(404, "资源不存在")
