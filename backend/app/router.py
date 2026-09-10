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
    Attempt, ChainNode, ConfusionPair, DiagnosticDomain, DiagnosisCandidate, DiagnosisEvidence,
    DiagnosisSession, DemoUser, FollowupNode, FollowupTurn, KnowledgeRelation, MasteryState,
    Misconception, Question, QuestionEvidence, StudyProgress, SyllabusChapter,
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


@router.get("/users/{user_id}/exists")
def user_exists(user_id: str, db: Session = Depends(get_db)):
    """探活：本地缓存了 userId 但服务器已重置/撤回时，前端据此回落注册页。

    语义与 _active_user 一致：用户不存在→404，已撤回→403；两者前端都视为
    「会话失效」→ 清本地缓存回欢迎页，避免卡在今日待办报「数据不存在」。
    """
    _active_user(user_id, db)
    return {"ok": True}


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
            "case_evidence": mis.case_evidence if mis else None,
            "evidence_level": s.evidence_level if s else None,
            "mastery_state": None,
        })
    return out


@router.get("/wrong/{attempt_id}/recall")
def wrong_recall(attempt_id: str, db: Session = Depends(get_db)):
    """错题记忆卡：对单条错题聚合「图谱 + 临床/教材助记 + 归因」，供错题本点开展示。

    三层全部取真实数据（不虚构）：
     1) 归因卡：诊断会话假设错因 + case_evidence（教材事实案例，仅错因目录预置者带）；
     2) 知识关系图谱：该错题所属域已发布的 FR-A2 knowledge_relations + confusion_pairs；
     3) 教材记忆锚点：按题干实时检索人卫《药理学》9e OCR，返回 top-2 原文（带章/页码署名）——
        题库题即便无预置案例，也能给出真实教材依据辅助记忆。
    """
    from .config import settings
    a = db.get(Attempt, attempt_id)
    if not a:
        raise HTTPException(404, "作答不存在")
    _active_user(a.user_id, db)
    q = db.get(Question, a.question_id)
    s = db.execute(select(DiagnosisSession).where(
        DiagnosisSession.attempt_id == a.id)).scalar_one_or_none()
    mis = db.get(Misconception, s.hypothesis_id) if s and s.hypothesis_id else None

    # 1) 归因卡 + 临床案例
    card = {
        "attempt_id": a.id,
        "is_correct": a.is_correct,
        "question": {"code": q.code, "stem": q.stem, "options": q.options,
                     "answer": q.answer, "domain_id": q.domain_id} if q else None,
        "misconception": {"code": mis.code, "name": mis.name, "category": mis.category} if mis else None,
        "case_evidence": mis.case_evidence if mis else None,
        "evidence_level": s.evidence_level if s else None,
    }

    # 2) 知识关系图谱（FR-A2）+ 混淆对（按错题所属域；题库章节域暂无 relations 时诚实为空）
    relations, pairs = [], []
    if q:
        from .models import ConfusionPair, KnowledgeRelation
        domain = db.get(DiagnosticDomain, q.domain_id)
        if domain:
            rels = db.execute(select(KnowledgeRelation).where(
                KnowledgeRelation.domain_id == domain.id)).scalars().all()
            relations = [{"source": r.source, "edge": r.edge, "target": r.target,
                          "note": r.note} for r in rels]
            cps = db.execute(select(ConfusionPair).where(
                ConfusionPair.domain_id == domain.id)).scalars().all()
            pairs = [{"drug_a": p.drug_a, "drug_b": p.drug_b,
                      "distinction": p.distinction_text} for p in cps]
    card["relations"] = relations
    card["confusion_pairs"] = pairs

    # 3) 教材记忆锚点：按题干实时 RAG
    anchors = []
    if q and getattr(settings, "rag_enabled", True):
        try:
            query = dx._rag_query(q, a)
            if query:
                from .rag import retrieve_top_k
                hits = retrieve_top_k(query, k=getattr(settings, "rag_top_k", 2))
                for h in hits:
                    ch = h.chapter or f"教材第{h.book_page}页"
                    anchors.append({
                        "chapter": ch, "page": h.page, "book_page": h.book_page,
                        "score": h.score,
                        "text": (h.text or "")[:320],
                        "source_ref": f"rag:教材p{h.page}" + (f"·{h.chapter}" if h.chapter else ""),
                    })
        except Exception:  # 检索失败不阻断记忆卡
            anchors = []
    card["textbook_anchors"] = anchors

    # 4) 训练/复测状态摘要（已训练过的错题标注）
    # 4) 训练状态摘要（若该诊断会话已做过训练）
    trained = False
    if s:
        tr = db.execute(select(TrainingSession).where(
            TrainingSession.diagnosis_id == s.id)).scalar_one_or_none()
        trained = bool(tr and getattr(tr, "state", None) == "passed")
    card["trained"] = trained
    return card


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
            # 教材事实案例（v0.7 错因卡第④字段，2026-09-08）：错因目录挂的临床记忆点
            "case_evidence": m.case_evidence,
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
    """规则生成的学习路径（v1.1 §12.2）：按掌握状态排序薄弱项，每项生成【学 → 练】任务对。

    2026-09-10 一学一练配对（用户反馈：之前章级只有练、没有学）：
      - 章级行（category=None，题库题答错产生）在「薄弱/学习中」同样发学习任务 +
        练习任务。学习内容为该章课程大纲知识点树（study-map 明细）+ 随堂自测，
        前端点「进入学习」打开章节学习页；自测通过（≥60%）把该行推至「学习中」。
      - 种子域错因行保持原口径：「薄弱」发 学+练，自测通过后学习任务出列、
        仅剩练习（训练→复测链路接管后续学习）。

    2026-09-08 完成口径修正（用户反馈：练习做完不消失/不打勾）：
      - 章级题库行（category=None）无复测资产，状态机最高到「初步掌握」即已「达标」，
        达到 初步掌握/掌握/稳定掌握 即移入 done_tasks，从待办出列，不再无限滞留。
      - 种子域错因行（category 非空）有 训练→迁移复测 链路，须到「掌握/稳定掌握」才出列。
      - 每个待办任务附 guide（下一步引导）+ goal（达成路径），前端据此给出明确指引。
    """
    _active_user(user_id, db)
    from .models import MasteryState
    order = {"薄弱": 0, "学习中": 1, "初步掌握": 2}
    rows = db.execute(select(MasteryState).where(MasteryState.user_id == user_id)).scalars().all()
    pending = sorted([r for r in rows if r.state in order], key=lambda r: order[r.state])
    # 达标出列判定：章级(无 category)到「初步掌握」即完成；种子域须到「掌握」。
    def _is_done(r):
        if r.state in ("掌握", "稳定掌握"):
            return True
        return r.state == "初步掌握" and r.category is None
    done_rows = [r for r in rows if _is_done(r)]
    tasks = []
    for r in pending:
        if _is_done(r):
            continue  # 章级初步掌握在此不列入待办（已达标出列）
        domain = db.get(DiagnosticDomain, r.domain_id)
        if not domain:
            continue
        is_chapter = r.category is None
        # 学习任务（一学一练配对）：
        # - 种子域错因「薄弱」：深图谱学习材料 + 随堂自测，通过后任务出列、进入练习。
        # - 章级行「薄弱/学习中」：本章大纲知识点 + 随堂自测，通过后该行进「学习中」，
        #   学习任务保留到达标出列（可反复回看），始终与练习任务配对。
        if (not is_chapter) and r.state == "薄弱":
            tasks.append({"type": "material", "domain_id": r.domain_id, "domain": domain.name,
                          "category": r.category, "state": r.state,
                          "title": f"学习：{domain.name}（{r.category}）",
                          "guide": "先看本域学习材料，再回答随堂自测；自测通过后此任务出列，进入下方练习。",
                          "goal": "自测通过（答对 ≥60%）"})
        elif is_chapter and r.state in ("薄弱", "学习中"):
            learn_guide = ("先看本章知识点，再做随堂自测；自测通过（≥60%）后本章进入「学习中」，"
                           "再用下方练习把正确率打到 70% 即达标出列。"
                           if r.state == "薄弱" else
                           "本章自测已通过，可回看知识点复习；用下方练习把正确率打到 70% 即达标出列。")
            tasks.append({"type": "material", "domain_id": r.domain_id, "domain": domain.name,
                          "category": None, "state": r.state,
                          "title": f"学习：{domain.name}",
                          "guide": learn_guide,
                          "goal": "自测通过（答对 ≥60%）"})
        if is_chapter:
            need = {"薄弱": "先完成上方学习，再答对本章 2 道题", "学习中": "再答对本章 1 道题"}.get(r.state, "")
            guide = (f"{need}后达标出列（不再出现在待办）。"
                     if r.state in ("薄弱", "学习中")
                     else "继续巩固本域知识点。")
        else:
            guide = "答对本章题目、若答错则沿「诊断 → 靶向训练 → 迁移复测」把错因突破到「掌握」后出列。"
        tasks.append({"type": "practice", "domain_id": r.domain_id, "domain": domain.name,
                      "category": r.category, "state": r.state,
                      "title": f"练习：{domain.name}" + (f"（{r.category}）" if r.category else ""),
                      "guide": guide,
                      "goal": "掌握" if not is_chapter else ("初步掌握（题库题可达到的最强状态）"
                               if r.state == "学习中" else "初步掌握")})
    # 已完成项：明确返回「已完成」，前端打勾展示，避免掌握态被静默过滤造成"学习后无反馈"（用户反馈）
    done_tasks = []
    for r in sorted(done_rows, key=lambda x: (x.category is not None, x.domain_id)):
        domain = db.get(DiagnosticDomain, r.domain_id)
        if not domain:
            continue
        is_chapter = r.category is None
        state_label = "初步掌握" if (is_chapter and r.state == "初步掌握") else r.state
        done_tasks.append({"domain_id": r.domain_id, "domain": domain.name, "category": r.category,
                           "state": state_label,
                           "title": f"已完成：{domain.name}" + (f"（{r.category}）" if r.category else "")})
    note = "路径按「一学一练」配对生成：每个薄弱项都有学习任务 + 练习任务；练到达标态（章节初步掌握 / 错因掌握）即出列，不再滞留待办。"
    return {"tasks": tasks, "done_tasks": done_tasks, "note": note}


