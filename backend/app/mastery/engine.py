"""掌握度规则状态机（ADR-05，v1.1 §5.5）：纯函数转移，非法转移抛异常。

章级行（category=None）落库注意：MasteryState 复合主键含 category 列，
SQLAlchemy ORM 不支持对 NULL 主键列行生成 UPDATE（flush 抛
FlushError: Can't update ... using NULL for primary key value）。
因此凡需改写已有 NULL-category 行，一律经 _apply() 走原生 UPDATE + expire，
绕过 ORM flush（2026-09-03 章级练习闭环补口时实测暴露）。
"""
from sqlalchemy import update

from ..models import VALID_MASTERY_TRANSITIONS, MasteryState, audit


class IllegalTransition(Exception):
    pass


def _apply(db, st: MasteryState, state: str, reason: str) -> None:
    """落库状态变更：pending 新行直接赋值（flush 时一次 INSERT 带最终值）；
    persistent 且 category=NULL 的行走原生 UPDATE（ORM 对 NULL 主键 UPDATE 会炸）。
    已在目标状态的幂等判断由调用方提前完成，本函数不重复。"""
    if st.category is None and st not in db.new:
        db.execute(
            update(MasteryState)
            .where(MasteryState.user_id == st.user_id,
                   MasteryState.domain_id == st.domain_id,
                   MasteryState.category.is_(None))
            .values(state=state, reason=reason))
        db.expire(st)  # 行已被原生 UPDATE 改写，让 ORM 对象在下一次 flush 时重载
    else:
        st.state, st.reason = state, reason


def transition(db, user_id: str, domain_id: str, category: str | None, event: str) -> MasteryState:
    """event: misdiagnosed(摸底/诊断失败) | diagnosed | training_passed | training_failed |
    retest_passed | retest_failed | delayed_passed | forgot |
    practice_passed/practice_failed（章级练习，题库物化题专用推进）|
    material_passed（种子域学习材料随堂自测通过，薄弱→学习中，2026-09-08）"""
    st = db.get(MasteryState, (user_id, domain_id, category))
    if st is None:
        st = MasteryState(user_id=user_id, domain_id=domain_id, category=category, state="未评估")
        db.add(st)

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
            return st  # 幂等：重复开始训练不报错
        if st.state not in ("薄弱", "未评估"):
            raise IllegalTransition(f"{st.state} -training_started-> ?")
        _apply(db, st, "学习中", REASONS[event])
        db.commit()
        audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=st.state, event=event)
        return st

    if event == "material_passed":
        # 种子域学习材料随堂自测通过：薄弱→学习中（表示已完成该薄弱错因的主动学习、
        # 可进入练习/训练推进）。学习中以上不因学习再推进（需训练/复测事件到掌握）。
        if st.state in ("学习中", "初步掌握", "掌握", "稳定掌握"):
            return st
        if st.state not in ("薄弱", "未评估"):
            raise IllegalTransition(f"{st.state} -material_passed-> ?")
        _apply(db, st, "学习中", REASONS[event])
        db.commit()
        audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=st.state, event=event)
        return st

    if event == "practice_passed":
        # 章级练习（题库物化题无错因标注 → 无训练/复测资产）的唯一推进事件：
        # 薄弱→学习中（首答对）→初步掌握（再答对）；未评估（未摸底直接练对）→学习中；
        # 已初步掌握以上不因练习再推进（掌握需复测/延迟复测事件）。2026-09-03 闭环补口。
        if st.state in ("初步掌握", "掌握", "稳定掌握"):
            return st
        if st.state == "学习中":
            _apply(db, st, "初步掌握", REASONS[event])
        else:  # 未评估 / 薄弱 → 学习中
            _apply(db, st, "学习中", REASONS[event])
        db.commit()
        audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=st.state, event=event)
        return st

    if event == "practice_failed":
        # 章级练习答错：未评估→薄弱（建薄弱）；学习中→薄弱（回退）；薄弱保持（幂等）；
        # 已初步掌握以上不因单次答错降级（保守，避免一题抖动状态）。
        if st.state in ("薄弱", "初步掌握", "掌握", "稳定掌握"):
            return st
        _apply(db, st, "薄弱", REASONS[event])
        db.commit()
        audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=st.state, event=event)
        return st

    src, dst = table[event]
    if st.state == dst:
        return st  # 幂等：重复事件（如摸底+练习双诊断）不降级不报错
    if (src, dst) not in VALID_MASTERY_TRANSITIONS or st.state != src:
        raise IllegalTransition(f"{st.state} -{event}-> ?（合法起点 {src}）")
    _apply(db, st, dst, REASONS.get(event, ""))
    db.commit()
    audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=dst, event=event)
    return st
