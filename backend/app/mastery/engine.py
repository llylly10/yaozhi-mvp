"""掌握度贝叶斯知识追踪与状态机双轨引擎（ADR-05，v1.1 §5.5升级版）。

将 Corbett & Anderson 贝叶斯知识追踪（BKT）连续后验概率推断与业务状态机融合：
1. 概率层：MasteryState.probability 持续追踪知识点后验掌握概率 P(L)；
2. 状态层：维护离散业务状态（未评估/薄弱/学习中/初步掌握/掌握/稳定掌握），兼容既有契约；
3. 统计层：记录 attempts_count 累计做题样本数；
4. 章级行（category=None）仍走原生 UPDATE + expire，绕过 ORM NULL 主键约束。
"""
from sqlalchemy import update

from ..models import VALID_MASTERY_TRANSITIONS, MasteryState, audit
from .bkt import BKTOnlineTracker, BKTParameters, DEFAULT_BKT_PARAMS


class IllegalTransition(Exception):
    pass


def _apply(db, st: MasteryState, state: str, reason: str,
           probability: float | None = None, attempts_inc: int = 0) -> None:
    """落库状态与 BKT 概率变更：
    - pending 新行直接赋值（flush 时一次 INSERT 带最终值）；
    - persistent 且 category=NULL 的行走原生 UPDATE（ORM 对 NULL 主键 UPDATE 会报错）；
    - probability 为 None 时按 state 给默认先验打底。
    """
    prob = probability if probability is not None else BKTOnlineTracker.state_to_default_probability(state)
    attempts = int(getattr(st, "attempts_count", 0) or 0) + attempts_inc

    if st.category is None and st not in db.new:
        db.execute(
            update(MasteryState)
            .where(MasteryState.user_id == st.user_id,
                   MasteryState.domain_id == st.domain_id,
                   MasteryState.category.is_(None))
            .values(state=state, reason=reason, probability=prob, attempts_count=attempts))
        db.expire(st)  # 行已被原生 UPDATE 改写，让 ORM 对象在下一次 flush 时重载
    else:
        st.state, st.reason = state, reason
        st.probability = prob
        st.attempts_count = attempts


def update_by_bkt(db, user_id: str, domain_id: str, category: str | None,
                  is_correct: bool, reason: str = "") -> MasteryState:
    """纯 BKT 驱动的增量更新：每次作答后直接根据贝叶斯后验计算新掌握度概率并平滑映射业务状态。"""
    st = db.get(MasteryState, (user_id, domain_id, category))
    if st is None:
        st = MasteryState(user_id=user_id, domain_id=domain_id, category=category, state="未评估")
        db.add(st)

    curr_p = float(getattr(st, "probability", None) or BKTOnlineTracker.state_to_default_probability(st.state))
    next_p = BKTOnlineTracker.update_posterior(curr_p, is_correct)
    next_state = BKTOnlineTracker.probability_to_state(next_p, st.state)

    act_reason = reason or (f"BKT实时推断：答{'对' if is_correct else '错'}，后验掌握概率 {next_p * 100:.1f}%")
    _apply(db, st, next_state, act_reason, probability=next_p, attempts_inc=1)
    db.commit()
    audit(db, "system", "mastery.bkt_update", f"{user_id}/{domain_id}",
          to=next_state, prob=next_p, is_correct=is_correct)
    return st