# ---------- 学习地图 · 知识图谱（2026-09-09：目标后、摸底前 的「先学→随堂摸底」） ----------
#
# 用户：选完学习目标后先进入课程知识图谱，学一个章节（知识点做成图谱）→ 该章节随堂摸底(≥60%过)
# → 标「已达标」→ 可继续学下一节或进入正常摸底流程。
# 内容底座：34 个章节域(每章=一个 DiagnosticDomain) 一一映射教学大纲 SyllabusChapter（节→知识点，
# 真实课程大纲，review_status=draft 待顾问）；种子域 DOM-PHARMO-ANS 另有顾问整理的深图谱(链+关系+混淆对)。
# 其余章节只有题库题、无顾问整理图谱 → 如实标注「题库先行」，不伪造。

# 药理系统分组（仅作图谱展示的粗聚类，非教材权威编章顺序；book_chapter_no → 组）
STUDY_GROUPS: list[dict] = [
    {"key": "auto", "name": "总论 · 自主神经", "no": [1, 2, 3, 5, 6, 7, 8]},
    {"key": "cns", "name": "中枢神经系统药", "no": [12, 13, 14, 15, 16, 17, 18]},
    {"key": "cvs", "name": "心血管 · 血液系统药", "no": [19, 20, 21, 22, 23, 24, 27]},
    {"key": "endo", "name": "呼吸消化 · 内分泌代谢", "no": [25, 26, 29, 30, 31]},
    {"key": "infec", "name": "抗感染药", "no": [33, 34, 35, 36, 37, 38, 39, 40]},
    {"key": "other", "name": "肿瘤与其他", "no": [42]},
]
SEED_DOMAIN_CODE = "DOM-PHARMO-ANS"


