# -*- coding: utf-8 -*-
"""跨题验证：候选错因无法区分时，系统出第二道定向验证题，按作答确认归因。"""
from pathlib import Path

# 1) 模型：FollowupTurn 允许记录验证题（node_id 可空 + question_id）
p = Path("app/models.py")
src = p.read_text(encoding="utf-8")
src = src.replace('''    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("diagnosis_sessions.id"))
    node_id: Mapped[str] = mapped_column(ForeignKey("followup_nodes.id"))''',
'''    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("diagnosis_sessions.id"))
    node_id: Mapped[str | None] = mapped_column(ForeignKey("followup_nodes.id"), nullable=True)
    verify_question_id: Mapped[str | None] = mapped_column(ForeignKey("questions.id"), nullable=True)''')
p.write_text(src, encoding="utf-8")

# 2) 引擎：current_followup 增加验证题形态；answer 支持验证题判分
p = Path("app/diagnosis/engine.py")
src = p.read_text(encoding="utf-8")

src = src.replace('''    if node_ids:
        nodes = [db.get(FollowupNode, n) for n in node_ids if n not in used]
        nodes = [n for n in nodes if n]
        nodes.sort(key=lambda n: n.code)  # 确定性：追问顺序固定，保证评测可回放
        return nodes[0] if nodes else None
    return _fallback_node(db, session)''',
'''    if node_ids:
        nodes = [db.get(FollowupNode, n) for n in node_ids if n not in used]
        nodes = [n for n in nodes if n]
        nodes.sort(key=lambda n: n.code)  # 确定性：追问顺序固定，保证评测可回放
        if nodes:
            return {"kind": "node", "node": nodes[0]}
    # 对话节点用尽/不存在 → 跨题验证：出一道标注了主要候选错因的定向题（demo 机制）
    return _verify_question(db, session)''')

src = src.replace('''def _fallback_node(db: Session, session: DiagnosisSession):
    if not session.chain_focus:
        return None
    return db.execute(select(FollowupNode).where(
        FollowupNode.domain_id == _domain_of(db, session),
        FollowupNode.chain_level == session.chain_focus,
        FollowupNode.review_status == "published")).scalars().first()''',
'''def _fallback_node(db: Session, session: DiagnosisSession):
    if not session.chain_focus:
        return None
    return db.execute(select(FollowupNode).where(
        FollowupNode.domain_id == _domain_of(db, session),
        FollowupNode.chain_level == session.chain_focus,
        FollowupNode.review_status == "published")).scalars().first()


def _verify_question(db: Session, session: DiagnosisSession):
    """跨题验证（demo 机制）：按主要候选错因选一道学生未做过的同域题。
    答对 → 确认主要假设（区别于知识遗忘：遗忘者此题也会错）；答错 → 按干扰项信号切换假设。"""
    from .models import Attempt, Question
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
    if not cands:
        return None
    return {"kind": "verify", "question": cands[0]}''')

# current_followup 返回统一为 dict 形态
src = src.replace('''    used = set(db.execute(select(FollowupTurn.node_id).where(
        FollowupTurn.session_id == session.id)).scalars())
    if node_ids:
        nodes = [db.get(FollowupNode, n) for n in node_ids if n not in used]
        nodes = [n for n in nodes if n]
        nodes.sort(key=lambda n: n.code)  # 确定性：追问顺序固定，保证评测可回放
        if nodes:
            return {"kind": "node", "node": nodes[0]}
    # 对话节点用尽/不存在 → 跨题验证：出一道标注了主要候选错因的定向题（demo 机制）
    return _verify_question(db, session)''',
'''    used = set(db.execute(select(FollowupTurn.node_id).where(
        FollowupTurn.session_id == session.id)).scalars())
    if node_ids:
        nodes = [db.get(FollowupNode, n) for n in node_ids if n not in used]
        nodes = [n for n in nodes if n]
        nodes.sort(key=lambda n: n.code)  # 确定性：追问顺序固定，保证评测可回放
        if nodes:
            return {"kind": "node", "node": nodes[0]}
    # 对话节点用尽/不存在 → 跨题验证：出一道标注了主要候选错因的定向题（demo 机制）
    return _verify_question(db, session)''')

# answer_followup：适配 dict 形态 + 验证题判分
src = src.replace('''    node = current_followup(db, session)
    if node is None:  # 无可用追问节点 → 维持当前归因，结束细化
        session.can_refine = False
        db.commit()
        return session''',
'''    fu = current_followup(db, session)
    if fu is None:  # 无可用追问/验证题 → 维持当前归因，结束细化
        session.can_refine = False
        db.commit()
        return session
    if fu["kind"] == "verify":
        return _answer_verify(db, session, fu["question"], payload)''')

src = src.replace('''    session.followup_count += 1
    turn_no = session.followup_count
    if payload.get("skip"):''',
'''    node = fu["node"]
    session.followup_count += 1
    turn_no = session.followup_count
    if payload.get("skip"):''')

# 新增验证题判分函数
src = src.replace('''def time_ms() -> int:''',
'''def _answer_verify(db: Session, session: DiagnosisSession, question, payload: dict) -> DiagnosisSession:
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


def time_ms() -> int:''')

p.write_text(src, encoding="utf-8")
print("engine ok")

# 3) router：GET /diagnoses 的 followup 字段带 kind + verify 题内容
p = Path("app/router.py")
src = p.read_text(encoding="utf-8")
src = src.replace('''    followup = dx.current_followup(db, s)
    return {
        "session_id": s.id, "state": s.state, "chain_focus": s.chain_focus,
        "followup_count": s.followup_count, "question": {"code": question.code, "stem": question.stem},
        "is_correct": attempt.is_correct, "answer": question.answer,
        "card": card,
        "followup": None if followup is None else {
            "node_id": followup.id, "question_text": followup.question_text,
            "options": followup.options, "turn_max": dx.MAX_FOLLOWUP_ROUNDS,
        },
    }''',
'''    followup = dx.current_followup(db, s)
    followup_out = None
    if isinstance(followup, dict) and followup["kind"] == "verify":
        q = followup["question"]
        followup_out = {"kind": "verify", "question": {
            "id": q.id, "stem": q.stem, "options": q.options}, "turn_max": dx.MAX_FOLLOWUP_ROUNDS}
    elif followup is not None:
        node = followup["node"] if isinstance(followup, dict) else followup
        followup_out = {"kind": "node", "node_id": node.id, "question_text": node.question_text,
                        "options": node.options, "turn_max": dx.MAX_FOLLOWUP_ROUNDS}
    return {
        "session_id": s.id, "state": s.state, "chain_focus": s.chain_focus,
        "followup_count": s.followup_count, "question": {"code": question.code, "stem": question.stem},
        "is_correct": attempt.is_correct, "answer": question.answer,
        "card": card,
        "followup": followup_out,
    }''')
p.write_text(src, encoding="utf-8")
print("router ok")
