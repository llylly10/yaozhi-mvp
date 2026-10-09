# -*- coding: utf-8 -*-
"""图谱 A/B 类机械核验边批量转 published（2026-10-07，维护工具）。

依 scripts/kg_review_readiness.py 的分诊口径，对 knowledge_relations 逐条重跑
机械核验，通过者 review_status: draft → published：
  A 大纲转写边（note ∈ {教学大纲章节结构/教学大纲节下知识点/大纲知识点术语归属}）
    → 对照 syllabus_chapters.sections 原文重推导期望三元组，命中才转；
  B 题库共现边（evidence.source=题库共现 或 note 以「本章」开头）
    → 核验引用题号真实存在且药物确被提及，全部通过才转；
  C 顾问人审边（其余）→ 保持 draft，待药理顾问逐条签署。

幂等：published 边跳过，重放零改动；挂接 seed._restore_course_assets 末尾，
reset-demo 重建图谱后自动恢复晋升状态（防静默打回）。
"""
import json
from collections import defaultdict

from sqlalchemy import select  # noqa: E402

from app.models import KnowledgeRelation, SyllabusChapter, TikuQuestion, audit  # noqa: E402

A_NOTES = {"教学大纲章节结构", "教学大纲节下知识点", "大纲知识点术语归属"}


def _expected_a_triples(syl_rows) -> set:
    """重推导大纲期望三元组 (source_name, edge, target_name)，与 readiness 台账同口径。"""
    exp = set()
    for title, sections in syl_rows:
        for sec in sections or []:
            if not isinstance(sec, dict):
                continue
            sec_title = (sec.get("title") or "").strip()
            if not sec_title:
                continue
            exp.add((title, "包含", sec_title))
            for p in sec.get("points", []) or []:
                p = str(p).strip()
                if not p:
                    continue
                if len(p) <= 14 and ("药" in p or "剂" in p):
                    exp.add((p, "属于", title))
                else:
                    exp.add((sec_title, "包含", p[:64]))
    return exp


def _tiku_text_map(tiku_rows) -> dict:
    """题号 → 题干+选项+解析 拼接文本，供 B 类核验。"""
    out = {}
    for q in tiku_rows:
        opts = " ".join(o.get("text", "") for o in (q.options or [])
                        if isinstance(o, dict))
        out[f"{q.paper_no}-{q.qid:03d}"] = (q.stem or "") + opts + (q.analysis or "")
    return out


def promote_verified_edges(db) -> dict:
    """A/B 类机械核验通过边转 published。返回计数；有变更时写审计并 commit。"""
    syl_rows = []
    for r in db.execute(select(SyllabusChapter)).scalars():
        sections = r.sections if isinstance(r.sections, list) else json.loads(r.sections or "[]")
        syl_rows.append((r.title, sections))
    exp_a = _expected_a_triples(syl_rows)
    tiku_text = _tiku_text_map(db.execute(select(TikuQuestion)).scalars().all())

    a_pub = b_pub = c_kept = skip = 0
    for r in db.execute(select(KnowledgeRelation)).scalars():
        if r.review_status == "published":
            skip += 1
            continue
        note = r.note or ""
        try:
            ev = r.evidence if isinstance(r.evidence, dict) else json.loads(r.evidence or "{}")
        except (json.JSONDecodeError, TypeError):
            ev = {}
        triple = ((r.source or {}).get("name"), r.edge, (r.target or {}).get("name"))

        if note in A_NOTES:
            if triple in exp_a:
                r.review_status = "published"
                a_pub += 1
            else:
                c_kept += 1  # 大纲重推导未命中，视为未核验，保持 draft
        elif ev.get("source") == "题库共现" or note.startswith("本章"):
            drug = (r.source or {}).get("name", "")
            ok = bool(ev.get("refs"))
            for ref in ev.get("refs") or []:
                text = tiku_text.get(ref)
                if text is None or (drug and drug not in text):
                    ok = False
                    break
            if ok:
                r.review_status = "published"
                b_pub += 1
            else:
                c_kept += 1  # 引用核验未通过，保持 draft
        else:
            c_kept += 1

    result = {"published": a_pub + b_pub, "a": a_pub, "b": b_pub,
              "kept_draft": c_kept, "already_published": skip}
    if a_pub + b_pub:
        audit(db, "seed", "graph.review_promoted", "knowledge_relations", **result)
        db.commit()
    return result


if __name__ == "__main__":  # python -m seed.promote_graph_review
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        print(promote_verified_edges(db))
    finally:
        db.close()