def _chapter_no(domain: DiagnosticDomain) -> int | None:
    """从 DiagnosticDomain.chapter_ref 提取教材章号（'CH6'→6；种子域为文字锚点→None）。"""
    import re
    m = re.search(r"CH(\d+)", domain.chapter_ref or "")
    return int(m.group(1)) if m else None


def _group_of(no: int | None) -> dict | None:
    for g in STUDY_GROUPS:
        if no is not None and no in g["no"]:
            return g
    return None


def _json_field(row, col):
    """SyllabusChapter 的 JSON 列安全取值：列可能为 None/字符串/列表/字典。"""
    v = getattr(row, col, None)
    if v is None:
        return None
    if isinstance(v, str):
        import json as _json
        try:
            return _json.loads(v)
        except Exception:
            return None
    return v


@router.get("/users/{user_id}/study-map")
def study_map(user_id: str, db: Session = Depends(get_db)):
    """课程知识图谱门户（目标后、摸底前）。返回按药理系统分组的章节节点：
    每个节点=一章(域)，含题量、是否已随堂达标、掌握态、以及该章学习内容来源标记
    （seed=顾问深图谱 / syllabus=课程大纲结构 / none=题库先行待补）。
    is_seed 节点为种子域深图谱示范。"""
    _active_user(user_id, db)
    syl_by_no = {s.book_chapter_no: s for s in db.execute(select(SyllabusChapter)).scalars()}
    mastered = {m.domain_id: m for m in db.execute(
        select(MasteryState).where(MasteryState.user_id == user_id, MasteryState.category.is_(None))).scalars()}
    studied = {s.domain_id: s for s in db.execute(
        select(StudyProgress).where(StudyProgress.user_id == user_id)).scalars()}
    # 各域 published 题量（摸底/练习可用题）
    qcount: dict = {}
    for d_id in db.execute(select(Question.domain_id).where(
            Question.review_status == "published")).scalars():
        qcount[d_id] = qcount.get(d_id, 0) + 1

    groups = {g["key"]: {"key": g["key"], "name": g["name"], "nodes": []} for g in STUDY_GROUPS}
    orphan = {"key": "orphan", "name": "综合", "nodes": []}

    def node_of(domain: DiagnosticDomain, seed: bool) -> dict:
        no = None if seed else _chapter_no(domain)
        sy = None if seed else (syl_by_no.get(no) if no in syl_by_no else None)
        has_syl = sy is not None
        st = studied.get(domain.id)
        ms = mastered.get(domain.id)
        return {
            "domain_id": domain.id, "code": domain.code, "is_seed": seed,
            "title": ("传出神经 · M受体激动药与阻断药（示范深挖）" if seed
                      else (sy.title if sy else domain.name)),
            "book_chapter_no": no,
            "source": "seed" if seed else ("syllabus" if has_syl else "none"),
            "q_published": qcount.get(domain.id, 0),
            "objective": (domain.name if seed else domain.name),
            "studied": ({"passed": st.state == "已达标", "score": float(st.best_score or 0),
                         "total": st.quiz_total} if st and st.state == "已达标" else None),
            "mastery": ({"state": ms.state} if ms and ms.state != "未评估" else None),
        }

    # 章节域（DOM-CHx）——加入对应药理系统分组
    for d in db.execute(select(DiagnosticDomain).where(
            DiagnosticDomain.code.like("DOM-CH%"))).scalars():
        no = _chapter_no(d)
        gkey = (_group_of(no) or orphan)["key"]
        (groups.get(gkey) or orphan)["nodes"].append(node_of(d, seed=False))
    # 种子域深图谱节点（DOM-PHARMO-ANS）放入「总论·自主神经」组首位，作示范
    seed_dom = db.execute(select(DiagnosticDomain).where(
        DiagnosticDomain.code == SEED_DOMAIN_CODE)).scalar_one_or_none()
    if seed_dom:
        groups["auto"]["nodes"].insert(0, node_of(seed_dom, seed=True))

    ordered = [groups[g["key"]] for g in STUDY_GROUPS]
    if orphan["nodes"]:
        ordered.append(orphan)
    payload_groups = []
    for g in ordered:
        if not g["nodes"]:
            continue
        payload_groups.append({"key": g["key"], "name": g["name"], "nodes": g["nodes"]})
    # 建议先学：优先未达标、题库可摸底(≥3)的章节域；种子域恒为最优先示范
    recs = []
    if seed_dom:
        recs.append(seed_dom.id)
    for g in payload_groups:
        for n in g["nodes"]:
            if n["domain_id"] not in recs and not n["studied"] and n["q_published"] >= 3:
                recs.append(n["domain_id"])
        if len(recs) >= 5:
            break
    return {"groups": payload_groups, "recommended": recs[:5],
            "total_domains": sum(len(g["nodes"]) for g in payload_groups),
            "note": "节点=药理学一章。蓝点可学习并随堂摸底；其余章节为题库先行，材料待药理顾问图谱化。"}


