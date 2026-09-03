# -*- coding: utf-8 -*-
"""题库解析质量校验：
1. 题号连续性（1..N 无断号/无跳号）
2. 选项完整性（A1/A2 应有 A-E 5 个选项；B1 题共享组选项）
3. 答案合法性（答案字母 ∈ 选项键）
4. 抽样 10 题全文打印（人工核对）
5. 复查 A2 无选项题
"""
import json, random

d = json.load(open(r"D:\ceshi\corpus\course-materials\tiku_parsed.json", encoding="utf-8"))
random.seed(20260901)

total_issues = 0
for paper in d:
    qs = paper["questions"]
    ids = [q["qid"] for q in qs]
    missing_ids = [i for i in range(1, max(ids) + 1) if i not in ids]
    print("=" * 70)
    print(f"卷 {paper['paper']}: {len(qs)} 题 | 题号范围 {min(ids)}-{max(ids)} | 断号: {missing_ids if missing_ids else '无'}")
    # 选项完整性 + 答案合法性
    noopt = []
    badans = []
    shortopt = []
    for q in qs:
        opts = q["options"]
        if q["type"] == "B1":
            if len(opts) < 5:
                shortopt.append(q["qid"])
        else:
            if not opts:
                noopt.append(q["qid"])
            elif len(opts) < 5:
                shortopt.append(q["qid"])
        if q.get("answer") and opts and q["answer"] not in opts:
            badans.append((q["qid"], q["answer"], list(opts.keys())))
    print(f"  无选项题: {noopt if noopt else '无'} | 选项不足5个: {shortopt if shortopt else '无'} | 答案不在选项内: {badans if badans else '无'}")
    total_issues += len(missing_ids) + len(noopt) + len(shortopt) + len(badans)

# 抽样 10 题全文（均匀抽样：每卷取 3-4 题）
print("\n" + "=" * 70)
print("抽样核对（人工检查题干-选项-答案一致性）:")
picked = 0
for paper in d:
    qs = paper["questions"]
    n = len(qs)
    for idx in random.sample(range(n), min(3, n)):
        q = qs[idx]
        picked += 1
        print(f"\n--- 卷{paper['paper']} 题{q['qid']} [{q['type']}] 答案: {q.get('answer')} ---")
        print(f"题干: {q['stem'][:150]}")
        for k in sorted(q["options"]):
            print(f"  {k}. {q['options'][k][:60]}")
print(f"\n抽样共 {picked} 题")

# 复查卷01 A2 无选项题 85/214/218（如有）
print("\n" + "=" * 70)
print("复查 A2 特殊题:")
for paper in d:
    if paper["paper"] != "01":
        continue
    for qid in [85, 214, 218]:
        hit = [q for q in paper["questions"] if q["qid"] == qid]
        for q in hit:
            print(f"\n题{qid} [{q['type']}] 答案{q.get('answer')} 选项{list(q['options'].keys())}")
            print(f"题干: {q['stem'][:120]}")

print(f"\n问题总数: {total_issues}")
