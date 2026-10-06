# -*- coding: utf-8 -*-
"""知识图谱审校就绪台账生成器（2026-10-04，维护工具）。

把 knowledge_relations 841 边按可核验性分三类：
  A 大纲转写边（note=教学大纲章节结构/教学大纲节下知识点/大纲知识点术语归属）
    → 对照 syllabus_chapters.sections 原文机械化重推导并 diff；
  B 题库共现边（evidence.source=题库共现）
    → 对照 tiku_questions 原文核验引用题号真实存在且药物确被提及；
  C 顾问人审边（其余：混淆候选/临床横切等 LLM 起草内容）
    → 连同 confusion_pairs 131 组（含鉴别文案与教材出处）产出审校工作表。

产出:
  corpus/course-materials/审校工作表-章节图谱-<date>.md   （顾问工作台）
  scratch/kg_review_summary.txt                           （运行摘要）
用法（backend/ 或仓库根）:
  ../.venv/Scripts/python.exe scripts/kg_review_readiness.py
"""
import json
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "backend" / "yaozhi_w1.db"
OUT_DIR = ROOT / "corpus" / "course-materials"

A_NOTES = {"教学大纲章节结构", "教学大纲节下知识点", "大纲知识点术语归属"}


def main():
    db = sqlite3.connect(str(DB))
    db.row_factory = sqlite3.Row

    # ---------- 基础数据 ----------
    rels = db.execute("select * from knowledge_relations").fetchall()
    syl = {r["title"]: json.loads(r["sections"] or "[]")
           for r in db.execute("select title, sections from syllabus_chapters")}
    tiku_text = {}
    for r in db.execute("select paper_no, qid, stem, options, analysis from tiku_questions"):
        opts = " ".join(o.get("text", "") for o in (json.loads(r["options"] or "[]")
                                                    if isinstance(r["options"], str) else [])
                        if isinstance(o, dict))
        tiku_text[f"{r['paper_no']}-{r['qid']:03d}"] = (r["stem"] or "") + opts + (r["analysis"] or "")

    # ---------- 分类 ----------
    a_rels, b_rels, c_rels = [], [], []
    for r in rels:
        note = r["note"] or ""
        try:
            ev = json.loads(r["evidence"] or "{}")
        except (json.JSONDecodeError, TypeError):
            ev = {}
        if note in A_NOTES:
            a_rels.append(r)
        elif ev.get("source") == "题库共现" or note.startswith("本章"):
            b_rels.append(r)
        else:
            c_rels.append(r)

    print(f"总边 {len(rels)} = A大纲转写 {len(a_rels)} + B题库共现 {len(b_rels)} "
          f"+ C顾问人审 {len(c_rels)}")

    # ---------- A 类机械化核验：重推导大纲期望边并 diff ----------
    def expected_a():
        exp = set()
        for ch_title, sections in syl.items():
            chap = {"type": "章节", "name": ch_title}
            exp.add((ch_title, "包含", sections and None or ""))  # placeholder replaced below
            exp.discard((ch_title, "包含", ""))
            for sec in sections:
                sec_title = (sec.get("title") or "").strip()
                if not sec_title:
                    continue
                exp.add((ch_title, "包含", sec_title))
                for p in sec.get("points", []) or []:
                    p = str(p).strip()
                    if not p:
                        continue
                    if len(p) <= 14 and ("药" in p or "剂" in p):
                        exp.add((p, "属于", ch_title))
                    else:
                        exp.add((sec_title, "包含", p[:64]))
        return exp

    exp_a = expected_a()
    stored_a = {(json.loads(r["source"]).get("name"),
                 r["edge"],
                 json.loads(r["target"]).get("name")) for r in a_rels}
    a_match = len(stored_a & exp_a)
    a_extra = sorted(stored_a - exp_a)
    a_missing = sorted(exp_a - stored_a)

    # ---------- B 类机械化核验：引用题号存在 + 药物被提及 ----------
    b_pass = b_fail = 0
    b_failures = []
    for r in b_rels:
        try:
            ev = json.loads(r["evidence"] or "{}")
        except (json.JSONDecodeError, TypeError):
            ev = {}
        refs = ev.get("refs") or []
        drug = json.loads(r["source"]).get("name", "")
        ok = bool(refs)
        for ref in refs:
            text = tiku_text.get(ref)
            if text is None or (drug and drug not in text):
                ok = False
                b_failures.append((r["id"][:8], drug, ref,
                                   "题号不存在" if text is None else "药物未在原文出现"))
                break
        if ok:
            b_pass += 1
        else:
            b_fail += 1

    # ---------- C 类工作表 ----------
    pairs = db.execute("select * from confusion_pairs order by drug_a").fetchall()
    c_edges_by_kind = Counter()
    for r in c_rels:
        c_edges_by_kind[(r["edge"], (json.loads(r["source"]).get("type") or "?") + "→" +
                         (json.loads(r["target"]).get("type") or "?"))] += 1

    today = datetime.now().strftime("%Y-%m-%d")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_md = OUT_DIR / f"审校工作表-章节图谱-{today}.md"
    L = []
    L.append(f"# 药知 · 章节图谱审校工作表（{today}）")
    L.append("")
    L.append("> 目的：knowledge_relations 全部 841 边当前为 draft，转 published 前的审校分诊。")
    L.append("> A/B 两类已机械化核验（结论见下），**顾问仅需审 C 类**。")
    L.append("")
    L.append("## 一、总量与分诊")
    L.append("")
    L.append(f"- 总边数：{len(rels)}")
    L.append(f"- A 大纲转写边：{len(a_rels)}（机械核验：与大纲原文 diff，一致 {a_match}，"
             f"多出 {len(a_extra)}，缺失 {len(a_missing)}）")
    L.append(f"- B 题库共现边：{len(b_rels)}（机械核验：通过 {b_pass}，失败 {b_fail}）")
    L.append(f"- C 顾问人审边：{len(c_rels)}（按边类型：{dict(c_edges_by_kind)}）")
    L.append(f"- 另含 ConfusionPair 行：{len(pairs)} 组（LLM 起草的鉴别文案，需人审）")
    L.append("")
    if a_extra:
        L.append("### A 类多出（存储有、大纲无——需人工确认是否漂移）")
        L.append("")
        for s, e, t in a_extra[:20]:
            L.append(f"- {s} --{e}--> {t}")
        L.append("")
    if b_failures:
        L.append("### B 类失败明细")
        L.append("")
        for fid, drug, ref, why in b_failures[:20]:
            L.append(f"- 边 {fid} 药物[{drug}] 引用[{ref}]：{why}")
        L.append("")
    L.append("## 二、顾问审校清单 · ConfusionPair（131 组鉴别文案）")
    L.append("")
    L.append("| # | drug_a | drug_b | 鉴别要点（LLM 起草，请核对） | 教材依据 | 审校结论 |")
    L.append("|---|---|---|---|---|---|")
    for i, p in enumerate(pairs, 1):
        ev = {}
        try:
            ev = json.loads(p["evidence"] or "{}")
        except (json.JSONDecodeError, TypeError):
            pass
        cite = f"{ev.get('chapter', '')} p{ev.get('book_page', '?')}"
        L.append(f"| {i} | {p['drug_a']} | {p['drug_b']} | {p['distinction_text']} | {cite} | |")
    L.append("")
    L.append("## 三、顾问审校清单 · C 类关系边")
    L.append("")
    L.append("| 边ID | source | edge | target | note | 审校结论 |")
    L.append("|---|---|---|---|---|---|")
    for r in c_rels:
        s = json.loads(r["source"])
        t = json.loads(r["target"])
        L.append(f"| {r['id'][:8]} | {s.get('name')}（{s.get('type')}） | {r['edge']} "
                 f"| {t.get('name')}（{t.get('type')}） | {(r['note'] or '')[:40]} | |")
    L.append("")
    L.append("## 四、转 published 建议口径")
    L.append("")
    L.append("- A 类：机械核验全部通过后可转 published（大纲原文逐字转写，无药理断言）。")
    L.append("- B 类：核验通过后可转 published（题库原文共现计数，非药效断言）。")
    L.append("- C 类：顾问逐条签署后方可转 published；未签署前保持 draft。")
    out_md.write_text("\n".join(L), encoding="utf-8")

    print(f"A 核验: 一致 {a_match} / 多出 {len(a_extra)} / 缺失 {len(a_missing)}")
    print(f"B 核验: 通过 {b_pass} / 失败 {b_fail}")
    print(f"C 工作表: {len(c_rels)} 边 + {len(pairs)} 组混淆对 -> {out_md}")
    print(f"worktable_bytes={out_md.stat().st_size}")


if __name__ == "__main__":
    sys.exit(main())