@router.get("/users/{user_id}/study-map/{domain_id}")
def study_detail(user_id: str, domain_id: str, db: Session = Depends(get_db)):
    """单个图谱节点的学习内容：
      - source=seed：种子域顾问整理的深图谱（推理链 + 药效关系 + 易混对），可完全走通 学→摸底。
      - source=syllabus：该章课程大纲结构（章节→知识点树 + 重点/难点/掌握要求），属真实大纲待顾问图谱化。
      - source=none：仅有题库题，无学习材料（如实提示，不伪造），仍可随堂摸底。"""
    _active_user(user_id, db)
    d = db.get(DiagnosticDomain, domain_id) or _404()
    seed = d.code == SEED_DOMAIN_CODE
    no = None if seed else _chapter_no(d)
    base = {"domain_id": d.id, "code": d.code, "title": d.name,
            "is_seed": seed, "book_chapter_no": no}
    if seed:
        chain = db.execute(select(ChainNode).where(ChainNode.domain_id == d.id)
                           .order_by(ChainNode.level)).scalars().all()
        rels = db.execute(select(KnowledgeRelation).where(
            KnowledgeRelation.domain_id == d.id)).scalars().all()
        pairs = db.execute(select(ConfusionPair).where(ConfusionPair.domain_id == d.id)).scalars().all()
        return {**base, "source": "seed",
                "graph": {"chain": [{"level": c.level, "title": c.title, "summary": c.summary}
                                    for c in chain],
                          "relations": [{"source": r.source, "edge": r.edge, "target": r.target,
                                         "note": r.note} for r in rels],
                          "confusion": [{"drug_a": p.drug_a, "drug_b": p.drug_b,
                                         "distinction": p.distinction_text} for p in pairs]}}
    sy = db.execute(select(SyllabusChapter).where(
        SyllabusChapter.book_chapter_no == no)).scalar_one_or_none() if no else None
    if sy is not None:
        def clean(x):  # 规整大纲 JSON（可能多层字符串）
            return _json_field(sy, x)
        return {**base, "source": "syllabus",
                "chapter": {"no": sy.book_chapter_no, "title": sy.title,
                            "objectives": clean("objectives") or {},
                            "key_points": clean("key_points") or [],
                            "difficulties": clean("difficulties") or [],
                            "sections": clean("sections") or []}}
    return {**base, "source": "none", "chapter": None}


