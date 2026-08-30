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
        ("选项标注", f"question:{question.id}", f"学生选择 {attempt.selected_option}，正确答案为 {question.answer}"),
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
        # 证据不足：仍直接出卡（低证据 + 候选错因），追问降级为卡上的可选细化（产品决策 2026-08-30）
        session.can_refine = True
        _diagnose(db, session, top.misconception_id, "低")
        audit(db, "system", "diagnosis.can_refine", session.id, hypothesis=top.misconception_id)


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
    db.commit()  # 显式提交：mastery 幂等分支不 commit，缺此行会导致升级被回滚
    return session


# ---------- 追问（FollowupRunner） ----------

def current_followup(db: Session, session: DiagnosisSession) -> FollowupNode | None:
    if not (session.state == "followup_required" or
            (session.state == "diagnosed" and session.can_refine)):
        return None
    node_ids = db.execute(select(MisconceptionFollowup.followup_node_id).where(
        MisconceptionFollowup.misconception_id == session.hypothesis_id)).scalars().all()
    used = set(db.execute(select(FollowupTurn.node_id).where(
        FollowupTurn.session_id == session.id)).scalars())
    if node_ids:
        nodes = [db.get(FollowupNode, n) for n in node_ids if n not in used]
        nodes = [n for n in nodes if n]
        nodes.sort(key=lambda n: n.code)  # 确定性：追问顺序固定，保证评测可回放
        if nodes:
            return {"kind": "node", "node": nodes[0]}
    fallback = _fallback_node(db, session)
    if fallback:
        return {"kind": "node", "node": fallback}
    # 对话节点用尽/不存在 → 跨题验证：出一道标注了主要候选错因的定向题（demo 机制）
    return _verify_question(db, session)


def _fallback_node(db: Session, session: DiagnosisSession):
    if not session.chain_focus:
        return None
    return db.execute(select(FollowupNode).where(
        FollowupNode.domain_id == _domain_of(db, session),
        FollowupNode.chain_level == session.chain_focus,
        FollowupNode.review_status == "published")).scalars().first()


def _verify_question(db: Session, session: DiagnosisSession):
    """跨题验证（demo 机制）：按主要候选错因选一道学生未做过的同域题。
    答对 → 确认主要假设（区别于知识遗忘：遗忘者此题也会错）；答错 → 按干扰项信号切换假设。"""
    from ..models import Attempt, Question
    attempt = db.get(Attempt, session.attempt_id)
    mis = db.get(Misconception, session.hypothesis_id)
    answered = set(db.execute(select(Attempt.question_id).where(
        Attempt.user_id == attempt.user_id)).scalars())
    answered.add(attempt.question_id)
    pool = db.execute(select(Question).where(
        Question.domain_id == mis.domain_id, Question.usage == "diagnostic",
        Question.review_status == "published")).scalars().all()
    cands = [q for q in pool
             if q.id not in answered
             and mis.code in [(s or {}).get("misconception") for s in (q.distractor_signals or {}).values()]]
    if not cands:  # 无精确标注题时兜底：任何未做过的同域诊断题（同域新题即可作跨题验证）
        cands = [q for q in pool if q.id not in answered]
    if not cands:
        return None
    return {"kind": "verify", "question": cands[0]}


def _domain_of(db: Session, session: DiagnosisSession) -> str:
    attempt = db.get(Attempt, session.attempt_id)
    return db.get(Question, attempt.question_id).domain_id


def answer_followup(db: Session, session: DiagnosisSession, payload: dict) -> DiagnosisSession:
    """payload: {"option_key": "A"} 或 {"text": "…"}；payload.get("skip") 为跳过。
    追问为诊断后的可选细化：state=diagnosed 且 can_refine 时可用（产品决策 2026-08-30）。"""
    refining = session.state == "diagnosed" and session.can_refine
    if session.state != "followup_required" and not refining:
        raise ValueError(f"会话状态 {session.state} 不接受追问回答")
    fu = current_followup(db, session)
    if fu is None:  # 无可用追问/验证题 → 维持当前归因，结束细化
        session.can_refine = False
        db.commit()
        return session
    if fu["kind"] == "verify":
        return _answer_verify(db, session, fu["question"], payload)

    node = fu["node"]
    session.followup_count += 1
    turn_no = session.followup_count
    if payload.get("skip"):
        db.add(FollowupTurn(session_id=session.id, node_id=node.id, presented_text=node.question_text,
                            student_answer="", judge_method="skipped", turn_no=turn_no, skipped=True))
        audit(db, "student", "diagnosis.followup_skipped", session.id, turn_no=turn_no)
        session.can_refine = False
        db.commit()
        return session

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
        # 追问坐实原假设：证据链补全，升级为高并结束细化
        session.can_refine = False
        return _diagnose(db, session, session.hypothesis_id, "高")
    if supports and supports != session.hypothesis_id:
        # 追问指向另一错因：切换假设；轮次用尽则维持低证据并结束细化
        session.hypothesis_id = supports
        if turn_no >= MAX_FOLLOWUP_ROUNDS:
            session.can_refine = False
            db.commit()
            return _diagnose(db, session, supports, "低")
    # 未区分：轮次用尽 → 维持低证据，结束细化；否则继续追问
    if turn_no >= MAX_FOLLOWUP_ROUNDS:
        session.can_refine = False
        db.commit()
        return session
    db.commit()
    return session


def _answer_verify(db: Session, session: DiagnosisSession, question, payload: dict) -> DiagnosisSession:
    """跨题验证判分：答对 → 确认主要假设（升高）；答错 → 按该题干扰项信号切换/维持。"""
    import json as _json
    session.followup_count += 1
    turn_no = session.followup_count
    picked = payload.get("option_key") or ""
    correct = picked == question.answer
    db.add(FollowupTurn(session_id=session.id, node_id=None, verify_question_id=question.id,
                        presented_text=question.stem, student_answer=picked,
                        judge_method="verify", judge_result={"correct": correct}, turn_no=turn_no))
    audit(db, "student", "diagnosis.verify_answered", session.id, turn_no=turn_no, correct=correct)

    if correct:
        # 验证题答对：排除知识遗忘类解释，确认主要候选（概念混淆者的变式题往往做对）
        session.can_refine = False
        db.commit()
        return _diagnose(db, session, session.hypothesis_id, "高")
    # 答错：按该题干扰项信号切换假设；无信号或轮尽 → 维持低证据
    sig = (question.distractor_signals or {}).get(picked) or {}
    alt = _mis_by_code(db, sig.get("misconception")) if sig.get("misconception") else None
    if alt and alt.id != session.hypothesis_id:
        session.hypothesis_id = alt.id
    session.can_refine = False
    db.commit()
    return _diagnose(db, session, session.hypothesis_id, "低")


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
