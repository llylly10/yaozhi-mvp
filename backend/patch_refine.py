# -*- coding: utf-8 -*-
"""追问改为诊断后可选细化（产品决策 2026-08-30）：练习答错 → 直接出诊断卡 → 卡上可选进入追问。"""
from pathlib import Path

# 1) 模型：can_refine 字段
p = Path("app/models.py")
src = p.read_text(encoding="utf-8")
src = src.replace('''    feedback: Mapped[str | None] = mapped_column(
        _enum("diagnosis_feedback", "matches", "not_matches"), nullable=True)  # 学生归因反馈''',
'''    feedback: Mapped[str | None] = mapped_column(
        _enum("diagnosis_feedback", "matches", "not_matches"), nullable=True)  # 学生归因反馈
    can_refine: Mapped[bool] = mapped_column(Boolean, default=False)  # 诊断后可再追问细化''')
p.write_text(src, encoding="utf-8")

# 2) 引擎
p = Path("app/diagnosis/engine.py")
src = p.read_text(encoding="utf-8")

src = src.replace('''    attempt = db.get(Attempt, session.attempt_id)
    question = db.get(Question, attempt.question_id)
    signal = (question.distractor_signals or {}).get(attempt.selected_option) or {}
    if float(top.rerank_score) >= HIGH_SCORE and margin >= SUFFICIENCY_MARGIN and not signal.get("needs_followup"):
        _diagnose(db, session, top.misconception_id, "中")
    else:
        session.state = "followup_required"
        session.hypothesis_id = top.misconception_id
        audit(db, "system", "diagnosis.state", session.id, to="followup_required",
              hypothesis=top.misconception_id)''',
'''    attempt = db.get(Attempt, session.attempt_id)
    question = db.get(Question, attempt.question_id)
    signal = (question.distractor_signals or {}).get(attempt.selected_option) or {}
    if float(top.rerank_score) >= HIGH_SCORE and margin >= SUFFICIENCY_MARGIN and not signal.get("needs_followup"):
        _diagnose(db, session, top.misconception_id, "中")
    else:
        # 证据不足：仍直接出卡（低证据 + 候选错因），追问降级为卡上的可选细化（产品决策 2026-08-30）
        session.can_refine = True
        _diagnose(db, session, top.misconception_id, "低")
        audit(db, "system", "diagnosis.can_refine", session.id, hypothesis=top.misconception_id)''')

src = src.replace('''def answer_followup(db: Session, session: DiagnosisSession, payload: dict) -> DiagnosisSession:
    """payload: {"option_key": "A"} 或 {"text": "…"}；payload.get("skip") 为跳过。"""
    if session.state != "followup_required":
        raise ValueError(f"会话状态 {session.state} 不接受追问回答")
    node = current_followup(db, session)
    if node is None:  # 无可用追问节点 → 直接低证据收敛
        return _diagnose(db, session, session.hypothesis_id, "低")''',
'''def answer_followup(db: Session, session: DiagnosisSession, payload: dict) -> DiagnosisSession:
    """payload: {"option_key": "A"} 或 {"text": "…"}；payload.get("skip") 为跳过。
    追问为诊断后的可选细化：state=diagnosed 且 can_refine 时可用（产品决策 2026-08-30）。"""
    refining = session.state == "diagnosed" and session.can_refine
    if session.state != "followup_required" and not refining:
        raise ValueError(f"会话状态 {session.state} 不接受追问回答")
    node = current_followup(db, session)
    if node is None:  # 无可用追问节点 → 维持当前归因，结束细化
        session.can_refine = False
        db.commit()
        return session''')

src = src.replace('''    session.followup_count += 1
    turn_no = session.followup_count
    if payload.get("skip"):
        db.add(FollowupTurn(session_id=session.id, node_id=node.id, presented_text=node.question_text,
                            student_answer="", judge_method="skipped", turn_no=turn_no, skipped=True))
        audit(db, "student", "diagnosis.followup_skipped", session.id, turn_no=turn_no)
        return _diagnose(db, session, session.hypothesis_id, "低")''',
'''    session.followup_count += 1
    turn_no = session.followup_count
    if payload.get("skip"):
        db.add(FollowupTurn(session_id=session.id, node_id=node.id, presented_text=node.question_text,
                            student_answer="", judge_method="skipped", turn_no=turn_no, skipped=True))
        audit(db, "student", "diagnosis.followup_skipped", session.id, turn_no=turn_no)
        session.can_refine = False
        db.commit()
        return session''')

src = src.replace('''    if supports and supports == session.hypothesis_id:
        # 追问坐实原假设：证据链补全，收敛为高（AC2：追问的目的即达高置信归因）
        return _diagnose(db, session, session.hypothesis_id, "高")
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
    return session''',
'''    if supports and supports == session.hypothesis_id:
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
    return session''')

src = src.replace('''def current_followup(db: Session, session: DiagnosisSession) -> FollowupNode | None:
    if session.state != "followup_required":
        return None''',
'''def current_followup(db: Session, session: DiagnosisSession) -> FollowupNode | None:
    if not (session.state == "followup_required" or
            (session.state == "diagnosed" and session.can_refine)):
        return None''')
p.write_text(src, encoding="utf-8")

# 3) router：诊断卡带 can_refine；GET followup 逻辑不变（current_followup 已放宽）
p = Path("app/router.py")
src = p.read_text(encoding="utf-8")
src = src.replace('''        card = {
            "misconception": {"code": m.code, "name": m.name, "category": m.category},
            "evidence_level": s.evidence_level,''',
'''        card = {
            "misconception": {"code": m.code, "name": m.name, "category": m.category},
            "evidence_level": s.evidence_level,
            "can_refine": s.can_refine,''')
p.write_text(src, encoding="utf-8")
print("backend ok")