class MaterialQuizIn(BaseModel):
    """随堂自测提交：answers: {question_id: option_key}，服务端判分。"""

    answers: dict[str, str] = {}


@router.get("/users/{user_id}/study-map/{domain_id}/quiz")
def get_study_quiz(user_id: str, domain_id: str, db: Session = Depends(get_db)):
    """知识图谱节点随堂摸底：抽本域 published 未作答题（与学习材料自测同池规则）。"""
    _active_user(user_id, db)
    db.get(DiagnosticDomain, domain_id) or _404()
    pool = _domain_quiz_pool(db, domain_id, user_id, limit=3)
    return {"domain_id": domain_id, "questions": [
        {"id": q.id, "code": q.code, "stem": q.stem, "options": q.options} for q in pool]}


@router.post("/users/{user_id}/study-map/{domain_id}/quiz/submit")
def submit_study_quiz(user_id: str, domain_id: str, body: MaterialQuizIn,
                      db: Session = Depends(get_db)):
    """随堂摸底判分并写学习进度：≥60% 通过 → 该域 StudyProgress 置「已达标」；
    该域「薄弱」掌握行同步 mastery.material_passed（薄弱→学习中）——含章级行
    （category=None，一学一练配对的学习任务完成后进「学习中」，再用练习达标）。"""
    _active_user(user_id, db)
    d = db.get(DiagnosticDomain, domain_id) or _404()
    correct = total = 0
    detail = []
    for qid, opt in body.answers.items():
        q = db.get(Question, qid)
        if not q or q.domain_id != domain_id:
            continue
        total += 1
        ok = opt == q.answer
        correct += 1 if ok else 0
        detail.append({"question_id": qid, "correct": ok, "answer": q.answer})
    passed = total > 0 and correct / total >= 0.6
    prog = db.get(StudyProgress, (user_id, domain_id))
    if prog is None:
        prog = StudyProgress(user_id=user_id, domain_id=domain_id, state="未学",
                             best_score=0, quiz_total=0)
        db.add(prog)
    if passed:
        prog.state = "已达标"
        prog.best_score = max(float(prog.best_score or 0), correct / total)
        prog.quiz_total = max(prog.quiz_total or 0, total)
        # 该域「薄弱」掌握行（错因级 + 章级）→ 薄弱→学习中；已学习中以上幂等、无副作用。
        weak_rows = db.execute(select(MasteryState).where(
            MasteryState.user_id == user_id, MasteryState.domain_id == domain_id,
            MasteryState.state == "薄弱")).scalars().all()
        for r in weak_rows:
            mastery.transition(db, user_id, domain_id, r.category, "material_passed")
    db.commit()
    audit(db, "student", "study.quiz", f"{user_id}/{domain_id}",
          passed=passed, correct=correct, total=total)
    return {"passed": passed, "correct": correct, "total": total, "detail": detail,
            "note": "该章已达标，可继续学下一节或进入摸底。" if passed
            else "未通过：回看本章知识点后重试。"}


@router.get("/materials/{domain_id}")
def get_materials(domain_id: str, db: Session = Depends(get_db)):
    """学习材料：推理链 + 混淆对辨析 + 题目证据要点 + 结构化知识关系（FR-A2 图谱）。

    现有合法内容组装；knowledge_relations 为种子域 FR-A2 最小图谱（draft，待顾问）。
    """
    from .models import ChainNode, ConfusionPair, KnowledgeRelation, Question, QuestionEvidence
    domain = db.get(DiagnosticDomain, domain_id) or _404()
    chain = db.execute(select(ChainNode).where(ChainNode.domain_id == domain.id)
                       .order_by(ChainNode.level)).scalars().all()
    pairs = db.execute(select(ConfusionPair).where(ConfusionPair.domain_id == domain.id)).scalars().all()
    rels = db.execute(select(KnowledgeRelation).where(
        KnowledgeRelation.domain_id == domain.id)).scalars().all()
    qs = db.execute(select(Question).where(Question.domain_id == domain.id,
                                           Question.review_status == "published")).scalars().all()
    evidence = []
    for q in qs:
        for ev in db.execute(select(QuestionEvidence).where(
                QuestionEvidence.question_id == q.id)).scalars():
            if ev.content_text:
                evidence.append({"ref": q.code, "text": ev.content_text})
    # FR-A2 图谱：源节点—边→目标节点；status=draft 属内容待顾问（演示属种子域已审口径）
    return {"domain": {"code": domain.code, "name": domain.name, "chapter_ref": domain.chapter_ref},
            "chain": [{"level": c.level, "title": c.title, "summary": c.summary} for c in chain],
            "confusion_pairs": [{"drug_a": p.drug_a, "drug_b": p.drug_b,
                                 "distinction": p.distinction_text} for p in pairs],
            "knowledge_relations": [{"source": r.source, "edge": r.edge, "target": r.target,
                                     "note": r.note} for r in rels],
            "evidence": evidence[:6]}