def transition(db, user_id: str, domain_id: str, category: str | None, event: str) -> MasteryState:
    """业务事件驱动的状态机迁移（向后兼容原有全部事件），内部自动结合 BKT 更新连续概率。"""
    st = db.get(MasteryState, (user_id, domain_id, category))
    if st is None:
        st = MasteryState(user_id=user_id, domain_id=domain_id, category=category, state="未评估")
        db.add(st)

    curr_p = float(getattr(st, "probability", None) or BKTOnlineTracker.state_to_default_probability(st.state))

    REASONS = {
        "misdiagnosed": "摸底/诊断发现薄弱项",
        "diagnosed": "诊断出新错因，进入薄弱项管理",
        "training_started": "已开始靶向训练",
        "training_passed": "靶向训练通过",
        "training_failed": "靶向训练未通过，退回薄弱",
        "practice_passed": "章级练习作答通过",
        "practice_failed": "章级练习作答未通过",
        "material_passed": "学习材料随堂自测通过",
        "retest_passed": "迁移复测通过",
        "retest_failed": "迁移复测未通过，退回薄弱",
        "delayed_passed": "延迟复测通过，进入稳定掌握",
        "forgot": "间隔复习超时，遗忘回退",
    }
    table = {
        "misdiagnosed": ("未评估", "薄弱"),
        "diagnosed": ("未评估", "薄弱"),
        "training_started": (None, None),  # 薄弱→学习中，下面特判
        "training_passed": ("学习中", "初步掌握"),
        "training_failed": ("学习中", "薄弱"),
        "retest_passed": ("初步掌握", "掌握"),
        "retest_failed": ("初步掌握", "薄弱"),
        "delayed_passed": ("掌握", "稳定掌握"),
        "forgot": ("掌握", "薄弱"),
    }

    if event == "training_started":
        if st.state in ("学习中", "初步掌握", "掌握", "稳定掌握"):
            return st
        if st.state not in ("薄弱", "未评估"):
            raise IllegalTransition(f"{st.state} -training_started-> ?")
        _apply(db, st, "学习中", REASONS[event], probability=max(curr_p, 0.42))
        db.commit()
        audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=st.state, event=event)
        return st

    if event == "material_passed":
        if st.state in ("学习中", "初步掌握", "掌握", "稳定掌握"):
            return st
        if st.state not in ("薄弱", "未评估"):
            raise IllegalTransition(f"{st.state} -material_passed-> ?")
        _apply(db, st, "学习中", REASONS[event], probability=0.48)
        db.commit()
        audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=st.state, event=event)
        return st

    if event == "practice_passed":
        # 答对：使用 BKT 计算下一后验概率
        p_next = BKTOnlineTracker.update_posterior(curr_p, is_correct=True)
        if st.state in ("初步掌握", "掌握", "稳定掌握"):
            # 维持原有幂等，但继续平滑抬升连续概率
            _apply(db, st, st.state, f"{REASONS[event]}（BKT后验 {p_next*100:.1f}%）",
                   probability=max(curr_p, p_next), attempts_inc=1)
            db.commit()
            return st
        if st.state == "学习中":
            target_state = "初步掌握" if p_next >= 0.60 else "学习中"
            _apply(db, st, target_state, f"{REASONS[event]}（BKT后验 {p_next*100:.1f}%）",
                   probability=p_next, attempts_inc=1)
        else:  # 未评估 / 薄弱 -> 学习中
            _apply(db, st, "学习中", f"{REASONS[event]}（BKT后验 {p_next*100:.1f}%）",
                   probability=max(0.40, p_next), attempts_inc=1)
        db.commit()
        audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=st.state, event=event)
        return st

    if event == "practice_failed":
        # 答错：使用 BKT 计算衰减后验概率
        p_next = BKTOnlineTracker.update_posterior(curr_p, is_correct=False)
        if st.state in ("薄弱", "初步掌握", "掌握", "稳定掌握"):
            # 已初步掌握以上不因单次答错降级，但连续概率微降
            _apply(db, st, st.state, f"{REASONS[event]}（BKT后验 {p_next*100:.1f}%）",
                   probability=min(curr_p, p_next), attempts_inc=1)
            db.commit()
            return st
        _apply(db, st, "薄弱", f"{REASONS[event]}（BKT后验 {p_next*100:.1f}%）",
               probability=min(0.25, p_next), attempts_inc=1)
        db.commit()
        audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=st.state, event=event)
        return st

    if event == "training_passed":
        p_next = max(curr_p, 0.72)
    elif event == "training_failed":
        p_next = min(curr_p, 0.28)
    elif event == "retest_passed":
        p_next = max(curr_p, 0.86)
    elif event == "retest_failed":
        p_next = min(curr_p, 0.30)
    elif event == "delayed_passed":
        p_next = 0.96
    elif event == "forgot":
        p_next = BKTOnlineTracker.apply_decay(curr_p, days_passed=14.0)
    elif event in ("misdiagnosed", "diagnosed"):
        p_next = 0.20
    else:
        p_next = None

    src, dst = table[event]
    if st.state == dst:
        return st
    if (src, dst) not in VALID_MASTERY_TRANSITIONS or st.state != src:
        raise IllegalTransition(f"{st.state} -{event}-> ?（合法起点 {src}）")

    _apply(db, st, dst, REASONS.get(event, ""), probability=p_next)
    db.commit()
    audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=dst, event=event)
    return st


def get_decayed_mastery_map(db, user_id: str, half_life_days: float = 7.0) -> dict:
    """获取用户考虑艾宾浩斯时间衰减后的掌握度态势（连续概率半衰期建模）。"""
    from sqlalchemy import select
    from ..models import now

    rows = db.execute(select(MasteryState).where(MasteryState.user_id == user_id)).scalars().all()
    current_time = now()
    domain_decay = {}

    for st in rows:
        raw_p = float(getattr(st, "probability", None) or BKTOnlineTracker.state_to_default_probability(st.state))
        ref_time = getattr(st, "updated_at", None) or current_time

        # 兼容时区比较（SQLite 无时区 vs UTC）
        from datetime import timezone
        if ref_time.tzinfo is None and current_time.tzinfo is not None:
            ref_time = ref_time.replace(tzinfo=timezone.utc)
        elif ref_time.tzinfo is not None and current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=timezone.utc)

        # 计算流逝时间（天）
        diff_sec = max(0.0, (current_time - ref_time).total_seconds())
        days_passed = round(diff_sec / 86400.0, 1)

        decayed_p = BKTOnlineTracker.apply_decay(raw_p, days_passed=days_passed, half_life_days=half_life_days)
        decayed_state = BKTOnlineTracker.probability_to_state(decayed_p, current_state=st.state)

        # 衰退警示级别
        if days_passed <= 3.0 or (raw_p - decayed_p) < 0.08:
            decay_level = "fresh"      # 🟢 巩固期
            freshness_status = "巩固期"
        elif days_passed <= 7.0 or (raw_p - decayed_p) < 0.20:
            decay_level = "warning"    # 🟡 临界衰退
            freshness_status = "临界衰退"
        else:
            decay_level = "critical"   # 🔴 严重遗忘风险
            freshness_status = "严重遗忘"

        decay_pct = max(0, min(100, int(round((1.0 - (decayed_p / max(0.01, raw_p))) * 100))))
        entry = {
            "domain_id": st.domain_id,
            "category": st.category,
            "raw_p": raw_p,
            "original_p": raw_p,
            "decayed_p": decayed_p,
            "days_passed": days_passed,
            "decay_level": decay_level,
            "freshness_status": freshness_status,
            "decay_pct": decay_pct,
            "is_decayed": (raw_p - decayed_p) >= 0.05,
            "state": st.state,
            "decayed_state": decayed_state,
            "attempts_count": getattr(st, "attempts_count", 0) or 0,
        }
        str_key = st.domain_id if st.category is None else f"{st.domain_id}:{st.category}"
        domain_decay[str_key] = entry
        domain_decay[(st.domain_id, st.category)] = entry

    return domain_decay

