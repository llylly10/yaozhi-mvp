# -*- coding: utf-8 -*-
"""内容化成果只读审计（2026-09-03）。

只读取，不写库、不改任何批注稿。输出三类问题：
  A 结构层：key 声明数 vs 实际数、analysis 缺失/过短/过长/占位符/跨题重复
  B 对齐层：批注稿 key 在 DB 中找不到对应题（chapter_ref+paper_no+qid）
  C 覆盖层：各章题总数 vs published 数、批注稿未登记情况

运行: cd yaozhi-mvp && python corpus/tools/audit_content.py
"""
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # yaozhi-mvp/
MAT = ROOT / "corpus" / "course-materials"
DB = ROOT / "backend" / "yaozhi_w1.db"

BATCH_FILES = [
    ("CH6", "P1-CH6解析批注稿-20260903.json"),
    ("CH3", "P2a-CH3解析批注稿-20260903.json"),
    ("CH2", "P2b1-CH2解析批注稿-20260903.json"),
    ("CH2", "P2b2-CH2解析批注稿-20260903.json"),
    ("CH8", "P3-CH8解析批注稿-20260903.json"),
    ("CH13", "P3-CH13解析批注稿-20260903.json"),
    ("CH18", "P3-CH18解析批注稿-20260903.json"),
    ("CH39", "P3-CH39解析批注稿-20260903.json"),
    ("CH7", "P4a-CH7解析批注稿-20260903.json"),
    ("CH15", "P4b-CH15解析批注稿-20260903.json"),
    ("CH12", "P4b-CH12解析批注稿-20260903.json"),
    ("CH14", "P4b-CH14解析批注稿-20260903.json"),
    ("CH19", "P4c-CH19解析批注稿-20260903.json"),
    ("CH20", "P4c-CH20解析批注稿-20260903.json"),
    ("CH21", "P4c-CH21解析批注稿-20260903.json"),
    ("CH22", "P4c-CH22解析批注稿-20260903.json"),
    ("CH23", "P4c-CH23解析批注稿-20260903.json"),
    ("CH24", "P4c-CH24解析批注稿-20260903.json"),
]
# 已产出但尚未登记进 contentize_tiku.BATCH_FILES
UNREGISTERED = [
    ("CH33", "P4d-CH33解析批注稿-20260903.json"),
    ("CH34", "P4d-CH34解析批注稿-20260903.json"),
    ("CH35", "P4d-CH35解析批注稿-20260903.json"),
    ("CH36", "P4d-CH36解析批注稿-20260903.json"),
    ("CH37", "P4d-CH37解析批注稿-20260903.json"),
    ("CH38", "P4d-CH38解析批注稿-20260903.json"),
    ("CH29", "P4d-CH29解析批注稿-20260903.json"),
    ("CH30", "P4d-CH30解析批注稿-20260903.json"),
    ("CH31", "P4d-CH31解析批注稿-20260903.json"),
    ("CH27", "P4d-CH27解析批注稿-20260903.json"),
    ("CH17", "P4d-CH17解析批注稿-20260903.json"),
    ("CH5", "P4d-CH5解析批注稿-20260903.json"),
    ("CH16", "P4d-CH16解析批注稿-20260903.json"),
    ("CH25", "P4d-CH25解析批注稿-20260903.json"),
    ("CH26", "P4d-CH26解析批注稿-20260903.json"),
    ("CH40", "P4d-CH40解析批注稿-20260903.json"),
    ("CH42", "P4d-CH42解析批注稿-20260903.json"),
]

PLACEHOLDER = re.compile(r"TODO|待补|待填|XXX|\?\?\?|【|】（?待|略[。.]*$|同上")
TAIL_NOTE = re.compile(r"⚠\s*归属说明")


def load_json(p: Path):
    return json.load(open(p, encoding="utf-8"))