def _domain_quiz_pool(db: Session, domain_id: str, user_id: str, limit: int = 3):
    """学习随堂自测题池：本域 published 题，剔除用户已作答过的（真实检验"学没学会"）。
    优先取 training/retest 变式池（不挤占 diagnostic 诊断题），不足再回退任何未答过的本域题。"""
    from .models import Attempt
    answered = set(db.execute(select(Attempt.question_id).where(
        Attempt.user_id == user_id)).scalars())
    qs = db.execute(select(Question).where(
        Question.domain_id == domain_id, Question.review_status == "published")).scalars().all()
    unseen = [q for q in qs if q.id not in answered]
    pref = [q for q in unseen if q.usage in ("training", "retest")]
    pool = (pref or unseen)[:limit]
    return pool


@router.get("/users/{user_id}/learning-plan/{domain_id}/quiz")
def get_material_quiz(user_id: str, domain_id: str, db: Session = Depends(get_db)):
    """学习随堂自测（检验学习程度，2026-09-08）：读完本域材料后作答本域未做过的题，
    答对 ≥60% 视作该域薄弱错因已完成学习（material_passed，薄弱→学习中）。
    id 幂等：以 domain 的题资产为内容源，无状态副作用。"""
    _active_user(user_id, db)
    db.get(DiagnosticDomain, domain_id) or _404()
    pool = _domain_quiz_pool(db, domain_id, user_id)
    return {"domain_id": domain_id, "questions": [
        {"id": q.id, "code": q.code, "stem": q.stem,
         "options": q.options} for q in pool]}


@router.post("/users/{user_id}/learning-plan/{domain_id}/quiz/submit")
def submit_material_quiz(user_id: str, domain_id: str, body: MaterialQuizIn,
                         db: Session = Depends(get_db)):
    """随堂自测判分并推进：通过(≥60%)→ 该域所有当前「薄弱」的错因行 material_passed
    （薄弱→学习中），今日待办中这些错因的「学习材料」任务随之出列。"""
    _active_user(user_id, db)
    from .models import MasteryState
    correct = total = 0
    detail = []
    for qid, opt in body.answers.items():
        q = db.get(Question, qid)
        if not q or q.domain_id != domain_id:
            continue
        total += 1
        ok = opt == q.answer
        correct += 1 if ok else 0
        detail.append({"question_id": qid, "correct": ok, "answer": q.answer})
    passed = total > 0 and correct / total >= 0.6
    if passed:
        rows = db.execute(select(MasteryState).where(
            MasteryState.user_id == user_id, MasteryState.domain_id == domain_id,
            MasteryState.category.isnot(None), MasteryState.state == "薄弱")).scalars().all()
        for r in rows:
            mastery.transition(db, user_id, r.domain_id, r.category, "material_passed")
    db.commit()
    audit(db, "student", "material.quiz", f"{user_id}/{domain_id}",
          passed=passed, correct=correct, total=total)
    return {"passed": passed, "correct": correct, "total": total,
            "detail": detail,
            "note": "自测通过，该域薄弱错因已完成学习，进入练习阶段。" if passed
            else "未通过：再回看一遍材料后重试。"}


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


# ---------- 学习档案聚合（能力画像实时版，2026-09-09） ----------
CATS = ["知识遗忘", "概念混淆", "机制理解不足", "审题与应用失误", "待诊断"]


def _wrong_category(db: Session, attempt_id: str) -> str:
    """错题的错因归因类别：取诊断会话 hypothesis 的 misconception.category；未诊断为待诊断。"""
    s = db.execute(select(DiagnosisSession).where(
        DiagnosisSession.attempt_id == attempt_id)).scalar_one_or_none()
    if s and s.hypothesis_id:
        m = db.get(Misconception, s.hypothesis_id)
        if m:
            return m.category
    return "待诊断"


