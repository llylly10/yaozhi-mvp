"""错因×干预路由（N3）：知识遗忘→记忆卡，不推刷题；其余按 remediation_type 分流。"""
from sqlalchemy.orm import Session

from ..models import Misconception, audit


def route_intervention(db: Session, session) -> dict:
    m = db.get(Misconception, session.hypothesis_id)
    plan = {
        "记忆卡": {"mode": "memory_cards", "note": "间隔重复记忆卡，不推送刷题变式"},
        "混淆对变式": {"mode": "pair_variants", "note": "混淆对双向变式（正向/反向/情境）"},
        "断环重讲": {"mode": "chain_reteach", "note": f"断环 L{session.chain_focus or '?'} 重讲 + 条件变化型变式"},
        "情境拆解": {"mode": "context_training", "note": "情境拆解训练：提取题干用药条件逐条检索"},
    }.get(m.remediation_type, {"mode": "unknown", "note": ""})
    audit(db, "system", "intervention.routed", session.id, misconception=m.code, plan=plan["mode"])
    return plan
