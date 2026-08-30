"""掌握度规则状态机（ADR-05，v1.1 §5.5）：纯函数转移，非法转移抛异常。"""
from ..models import VALID_MASTERY_TRANSITIONS, MasteryState, audit


class IllegalTransition(Exception):
    pass


def transition(db, user_id: str, domain_id: str, category: str | None, event: str) -> MasteryState:
    """event: misdiagnosed(摸底/诊断失败) | diagnosed | training_passed | training_failed |
    retest_passed | retest_failed | delayed_passed | forgot"""
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
        if st.state not in ("薄弱", "未评估"):
            raise IllegalTransition(f"{st.state} -training_started-> ?")
        st.state, st.reason = "学习中", REASONS[event]
        db.commit()
        audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=st.state, event=event)
        return st

    src, dst = table[event]
    if (src, dst) not in VALID_MASTERY_TRANSITIONS or st.state != src:
        raise IllegalTransition(f"{st.state} -{event}-> ?（合法起点 {src}）")
    st.state, st.reason = dst, REASONS.get(event, "")
    db.commit()
    audit(db, "system", "mastery.transition", f"{user_id}/{domain_id}", to=dst, event=event)
    return st