@router.get("/users/{user_id}/archive")
def user_archive(user_id: str, db: Session = Depends(get_db)):
    """学习档案聚合（2026-09-09）：档案页 = 能力画像随时间演进，而非摸底一次性快照。

    汇总累计作答/掌握/训练 + 域正确率 + 域×错因热力图 + 错因类别占比，
    供前端学习档案页渲染统计卡片、热力图、掌握度总览。
    """
    _active_user(user_id, db)
    from .models import Attempt, TrainingSession, DiagnosisSession as DS
    attempts = db.execute(select(Attempt).where(Attempt.user_id == user_id)).scalars().all()
    total = len(attempts)
    correct = sum(1 for a in attempts if a.is_correct)
    wrong = total - correct

    # question_id → domain_id（Attempt 不冗余 domain，经题归属）
    qid_list = [a.question_id for a in attempts] or [""]
    q_domain = {q.id: q.domain_id for q in db.execute(
        select(Question).where(Question.id.in_(qid_list))).scalars()}
    dom_map = {d.id: d for d in db.execute(select(DiagnosticDomain)).scalars()}

    # 域统计（作答域）
    qmap = {}
    for a in attempts:
        did = q_domain.get(a.question_id)
        if not did:
            continue
        d = qmap.setdefault(did, {"correct": 0, "attempts": 0, "wrong": 0})
        d["attempts"] += 1
        if a.is_correct:
            d["correct"] += 1
        else:
            d["wrong"] += 1
    domain_stats = []
    for did, s in qmap.items():
        dd = dom_map.get(did)
        domain_stats.append({
            "domain_id": did, "domain": dd.name if dd else did,
            "chapter_ref": dd.chapter_ref if dd else "",
            "attempts": s["attempts"], "correct": s["correct"],
            "rate": round(s["correct"] / s["attempts"], 3)})
    domain_stats.sort(key=lambda x: x["attempts"], reverse=True)

    # 域×错因 热力图（错题按归因）
    heat_cell: dict = {}
    wrong_attempts = [a for a in attempts if not a.is_correct]
    for a in wrong_attempts:
        did = q_domain.get(a.question_id)
        if not did:
            continue
        dd = dom_map.get(did)
        dname = dd.name if dd else "未知域"
        cat = _wrong_category(db, a.id)
        heat_cell[(dname, cat)] = heat_cell.get((dname, cat), 0) + 1
    domains_order = sorted({k[0] for k in heat_cell})
    values = [[heat_cell.get((d, c), 0) for c in CATS] for d in domains_order]
    category_dist = {c: sum(heat_cell.get((d, c), 0) for d in domains_order) for c in CATS}

    # 训练统计
    # 训练会话经 DiagnosisSession.attempt_id 归属 user
    trained = 0
    training_passed = 0
    sessions = db.execute(select(DS).where(DS.attempt_id.in_(
        [a.id for a in attempts] or [""]))).scalars().all()
    ts_rows = db.execute(select(TrainingSession)).scalars().all()
    diag_by_id = {s.id: s for s in sessions}
    for ts in ts_rows:
        if ts.status != "completed":
            continue
        s = diag_by_id.get(ts.diagnosis_id)
        if not s:
            continue
        a = db.get(Attempt, s.attempt_id)
        if a and a.user_id == user_id:
            trained += 1
            if ts.score is not None and ts.score >= 0.6:
                training_passed += 1

    # 掌握度总览
    rows = db.execute(select(MasteryState).where(MasteryState.user_id == user_id)).scalars().all()
    state_count = {}
    mastery_list = []
    for r in rows:
        state_count[r.state] = state_count.get(r.state, 0) + 1
        dd = dom_map.get(r.domain_id)
        mastery_list.append({
            "domain_id": r.domain_id, "domain": dd.name if dd else r.domain_id,
            "category": r.category, "state": r.state, "reason": r.reason})
    done_states = {"掌握", "稳定掌握"}

    return {
        "summary": {
            "attempts": total, "correct": correct, "wrong": wrong,
            "accuracy": round(correct / total, 3) if total else 0.0,
            "wrong_book": len(wrong_attempts),
            "diagnosed": sum(1 for a in wrong_attempts if _wrong_category(db, a.id) != "待诊断"),
            "trained": trained, "training_passed": training_passed,
            "mastery_rows": len(rows),
            "mastery_done": sum(1 for r in rows if r.state in done_states),
            "categories": len(CATS),
        },
        "domain_stats": domain_stats,
        "heatmap": {"domains": domains_order, "categories": CATS, "values": values},
        "category_dist": category_dist,
        "mastery": mastery_list,
    }


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


# ---------- 问 AI（课程问答：BM25 教材切片检索 + grounded 生成） ----------
#
# 设计说明（v1.1 §5.1 模型任务边界 + 合规红线）：
# - 只答《药理学》课程问题；用药决策类一律规则前置拒绝（模型不做用药/医疗决策）。
# - 无检索命中 → 诚实拒答，不调模型；引用只转述/短引，不贴教材原文（版权）。
# - Provider 独立于全局 model_provider：诊断链路保持 Mock 确定性可回放，
#   问答单独走 ExternalApiProvider（有 key）；无 key 降级 Mock 摘录（演示/测试可复现）。
# - 外发给模型的只有去标识化问题 + 课程公开切片（UUID 用户，无学号姓名）；
#   问答全文记 ModelRun（consent「对话原文」覆盖），audit 只记长度/哈希最小必要字段。

