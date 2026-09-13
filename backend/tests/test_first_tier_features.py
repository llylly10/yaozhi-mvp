import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base
from app.models import (
    DemoUser, DiagnosticDomain, Question, Attempt, DiagnosisSession, Misconception,
    QuestionEvidence, ConfusionPair, MasteryState, now
)
from app.cases.case_repo import (
    get_clinical_cases_summary,
    get_clinical_case_detail,
    evaluate_clinical_case,
)
from app.mastery import engine as mastery_engine
from app.router import export_wrong_book, learning_plan


def test_clinical_cases_sandbox():
    # 1. Summary has all 5 realistic cases
    summaries = get_clinical_cases_summary()
    assert len(summaries) >= 5
    case_ids = [c["id"] for c in summaries]
    assert "case_cvs_01" in case_ids
    assert "case_resp_02" in case_ids
    assert "case_anti_03" in case_ids
    assert "case_cardio_04" in case_ids
    assert "case_gi_05" in case_ids

    # 2. Case detail has full EMR attributes
    detail = get_clinical_case_detail("case_cvs_01")
    assert detail is not None
    assert detail["patient"]["gender"] == "男"
    assert "BP" in detail["patient"]["vitals"]
    assert len(detail["patient"]["current_prescription"]) > 0
    assert len(detail["questions"]) == 3

    # 3. Full correct evaluation (100 pts)
    eval_full = evaluate_clinical_case("case_cvs_01", {"q1": "B", "q2": "B", "q3": "B"})
    assert eval_full["score"] == 100
    assert eval_full["passed"] is True
    assert eval_full["star_rating"] == 3

    # 4. Partial error evaluation
    eval_partial = evaluate_clinical_case("case_cvs_01", {"q1": "A", "q2": "B", "q3": "B"})
    assert eval_partial["score"] < 100
    assert eval_partial["evaluations"]["q1"]["is_correct"] is False
    assert eval_partial["evaluations"]["q2"]["is_correct"] is True


def test_bkt_dynamic_decay_engine():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)

    with Session(eng) as db:
        user = DemoUser(id="u_decay_01", display_name="遗忘测试生", consented=True)
        domain = DiagnosticDomain(id="dom_decay_01", code="DOM-DECAY", name="肾上腺素受体", chapter_ref="CH5")
        db.add_all([user, domain])
        db.commit()

        # 模拟 7 天前掌握度为 0.85 的状态（经历 1 个半衰期）
        seven_days_ago = now() - timedelta(days=7.0)
        ms = MasteryState(
            user_id=user.id,
            domain_id=domain.id,
            category="概念混淆",
            state="掌握",
            probability=0.85,
            updated_at=seven_days_ago
        )
        db.add(ms)
        db.commit()

        decay_map = mastery_engine.get_decayed_mastery_map(db, user.id, half_life_days=7.0)
        key = (domain.id, "概念混淆")
        assert key in decay_map
        d_info = decay_map[key]
        assert d_info["original_p"] == 0.85
        # 经过 7 天，概率从 0.85 衰减至约 0.425
        assert 0.38 <= d_info["decayed_p"] <= 0.46
        assert d_info["freshness_status"] in ("临界衰退", "严重遗忘")
        assert d_info["decay_level"] in ("warning", "critical")

        # 检查 learning_plan 接口是否生成了遗忘预警与提升的紧迫度
        plan = learning_plan(user.id, db)
        assert len(plan["tasks"]) > 0
        task = plan["tasks"][0]
        assert task["freshness_status"] == d_info["freshness_status"]
        assert len(plan["memory_decay_alerts"]) > 0


def test_wrong_book_export():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)

    with Session(eng) as db:
        user = DemoUser(id="u_export_01", display_name="导出测试生", consented=True)
        domain = DiagnosticDomain(id="dom_exp_01", code="DOM-EXP", name="抗高血压药", chapter_ref="CH24")
        q = Question(
            id="q_exp_01", code="Q-EXP-01", type="single", domain_id=domain.id,
            stem="关于卡托普利引起刺激性干咳的机制，下列叙述正确的是？",
            options=[{"key": "A", "text": "阻断AT1受体"}, {"key": "B", "text": "抑制缓激肽降解"}, {"key": "C", "text": "激动前列腺素"}, {"key": "D", "text": "直接兴奋咳嗽中枢"}],
            answer="B", usage="training"
        )
        att = Attempt(
            id="att_exp_01", user_id=user.id, question_id=q.id,
            selected_option="A", is_correct=False, idempotency_key="idemp_exp_01"
        )
        mis = Misconception(
            id="mis_exp_01", code="MIS-EXP", category="机制理解不足", name="ACEI缓激肽途径混淆",
            domain_id=domain.id, remediation_type="记忆卡",
            case_evidence={"scenario": "临床患者服用卡托普利后顽固性干咳", "lesson": "ACE抑制同时减缓缓激肽降解，导致局部蓄积诱发咳嗽"}
        )
        diag = DiagnosisSession(
            id="diag_exp_01", attempt_id=att.id, state="diagnosed",
            hypothesis_id=mis.id, evidence_level="高"
        )
        ev = QuestionEvidence(
            question_id=q.id, evidence_chunk_id="EV-01", support_type="解析",
            content_text="卡托普利抑制血管紧张素转化酶（同时即激肽酶II），导致缓激肽降解受阻而积蓄。"
        )
        pair = ConfusionPair(
            id="pair_exp_01", domain_id=domain.id, drug_a="卡托普利", drug_b="氯沙坦",
            distinction_text="卡托普利抑制ACE且升高缓激肽引起干咳；氯沙坦直接阻断AT1受体，不影响激肽酶，无干咳不良反应。"
        )
        db.add_all([user, domain, q, att, mis, diag, ev, pair])
        db.commit()

        export_data = export_wrong_book(user.id, db)
        assert export_data["total_wrong"] == 1
        item = export_data["items"][0]
        assert item["question_code"] == "Q-EXP-01"
        assert item["student_answer"] == "A"
        assert item["correct_answer"] == "B"
        assert item["misconception_category"] == "机制理解不足"
        assert "卡托普利" in item["confusion_pair"]
        assert "降压" in item["mnemonic"] or "记忆" in item["mnemonic"]
        assert "人卫《药理学》9e" in item["textbook_anchor"]
