# -*- coding: utf-8 -*-
"""修正 A 类 4 题疑似错误单映射（幂等，dry-run 默认 / --apply 写库）。
修正：01-030→CH24, 01-265→CH17, 02-160→CH42, 01-154→CH20
用法：python fix_a_mapping.py [--apply]
"""
import sqlite3, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DB = r"D:\ceshi\yaozhi-mvp\backend\yaozhi_w1.db"
APPLY = "--apply" in sys.argv

# (paper_no, qid) -> 目标章
FIXES = {
    ("01", 30): "CH24",   # HMG-CoA 还原酶抑制剂(洛伐他汀) → 抗动脉粥样硬化药
    ("01", 265): "CH17",  # 增加尿酸排泄(丙磺舒) → 抗痛风药
    ("02", 160): "CH42",  # 羟基脲抗代谢机制 → 抗肿瘤药
    ("01", 154): "CH20",  # 尼莫地平治头痛/高血压 → 钙拮抗药/抗高血压
}
# 期望的旧值（防误改）
EXPECT_OLD = {
    ("01", 30): "CH2",
    ("01", 265): "CH2",
    ("02", 160): "CH2",
    ("01", 154): "CH3",
}

con = sqlite3.connect(DB)
cur = con.cursor()
changes = []
for (paper, qid), new_ref in FIXES.items():
    cur.execute("SELECT chapter_ref FROM tiku_questions WHERE paper_no=? AND qid=?", (paper, qid))
    row = cur.fetchone()
    if row is None:
        changes.append((paper, qid, "NOT FOUND", new_ref))
        continue
    old = row[0]
    if old == new_ref:
        changes.append((paper, qid, old, new_ref, "SKIP(already)"))
    elif old != EXPECT_OLD[(paper, qid)]:
        changes.append((paper, qid, old, new_ref, f"WARN: old != expected {EXPECT_OLD[(paper, qid)]}"))
    else:
        changes.append((paper, qid, old, new_ref, "UPDATE"))

print(f"模式: {'--apply 写库' if APPLY else 'dry-run（默认）'}")
print(f"计划修正 {len(FIXES)} 题:\n")
for c in changes:
    paper, qid = c[0], c[1]
    if len(c) == 4:
        print(f"  {paper}-{qid:03d}: {c[3]}  (题不存在!)")
        continue
    old, new, status = c[2], c[3], c[4]
    print(f"  {paper}-{qid:03d}: {old} -> {new}  [{status}]")

if APPLY:
    n = 0
    for c in changes:
        if len(c) == 4:
            continue
        paper, qid, old, new, status = c
        if status == "UPDATE":
            cur.execute("UPDATE tiku_questions SET chapter_ref=? WHERE paper_no=? AND qid=?", (new, paper, qid))
            n += 1
    con.commit()
    print(f"\n已写库更新 {n} 题。")
else:
    print("\n未写库。确认无误后加 --apply 执行。")

con.close()