QA_QUESTION_MAXLEN = 500
QA_SLICE_CHARS = 700   # 每条切片喂模型的上限（教材为页内窗口，题库为题干+答案+解析）
QA_TOP_K = 6           # 双路混合召回条数（对比/求同类问题需要多条切片才能归纳）
QA_REFUSE_MEDICATION = ("该吃", "剂量", "怎么吃", "能吃吗", "能不能吃", "处方", "开药",
                        "替我开", "我孩子", "孕妇", "哺乳", "用药建议", "吃多少",
                        "停药", "换药", "几天能好", "要不要去医院")


class QAIn(BaseModel):
    question: str = Field(..., max_length=QA_QUESTION_MAXLEN)


@router.post("/users/{user_id}/qa/ask")
def qa_ask(user_id: str, body: QAIn, db: Session = Depends(get_db)):
    """问 AI 单轮问答（P0 无历史；多轮为后续项）。"""
    user = _active_user(user_id, db)
    if not user.consented:
        raise HTTPException(403, "请先完成知情同意（含学习数据采集同意）后再使用问 AI")
    q = (body.question or "").strip()
    if not q:
        raise HTTPException(422, "问题不能为空")

    # 1) 用药决策类：规则前置拒绝，不调模型不检索
    if any(k in q for k in QA_REFUSE_MEDICATION):
        audit(db, user_id, "qa.refused_medication", f"user:{user_id}", q_len=len(q))
        db.commit()
        return {"answer": "这个问题涉及具体用药决策，本系统不提供用药建议。你可以问我课程里的机制、分类与辨析（比如「阿托品为什么会散瞳」），用药问题请咨询医师或药师。",
                "citations": [], "refused": True, "refuse_reason": "medication",
                "provider": "rule", "note": "规则前置拒绝，未调用模型。"}

    # 2) 双路混合检索（教材页 + 题库解析）；无命中 → 诚实拒答
    from .rag import retrieve_mixed
    hits = retrieve_mixed(q, k=QA_TOP_K, db=db)
    if not hits:
        audit(db, user_id, "qa.refused_no_evidence", f"user:{user_id}", q_len=len(q))
        db.commit()
        return {"answer": "课程库里暂时没找到相关内容（教材切片与题库解析均无命中）。换个问法试试（带上药物名或章节名），也可以先去「今日待办」学对应章节再来问。",
                "citations": [], "refused": True, "refuse_reason": "no_evidence",
                "provider": "retriever", "note": "无检索命中，未调用模型。"}
    refs = [{"ref": f"[{i + 1}]", "source": h.source,
             "chapter": h.chapter, "book_page": h.book_page, "code": h.code,
             "label": h.label}
            for i, h in enumerate(hits)]
    slices = "\n\n".join(
        f"[{i + 1}]({h.label}) {h.text[:QA_SLICE_CHARS]}"
        for i, h in enumerate(hits))

    # 3) 生成：有 key 走真模型；无 key/失败走 Mock 摘录
    try:
        from .llm.provider import ExternalApiProvider
        provider = ExternalApiProvider()
    except Exception as e:  # ProviderError（含无 key）→ 演示降级
        cites = "、".join(dict.fromkeys(h.label for h in hits))
        audit(db, user_id, "qa.mock_fallback", f"user:{user_id}",
              q_len=len(q), reason=str(e)[:80])
        db.commit()
        return {"answer": f"（演示模式：真模型未接入）课程库中找到 {len(refs)} 处相关内容（{cites}）。先去对应章节学习，再带着更具体的问题来问——比如把问题细化到某个药物或某个机制环节。",
                "citations": refs, "refused": False, "refuse_reason": None,
                "provider": "mock", "note": "计划态：真模型（GLM）接入后此条由模型 grounded 生成。"}

    from .llm.provider import ProviderError
    try:
        r = provider.answer_with_refs(question=q, slices=slices, n_refs=len(refs))
    except ProviderError as e:
        audit(db, user_id, "qa.provider_error", f"user:{user_id}", q_len=len(q),
              reason=str(e)[:80])
        db.commit()
        return {"answer": "刚才模型开小差了（已自动降级）。你可以先去对应章节看看材料，稍后再问一次。",
                "citations": refs, "refused": True, "refuse_reason": "provider_error",
                "provider": "mock", "note": "真模型调用失败，已降级，引用为本次检索切片。"}
    cites = [refs[i - 1] for i in r["used_refs"]]
    audit(db, user_id, "qa.answered", f"user:{user_id}", q_len=len(q),
          answer_len=len(r["answer"]), used_refs=r["used_refs"], refused=r["refused"])
    db.commit()
    return {"answer": r["answer"], "citations": cites,
            "refused": r["refused"],
            "refuse_reason": "no_grounding" if r["refused"] else None,
            "provider": "external_api",
            "note": "回答由课程资料切片（教材原文 + 题库题目解析）grounded 生成，仅供学习参考，不保证完全正确；不提供用药建议。"}


def _404():
    raise HTTPException(404, "资源不存在")
