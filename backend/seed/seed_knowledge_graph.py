# -*- coding: utf-8 -*-
"""结构化知识关系（FR-A2 图谱最小落地，2026-09-08）。

把种子诊断域（DOM-PHARMO-ANS，M 胆碱受体药）里**已经由 seed.py docstring / 推理链 /
混淆对明文断言**的教材事实，按 FR-A2 边类型转写成机器可读的有向关系（源节点—边→目标节点），
作为"图谱"的最小诚实落地。**不新增教材外事实**：每条都可回溯到 seed.py 顶部 docstring
（阿托品散瞳/升眼压/调节麻痹/青光眼前列腺肥大禁用；毛果芸香碱缩瞳/降眼压/调节痉挛/青光眼/哮喘
禁用；碘解磷定复活胆碱酯酶；有机磷两药互补）。

全章节铺开是内容资产，须药理顾问逐条审校（review_status=draft）后才可置 published，
故此处只落地种子域演示规模，章节错因/题目级图谱随顾问到位再扩展。
"""
from sqlalchemy import select

from app.models import DiagnosticDomain, KnowledgeRelation, audit

# 节点类型（对齐 FR-A2 的 7 类中的本域实际出现的子集）
# edge 类型对齐 FR-A2：作用于 / 表现为 / 禁忌用于 / 适应证 / 与…相互作用 / 属于
EDGES = [
    # (source_type, source_name, edge, target_type, target_name, note)
    ("药物", "阿托品", "作用于", "靶点", "M受体", "阻断 M 受体"),
    ("药物", "毛果芸香碱", "作用于", "靶点", "M受体", "激动 M 受体"),
    ("药物", "碘解磷定", "作用于", "靶点", "胆碱酯酶", "复活被磷酰化的胆碱酯酶"),
    ("药物", "阿托品", "表现为", "效应", "散瞳·升眼压·调节麻痹", "阻断后效应（视近物不清）"),
    ("药物", "毛果芸香碱", "表现为", "效应", "缩瞳·降眼压·调节痉挛", "激动后效应（视近物清楚）"),
    ("药物", "阿托品", "禁忌用于", "禁忌", "闭角型青光眼", "散瞳可诱发急性发作"),
    ("药物", "阿托品", "禁忌用于", "禁忌", "前列腺肥大", "加重排尿困难"),
    ("药物", "毛果芸香碱", "禁忌用于", "禁忌", "哮喘", "M 样激动可诱发支气管痉挛"),
    ("药物", "阿托品", "适应证", "适应证", "内脏绞痛/有机磷M样症状解救/散瞳检查", "非青光眼者散瞳检查"),
    ("药物", "毛果芸香碱", "适应证", "适应证", "青光眼", "缩瞳降低眼压"),
    ("药物", "阿托品", "与…相互作用", "药物", "碘解磷定", "有机磷中毒解救：抗 M 样 + 复活酶，机制互补"),
]


def apply_knowledge_edges(db):
    """幂等：以 (domain_id, source, edge, target) 判重。返回新增条数。"""
    domain = db.execute(select(DiagnosticDomain).where(
        DiagnosticDomain.code == "DOM-PHARMO-ANS")).scalar_one_or_none()
    if domain is None:
        return 0
    existing = set()
    for r in db.execute(select(KnowledgeRelation).where(
            KnowledgeRelation.domain_id == domain.id)).scalars():
        existing.add((tuple(sorted(r.source.items())), r.edge, tuple(sorted(r.target.items()))))
    added = 0
    for st, sn, edge, tt, tn, note in EDGES:
        src = {"type": st, "name": sn}
        tgt = {"type": tt, "name": tn}
        key = (tuple(sorted(src.items())), edge, tuple(sorted(tgt.items())))
        if key in existing:
            continue
        db.add(KnowledgeRelation(domain_id=domain.id, source=src, edge=edge,
                                 target=tgt, note=note))  # review_status 默认 draft（待顾问）
        added += 1
    if added:
        audit(db, "seed", "knowledge_relations.seeded", domain.code, count=added)
        db.commit()
    return added