def main():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    cur = con.cursor()

    # DB 索引：(chapter_ref, paper_no, qid) -> row
    rows = cur.execute(
        "SELECT chapter_ref, paper_no, qid, analysis, review_status, stem, answer "
        "FROM tiku_questions"
    ).fetchall()
    idx = {}
    for ch, pn, qid, ana, st, stem, ans in rows:
        idx[(ch or "", pn, qid)] = {"analysis": ana, "status": st, "stem": stem, "answer": ans}
    print(f"DB 题库总题数: {len(rows)}")
    pub_db = sum(1 for r in rows if r[4] == "published")
    print(f"DB 已 published: {pub_db}\n")

    all_batches = BATCH_FILES + UNREGISTERED
    issues_a, issues_b = [], []
    gkeys = Counter()      # 全局 key -> 出现次数（跨章重复）
    gana = defaultdict(list)  # analysis 文本 -> [key]
    stats = []

    for ch, fname in all_batches:
        p = MAT / fname
        if not p.exists():
            issues_a.append(f"[A-缺文件] {ch} {fname} 不存在")
            continue
        data = load_json(p)
        meta = data.get("meta", {})
        keys = [k for k in data if k != "meta"]
        declared = meta.get("questions")
        if declared is not None and int(declared) != len(keys):
            issues_a.append(
                f"[A-数量不符] {ch} {fname}: meta 声明 {declared} vs 实际 {len(keys)}")
        miss_db, empty, short, long_, ph, dup, notail = [], [], [], [], [], [], []
        for k in keys:
            gkeys[k] += 1
            it = data[k]
            if not isinstance(it, dict):
                issues_a.append(f"[A-结构错] {ch} {k}: 非 dict")
                continue
            ana = (it.get("analysis") or "").strip()
            extra_keys = set(it) - {"analysis"}
            if extra_keys:
                issues_a.append(f"[A-多余字段] {ch} {k}: {extra_keys}")
            if not ana:
                empty.append(k)
                continue
            gana[ana].append(f"{ch}/{k}")
            n = len(ana)
            if n < 80:
                short.append((k, n))
            if n > 320:
                long_.append((k, n))
            if PLACEHOLDER.search(ana):
                ph.append(k)
            if not ana.startswith("考点"):
                notail.append(k)
            # DB 对齐
            try:
                pn, qid = k.split("-", 1)
                qid = int(qid)
            except Exception:
                issues_a.append(f"[A-key格式] {ch} {k}")
                continue
            if (ch, pn, qid) not in idx:
                miss_db.append(k)
        for label, lst in (("空解析", empty), ("占位符", ph), ("非考点开头", notail)):
            if lst:
                issues_a.append(f"[A-{label}] {ch}: {len(lst)} 题 -> {lst[:6]}")
        if short:
            issues_a.append(f"[A-过短<80字] {ch}: {len(short)} 题 例 {short[:4]}")
        if long_:
            issues_a.append(f"[A-过长>320字] {ch}: {len(long_)} 题 例 {long_[:4]}")
        if miss_db:
            issues_b.append(f"[B-DB无此题] {ch}: {len(miss_db)} 题 -> {miss_db[:8]}")
        stats.append((ch, fname, len(keys), len(short), len(long_), len(miss_db)))

    # 跨章/跨题重复 analysis
    for ana, ks in gana.items():
        if len(ks) > 1:
            issues_a.append(f"[A-解析重复] {len(ks)} 题共用同一解析: {ks[:6]}")

    # 覆盖层
    total_by_ch = Counter()
    pub_by_ch = Counter()
    for ch, pn, qid, ana, st, stem, ans in rows:
        key = ch.split(",")[0] if ch else "(空)"
        total_by_ch[key] += 1
        if st == "published":
            pub_by_ch[key] += 1

    print("=== 各章覆盖（DB 现状）===")
    print(f"{'章':<8}{'总题':>6}{'published':>11}   备注")
    no_pub = []
    for ch in sorted(total_by_ch, key=lambda x: (x != "(空)", x)):
        t, pb = total_by_ch[ch], pub_by_ch[ch]
        mark = "" if pb == t else ("  ← 全缺" if pb == 0 else "  ← 缺 %d" % (t - pb))
        if pb == 0:
            no_pub.append(ch)
        print(f"{ch:<8}{t:>6}{pb:>11}{mark}")

    print("\n=== 批注稿统计 ===")
    print(f"{'章':<7}{'文件':<34}{'key数':>6}{'短':>5}{'长':>5}{'DB缺':>6}")
    tot = 0
    for ch, f, n, s, l, m in stats:
        print(f"{ch:<7}{f:<34}{n:>6}{s:>5}{l:>5}{m:>6}")
        tot += n
    print(f"批注稿题目总数（含未登记）: {tot}")

    print("\n=== 问题清单 ===")
    if not issues_a and not issues_b:
        print("无")
    for i in issues_a:
        print("A|", i)
    for i in issues_b:
        print("B|", i)
    print(f"\n结构层问题 {len(issues_a)} 条 / 对齐层问题 {len(issues_b)} 条")
    con.close()


if __name__ == "__main__":
    sys.exit(main())
