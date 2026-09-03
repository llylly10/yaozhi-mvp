# -*- coding: utf-8 -*-
"""题库→业务桥接器（MVP 闭环消费，2026-09-03，方案 A；P4 收口含 B1）。

背景：内容化已把 786 题库中 146 题（A1 131 + B1 15）置为 published（AI 自审通过，
演示口径）。但闭环引擎（摸底/练习/复测/错题本）唯一题目源是 questions 业务表
（attempts.question_id 外键约束），题库仍隔离在 tiku_questions，形成"内容有、闭环不消费"。

本模块把 published 题库题**物化**为 Question 业务行（P4 起 A1 与 B1 全量）：
  - code        = f"T{paper_no}-{qid:03d}"（如 T01-017），判重幂等
  - type        = single（题库 A1/B1 均为摊平单选：options 完整、answer 单字母，
                  与业务单选同构；P4 实证 15 条 B1 无"答案区段另列"，隔离假设作废）
  - usage       = diagnostic（摸底/练习出题池）
  - domain      = 章级诊断域 DOM-<chapter_ref>（按需创建，name 取大纲章标题）
  - 解析绑定    = analysis → QuestionEvidence(support_type='解析')，
                 source_ref → evidence_chunk_id（题目绑定证据，ADR-02 / 9/5 冻结口径）

设计红线：
  1. 全量物化 published（A1 131 + B1 15 = 146）。B1 配伍组共享选项摊平存储，
     同组题在练习列表连续出现即还原真实配伍形态；判分独立互不影响。
  2. 物化题无 distractor_signals（未做错因标注），答错**不进入**五级漏斗错因诊断，
     改走"解析型反馈"（router.submit_attempt 分支），避免产出空错因卡（不诚实归因）。
  3. 幂等 + 挂接 seed._restore_course_assets → reset-demo 自动重放。
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DiagnosticDomain, Question, QuestionEvidence, TikuQuestion, SyllabusChapter


def _domain_for(db: Session, chapter_ref: str) -> DiagnosticDomain:
    """取或建章级诊断域：code=DOM-<CHxx>，name 取大纲章标题（无则回退占位名）。"""
    code = f"DOM-{chapter_ref}"
    d = db.execute(select(DiagnosticDomain).where(DiagnosticDomain.code == code)).scalar_one_or_none()
    if d:
        return d
    no = "".join(ch for ch in chapter_ref if ch.isdigit())
    title = ""
    if no:
        row = db.execute(select(SyllabusChapter).where(
            SyllabusChapter.book_chapter_no == int(no))).scalar_one_or_none()
        title = row.title if row else ""
    name = f"章节 {no} {title}".strip() if title else f"题库章节 {chapter_ref}"
    d = DiagnosticDomain(code=code, name=name, chapter_ref=chapter_ref,
                         syllabus_ref=f"教学大纲第{no}章" if no else "",
                         exam_ref="", mastery_threshold=0.70, status="published")
    db.add(d)
    db.flush()
    return d


def bridge_tiku_questions(db: Session) -> dict:
    """published 题库题（A1+B1）→ Question 业务行（幂等）。返回统计供恢复链打印。"""
    pool = db.execute(select(TikuQuestion).where(
        TikuQuestion.review_status == "published")).scalars().all()
    created, updated = 0, 0
    by_type: dict = {}
    domains = {}
    for tq in pool:
        by_type[tq.type] = by_type.get(tq.type, 0) + 1
        code = f"T{tq.paper_no}-{tq.qid:03d}"
        q = db.execute(select(Question).where(Question.code == code)).scalar_one_or_none()
        if q is None:
            domain = domains.get(tq.chapter_ref) or _domain_for(db, tq.chapter_ref)
            domains[tq.chapter_ref] = domain
            q = Question(code=code, type="single", domain_id=domain.id, stem=tq.stem,
                         options=tq.options, answer=tq.answer, usage="diagnostic",
                         leakage_group_id=f"LG-TIKU-{tq.paper_no}",
                         distractor_signals={}, chain_levels=[], condition_type="normal",
                         review_status="published")
            db.add(q)
            db.flush()
            created += 1
        # 解析绑定（题目绑定证据）：analysis → content_text、source_ref → chunk id
        ev = db.execute(select(QuestionEvidence).where(
            QuestionEvidence.question_id == q.id,
            QuestionEvidence.support_type == "解析")).scalar_one_or_none()
        if ev is None:
            db.add(QuestionEvidence(question_id=q.id,
                                    evidence_chunk_id=tq.source_ref or f"TIKU-{code}",
                                    support_type="解析",
                                    content_text=tq.analysis or ""))
        else:
            updated += 1
    db.commit()
    return {"bridged": created, "rebound": updated, "by_type": by_type,
            "domain_codes": list(domains.keys())}


if __name__ == "__main__":  # 直接运行：python -m backend.seed.seed_tiku_bridge
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        print(bridge_tiku_questions(db))
    finally:
        db.close()
