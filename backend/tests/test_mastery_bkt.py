import pytest
from app.mastery.bkt import BKTOnlineTracker, BKTParameters, HAS_PYBKT
from app.mastery import engine as mastery_engine
from app.db import Base
from app.models import DiagnosticDomain, DemoUser, MasteryState
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


def test_bkt_posterior_updates():
    tracker = BKTOnlineTracker()
    p0 = 0.20
    # 答对后验提升
    p1 = tracker.update_posterior(p0, is_correct=True)
    assert p1 > p0, f"Expected p1 > p0, got {p1} <= {p0}"

    # 答错后验下降
    p_wrong = tracker.update_posterior(p1, is_correct=False)
    assert p_wrong < p1, f"Expected p_wrong < p1, got {p_wrong} >= {p1}"

    # 连续作答正确，概率持续收敛至高位
    p_curr = 0.20
    for _ in range(6):
        p_curr = tracker.update_posterior(p_curr, is_correct=True)
    assert p_curr >= 0.85, f"Expected p_curr >= 0.85 after 6 correct answers, got {p_curr}"


def test_bkt_time_decay():
    tracker = BKTOnlineTracker()
    p_initial = 0.88
    # 7 天遗忘半衰期衰减
    p_7d = tracker.apply_decay(p_initial, days_passed=7.0, half_life_days=7.0)
    assert 0.40 <= p_7d <= 0.50, f"Expected ~0.44 after 1 half-life, got {p_7d}"

    # 14 天遗忘衰减
    p_14d = tracker.apply_decay(p_initial, days_passed=14.0, half_life_days=7.0)
    assert p_14d < p_7d


def test_bkt_state_mapping():
    tracker = BKTOnlineTracker()
    assert tracker.probability_to_state(0.10) == "薄弱"
    assert tracker.probability_to_state(0.25) == "薄弱"
    assert tracker.probability_to_state(0.40) == "学习中"
    assert tracker.probability_to_state(0.55) == "学习中"
    assert tracker.probability_to_state(0.65) == "初步掌握"
    assert tracker.probability_to_state(0.75) == "初步掌握"
    assert tracker.probability_to_state(0.85) == "掌握"
    assert tracker.probability_to_state(0.96) == "稳定掌握"


def test_mastery_engine_bkt_integration():
    test_db_url = "sqlite:///:memory:"
    eng = create_engine(test_db_url)
    Base.metadata.create_all(eng)

    with Session(eng) as db:
        user = DemoUser(id="test_bkt_user", display_name="BKT测试生", consented=True)
        domain = DiagnosticDomain(id="test_dom_1", code="DOM-TEST", name="测试药理域", chapter_ref="CH1")
        db.add_all([user, domain])
        db.commit()

        # 1. 初始通过 practice_passed 推进
        st = mastery_engine.transition(db, "test_bkt_user", "test_dom_1", None, "practice_passed")
        assert st.state == "学习中"
        assert float(st.probability) >= 0.35
        assert st.attempts_count == 1
        st_prob_1 = float(st.probability)

        # 2. 再次练习通过
        st2 = mastery_engine.transition(db, "test_bkt_user", "test_dom_1", None, "practice_passed")
        assert float(st2.probability) > st_prob_1
        assert st2.attempts_count == 2

        # 3. 复测通过跃迁到掌握
        st3 = mastery_engine.transition(db, "test_bkt_user", "test_dom_1", None, "retest_passed")
        assert st3.state == "掌握"
        assert st3.probability >= 0.85


def test_pybkt_library_availability():
    # 验证可选 pyBKT 库加载支持，如未安装则跳过使用内置纯 Python BKT
    if not HAS_PYBKT:
        pytest.skip("pyBKT optional dependency not installed, pure Python BKT engine is active")
    from pyBKT.models import Model
    model = Model()
    assert model is not None
