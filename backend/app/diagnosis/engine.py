"""诊断引擎（v1.1 §5）：五级漏斗 + 断环追问状态机。

W1 简化：引擎在请求内同步执行（Mock 模型零延迟）；W2 换真实模型时改为
APScheduler 领取（SKIP LOCKED）+ 逐步落库，引擎接口不变。
追问判定优先级：option_signal（精确）> keyword > model 三分类。
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..llm.provider import get_provider
from ..misconceptions.service import route_intervention
from ..models import (
    Attempt, ChainNode, DiagnosisCandidate, DiagnosisEvidence, DiagnosisSession,
    FollowupTurn, FollowupNode, Misconception, MisconceptionFollowup, Question,
    QuestionEvidence, TrainingSession, TrainingSessionQuestion, audit,
)
from ..mastery import engine as mastery

MAX_FOLLOWUP_ROUNDS = 3
SUFFICIENCY_MARGIN = 0.2
HIGH_SCORE = 0.6


def start_session(db: Session, attempt: Attempt) -> DiagnosisSession:
    """作答落库后启动会话并跑完 ①②③④ 级；证据不足停在 followup_required。"""
    question = db.get(Question, attempt.question_id)
    session = DiagnosisSession(attempt_id=attempt.id, state="submitted",
                               chain_focus=(question.chain_levels or [None])[0])
    db.add(session)
    db.flush()
    audit(db, "system", "diagnosis.state", session.id, to="submitted")
    _collect_evidence(db, session, attempt, question)
    _filter_candidates(db, session, attempt, question)
    provider = get_provider()
    t0 = time_ms()
    ranked = provider.rerank([{"misconception_id": c.misconception_id, "rule_score": float(c.rule_score),
                               "retrieval_score": float(c.retrieval_score)} for c in session.candidates])
    provider.log_run("rerank", {"session": session.id, "ranked": ranked},
                     time_ms() - t0 or 1, db)
    for c in session.candidates:
        for r in ranked:
            if r["misconception_id"] == c.misconception_id:
                c.rerank_score, c.final_rank = r["rerank_score"], r["final_rank"]
    session.state = "candidates_retrieved"
    audit(db, "system", "diagnosis.state", session.id, to="candidates_retrieved")
    _sufficiency(db, session)
    db.commit()
    return session


def _collect_evidence(db: Session, session: DiagnosisSession, attempt: Attempt, question: Question):
    evidences = [
        ("选项标注", f"question:{question.id}", f"学生选择 {attempt.selected_option}（正确 {question.answer}）"),
    ]
    if attempt.rationale:
        evidences.append(("作答理由", f"attempt:{attempt.id}", attempt.rationale))
    for chunk in db.execute(select(QuestionEvidence).where(
            QuestionEvidence.question_id == question.id)).scalars():
        evidences.append(("知识库切片", chunk.evidence_chunk_id, chunk.content_text))
    for etype, ref, content in evidences:
        db.add(DiagnosisEvidence(session_id=session.id, evidence_type=etype, source_ref=ref, content=content))
    session.state = "evidence_collected"


def _mis_by_code(db: Session, code: str) -> Misconception | None:
    """种子/标注里引用错因一律用 code（MIS-…），库内主键是 uuid，这里做解析。"""
    if code is None:
        return None
    if code.startswith("MIS-"):
        return db.execute(select(Misconception).where(Misconception.code == code)).scalar_one_or_none()
    return db.get(Misconception, code)


def _filter_candidates(db: Session, session: DiagnosisSession, attempt: Attempt, question: Question):
    """② 规则过滤：干扰项预标注为主信号；无命中时回退该域全部错因（权重压低）。"""
    signal = (question.distractor_signals or {}).get(attempt.selected_option)
    domain_mis = db.execute(select(Misconception).where(
        Misconception.domain_id == question.domain_id, Misconception.status == "published")).scalars().all()
    if signal and signal.get("misconception"):
        primary = _mis_by_code(db, signal["misconception"])
        rows = [(primary.id, float(signal.get("weight", 0.8)))] if primary else []
        if primary:
            for m in domain_mis:  # 同类别近似候选，供追问区分
                if m.id != primary.id and m.category == primary.category:
                    rows.append((m.id, round(float(signal.get("weight", 0.8)) - 0.25, 3)))
    else:
        rows = [(m.id, 0.3) for m in domain_mis]
    seen = set()
    for mid, score in rows:
        if mid in seen or db.get(Misconception, mid) is None:
            continue
        seen.add(mid)
        db.add(DiagnosisCandidate(session_id=session.id, misconception_id=mid,
                                  rule_score=score, retrieval_score=0.0))
    db.flush()  # autoflush=False：关系加载前显式落库


def _sufficiency(db: Session, session: DiagnosisSession):
    """⑤ 充分性门禁：Top1 分数与候选间距决定出卡还是追问。
    出题人可在干扰项信号标注 needs_followup=true（干扰项只区分到类别级，
    需追问坐实具体错因），此时无论分差多少都进入追问。"""
    ranked = sorted(session.candidates, key=lambda c: (-float(c.rerank_score or 0)))
    if not ranked:  # 无候选：不强制归因，停在 diagnosed-前置或直接低证据出卡
        session.state = "diagnosed"
        session.evidence_level = "低"
        audit(db, "system", "diagnosis.state", session.id, to="diagnosed", evidence_level="低", note="无候选")
        db.commit()
        return
    top, second = ranked[0], (ranked[1] if len(ranked) > 1 else None)
    margin = (float(top.rerank_score) - float(second.rerank_score)) if second else 1.0
    attempt = db.get(Attempt, session.attempt_id)
    question = db.get(Question, attempt.question_id)
    signal = (question.distractor_signals or {}).get(attempt.selected_option) or {}
    if float(top.rerank_score) >= HIGH_SCORE and margin >= SUFFICIENCY_MARGIN and not signal.get("needs_followup"):
        _diagnose(db, session, top.misconception_id, "中")
    else:
        session.state = "followup_required"
        session.hypothesis_id = top.misconception_id
        audit(db, "system", "diagnosis.state", session.id, to="followup_required",
              hypothesis=top.misconception_id)


def _diagnose(db: Session, session: DiagnosisSession, misconception_id: str, level: str):
    session.hypothesis_id = misconception_id
    session.evidence_level = level
    session.state = "diagnosed"
    audit(db, "system", "diagnosis.state", session.id, to="diagnosed",
          misconception=misconception_id, evidence_level=level)
    attempt = db.get(Attempt, session.attempt_id)
    question = db.get(Question, attempt.question_id)
    mastery.transition(db, attempt.user_id, question.domain_id,
                       db.get(Misconception, misconception_id).category, "diagnosed")
    route_intervention(db, session)
    return session


# ---------- 追问（FollowupRunner） ----------

def current_followup(db: Session, session: DiagnosisSession) -> FollowupNode | None:
    if session.state != "followup_required":
        return None
    node_ids = db.execute(select(MisconceptionFollowup.followup_node_id).where(
        MisconceptionFollowup.misconception_id == session.hypothesis_id)).scalars().all()
    used = set(db.execute(select(FollowupTurn.node_id).where(
        FollowupTurn.session_id == session.id)).scalars())
    if node_ids:
        nodes = [db.get(FollowupNode, n) for n in node_ids if n not in used]
        nodes = [n for n in nodes if n]
        nodes.sort(key=lambda n: n.code)  # 确定性：追问顺序固定，保证评测可回放
        return nodes[0] if nodes else None
    return _fallback_node(db, session)


def _fallback_node(db: Session, session: DiagnosisSession):
    if not session.chain_focus:
        return None
    return db.execute(select(FollowupNode).where(
        FollowupNode.domain_id == _domain_of(db, session),
        FollowupNode.chain_level == session.chain_focus,
        FollowupNode.review_status == "published")).scalars().first()


def _domain_of(db: Session, session: DiagnosisSession) -> str:
    attempt = db.get(Attempt, session.attempt_id)
    return db.get(Question, attempt.question_id).domain_id


def answer_followup(db: Session, session: DiagnosisSession, payload: dict) -> DiagnosisSession:
    """payload: {"option_key": "A"} 或 {"text": "…"}；payload.get("skip") 为跳过。"""
    if session.state != "followup_required":
        raise ValueError(f"会话状态 {session.state} 不接受追问回答")
    node = current_followup(db, session)
    if node is None:  # 无可用追问节点 → 直接低证据收敛
        return _diagnose(db, session, session.hypothesis_id, "低")

    session.followup_count += 1
    turn_no = session.followup_count
    if payload.get("skip"):
        db.add(FollowupTurn(session_id=session.id, node_id=node.id, presented_text=node.question_text,
                            student_answer="", judge_method="skipped", turn_no=turn_no, skipped=True))
        audit(db, "student", "diagnosis.followup_skipped", session.id, turn_no=turn_no)
        return _diagnose(db, session, session.hypothesis_id, "低")

    if payload.get("option_key") and node.option_signals:
        sig = node.option_signals.get(payload["option_key"])
        method, result = "option_signal", {"signal": sig}
        supported = sig.get("supports") if sig else None
        if sig:
            session.chain_focus = max(1, min(6, (session.chain_focus or 3) + int(sig.get("shift", 0))))
    else:
        provider = get_provider()
        result = provider.judge_open_answer(payload.get("text", ""), node.open_judge or {})
        method = "keyword"
        supported = result.get("supports") if result.get("accepted") else None
        db_text = payload.get("text", "")

    supports = _mis_by_code(db, supported).id if supported else None
    db.add(FollowupTurn(session_id=session.id, node_id=node.id,
                        presented_text=node.question_text,
                        student_answer=payload.get("option_key") or payload.get("text", ""),
                        judge_method=method, judge_result=result, turn_no=turn_no))
    audit(db, "student", "diagnosis.followup_answered", session.id, turn_no=turn_no, method=method)

    if supports and supports == session.hypothesis_id:
        # 追问坐实原假设：证据等级升为中，收敛
        return _diagnose(db, session, session.hypothesis_id, "中")
    if supports and supports != session.hypothesis_id:
        # 追问指向另一错因：切换假设；轮次用尽则低证据收敛
        session.hypothesis_id = supports
        if turn_no >= MAX_FOLLOWUP_ROUNDS:
            return _diagnose(db, session, supports, "低")
        session.state = "followup_required"
        db.commit()
        return session
    # 未区分：轮次用尽 → 低证据收敛；否则继续追问
    if turn_no >= MAX_FOLLOWUP_ROUNDS:
        return _diagnose(db, session, session.hypothesis_id, "低")
    session.state = "followup_required"
    db.commit()
    return session


def time_ms() -> int:
    import time as _t
    return int(_t.time() * 1000)


def start_training(db: Session, session: DiagnosisSession):
    """按错因×干预路由取训练题（W1 从审核题池选同域同错因标注题）。"""
    if session.state != "diagnosed":
        raise ValueError(f"会话状态 {session.state} 不能开始训练")
    misconception = db.get(Misconception, session.hypothesis_id)
    attempt = db.get(Attempt, session.attempt_id)
    question = db.get(Question, attempt.question_id)
    pool = db.execute(select(Question).where(
        Question.domain_id == question.domain_id, Question.usage == "training",
        Question.review_status == "published")).scalars().all()
    picked = [q for q in pool
              if misconception.code in [(s or {}).get("misconception") for s in (q.distractor_signals or {}).values()]]
    rest = [q for q in pool if q not in picked]  # 补足至 3 道，保持训练量
    picked = (picked + rest)[:3]
    if not picked:  # 题池不足：回退同域训练题
        picked = pool[:3]
    ts = TrainingSession(diagnosis_id=session.id,
                         source="审核题池", status="in_progress" if picked else "pending")
    db.add(ts)
    db.flush()
    for i, q in enumerate(picked):
        db.add(TrainingSessionQuestion(training_session_id=ts.id, question_id=q.id, sequence_no=i))
    session.state = "training"
    audit(db, "system", "diagnosis.state", session.id, to="training", training_id=ts.id)
    mastery.transition(db, attempt.user_id, question.domain_id, misconception.category, "training_started")
    db.commit()
    return ts
