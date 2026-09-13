# -*- coding: utf-8 -*-
"""34 章深度混淆对精细化主模块（人卫第9版药理学临床鉴别知识库）。

覆盖全书 34 个章节诊断域（DOM-CH2 ~ DOM-CH42），全部提供权威四维鉴别：
  1. 机制与受体/酶靶点差异
  2. 临床首选与适应证对比
  3. 典型不良反应与禁忌证
  4. 人卫第9版教材原文出处（章节、页码、原文摘要、核验说明）
"""
import json
import logging
from sqlalchemy import delete, select

from app.models import ConfusionPair, DiagnosticDomain, audit
from seed.confusion_data_part1 import CONFUSION_DATA_PART1
from seed.confusion_data_part2 import CONFUSION_DATA_PART2
from seed.confusion_data_part3 import CONFUSION_DATA_PART3

logger = logging.getLogger(__name__)


def get_all_curated_pairs() -> dict[str, list[dict]]:
    """合并 34 章全部精细化混淆对。"""
    res = {}
    res.update(CONFUSION_DATA_PART1)
    res.update(CONFUSION_DATA_PART2)
    res.update(CONFUSION_DATA_PART3)
    return res


def lookup_curated_pair(domain_code: str, drug_a: str, drug_b: str) -> dict | None:
    """按 (domain_code, drug_a, drug_b) 无序检索精细化辨析。"""
    curated = get_all_curated_pairs().get(domain_code, [])
    pair_set = {drug_a, drug_b}
    for p in curated:
        if {p["drug_a"], p["drug_b"]} == pair_set:
            return p
    return None


def apply_refined_confusion_pairs(db) -> dict:
    """全量 34 章混淆对幂等精细化更新。
    
    1. 清除分词误切导致的伪药名词（如 '止嘧啶'）。
    2. 针对既有混淆对，注入高质量机制辨析与人卫9e教材出处。
    3. 针对候选为0的4个章节（CH8, CH13, CH16, CH24）及优质临床对，自动补齐经典鉴别对。
    """
    curated_map = get_all_curated_pairs()
    domains = db.execute(
        select(DiagnosticDomain).where(DiagnosticDomain.code.like("DOM-CH%"))
    ).scalars().all()
    dom_by_code = {d.code: d for d in domains}

    n_deleted = 0
    # 1. 清理误切脏数据（如 止嘧啶）
    bad_pairs = db.execute(
        select(ConfusionPair).where(
            (ConfusionPair.drug_a == "止嘧啶") | (ConfusionPair.drug_b == "止嘧啶")
        )
    ).scalars().all()
    for bp in bad_pairs:
        db.delete(bp)
        n_deleted += 1

    n_updated = 0
    n_created = 0

    for code, pairs in curated_map.items():
        dom = dom_by_code.get(code)
        if not dom:
            continue

        existing_pairs = db.execute(
            select(ConfusionPair).where(ConfusionPair.domain_id == dom.id)
        ).scalars().all()
        # 构建已有对映射 (set(a, b) -> obj)
        pair_lookup = {frozenset([p.drug_a, p.drug_b]): p for p in existing_pairs}

        for p_data in pairs:
            da, db_name = p_data["drug_a"], p_data["drug_b"]
            fset = frozenset([da, db_name])
            if fset in pair_lookup:
                target = pair_lookup[fset]
                # 更新为高质量鉴别文本与人卫教材依据
                target.distinction_text = p_data["distinction"]
                target.evidence = p_data["evidence"]
                target.variant_template = "正向"
                n_updated += 1
            else:
                # 补全缺失经典对
                new_cp = ConfusionPair(
                    domain_id=dom.id,
                    drug_a=da,
                    drug_b=db_name,
                    distinction_text=p_data["distinction"],
                    variant_template="正向",
                    evidence=p_data["evidence"],
                )
                db.add(new_cp)
                pair_lookup[fset] = new_cp
                n_created += 1

    # 清理未被精细化知识库覆盖的机器共现占位对（确保入库对 100% 具备权威人卫9e鉴别）
    placeholder_pairs = db.execute(
        select(ConfusionPair).where(
            (ConfusionPair.distinction_text.like("%待药理顾问撰写%")) |
            (ConfusionPair.distinction_text.like("%待顾问撰写%")) |
            (ConfusionPair.distinction_text.like("%选项中共现%"))
        )
    ).scalars().all()
    for ph in placeholder_pairs:
        db.delete(ph)
        n_deleted += 1

    if n_updated or n_created or n_deleted:
        audit(
            db,
            "seed",
            "chapter_confusion_pairs.refined",
            "DOM-CH*",
            updated=n_updated,
            created=n_created,
            deleted=n_deleted,
        )
        db.commit()

    return {
        "updated": n_updated,
        "created": n_created,
        "deleted_bad": n_deleted,
        "total_domains": len(dom_by_code),
    }


if __name__ == "__main__":
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        res = apply_refined_confusion_pairs(db)
        print("Refinement result:", res)
    finally:
        db.close()
