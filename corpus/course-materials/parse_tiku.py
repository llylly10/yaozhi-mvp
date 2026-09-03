# -*- coding: utf-8 -*-
"""药理学题库解析器：A1 单选 + B1 共用备选答案（配伍）+ 答案区合并。

输入: D:\\ceshi\\corpus\\course-materials\\药理学题库1\\药理学题库{01,02,03}.pdf
输出: D:\\ceshi\\corpus\\course-materials\\tiku_parsed.json（全部题目+答案）
      D:\\ceshi\\corpus\\course-materials\\tiku_parsed_stats.txt（统计与校验摘要）
"""
import os, re, json
from pypdf import PdfReader

BASE = r"D:\ceshi\corpus\course-materials\药理学题库1"
OUT_JSON = r"D:\ceshi\corpus\course-materials\tiku_parsed.json"
OUT_STATS = r"D:\ceshi\corpus\course-materials\tiku_parsed_stats.txt"

FILES = ["药理学题库01.pdf", "药理学题库02.pdf", "药理学题库03.pdf"]


def extract_full_text(path):
    r = PdfReader(path)
    return "\n".join((pg.extract_text() or "") for pg in r.pages)


def parse_paper(text):
    """返回 (questions, answers, paper_stats)"""
    lines = text.split("\n")
    questions = []          # 题目列表
    answers = {}            # qid -> letter
    answer_sections = []    # 答案区题型段 [(题型, 题号列表)]
    pending_b1 = None       # B1 共用选项 {A:..,B:..}
    cur_q = None
    in_answer = False
    cur_ans_type = None
    cur_ans_ids = []

    for raw in lines:
        s = raw.strip()
        if not s:
            continue
        if s.startswith("答案") or s.startswith("答案："):
            in_answer = True
            continue
        if in_answer:
            m = re.match(r"^题型[:：]\s*([A-Za-z]\d*)", s)
            if m:
                if cur_ans_type:
                    answer_sections.append((cur_ans_type, cur_ans_ids))
                cur_ans_type = m.group(1)
                cur_ans_ids = []
                continue
            for mm in re.finditer(r"(\d{1,3})\s*[\.、．]\s*([A-Ea-e])", s):
                qid = int(mm.group(1))
                ans = mm.group(2).upper()
                answers[qid] = ans
                if qid not in cur_ans_ids:
                    cur_ans_ids.append(qid)
            continue
        # ---- 题目区 ----
        if re.match(r"^题型[:：]", s):          # 页眉题型标记
            continue
        # 新题：题号 + 点/顿号。
        # 排除小数折行（0.5mg / 1.75μg / 1.5×109）；但题号后跟"岁"（如 71.56岁男性）是合法题
        m = re.match(r"^(\d{1,3})[\.、．](.*)", s)
        if m:
            qid = int(m.group(1))
            rest = m.group(2)
            is_age = bool(re.match(r"^\s*\d{1,2}\s*岁", rest))
            if qid >= 1 and ((not re.match(r"^\d", rest)) or is_age):
                if cur_q:
                    questions.append(cur_q)
                cur_q = {"qid": qid, "stem": rest.strip(), "options": {}, "type": "A1"}
                if pending_b1 is not None:
                    cur_q["type"] = "B1"
                    cur_q["options"] = dict(pending_b1)
                continue
            # 小数折行（如 "1.5×109"）→ 当题干续行处理
        if re.match(r"^[（(]?\d{1,3}～\d{1,3}[)）]?\s*共用备选答案", s):  # B1 组头
            continue
        m = re.match(r"^([A-Ea-e])[\.、．](.*)", s)   # 选项
        if m:
            letter = m.group(1).upper()
            content = m.group(2).strip()
            if pending_b1 is not None:               # B1 组选项：优先填当前组
                if letter not in pending_b1:
                    pending_b1[letter] = content
                else:
                    pending_b1[letter] += ("\n" + s if pending_b1[letter] else content)
            elif cur_q is not None:
                cur_q["options"][letter] = content  # A1/A2 选项（含选项续行覆盖）
            continue
        if "共用备选答案" in s:                    # B1 选项组开始（重置组选项）
            pending_b1 = {}
            continue
        if cur_q:                                  # 题干续行 / 选项续行
            if cur_q["options"] and pending_b1 is None:
                last = list(cur_q["options"])[-1]
                cur_q["options"][last] += ("\n" + s if cur_q["options"][last] else s)
            else:
                cur_q["stem"] += s
    if cur_q:
        questions.append(cur_q)
    if cur_ans_type:
        answer_sections.append((cur_ans_type, cur_ans_ids))

    # 给题目标答案 + 校验
    missing = [q["qid"] for q in questions if q["qid"] not in answers]
    for q in questions:
        q["answer"] = answers.get(q["qid"])
    # 按题型段给题目标注卷内题型（答案区为准）
    type_map = {}
    for t, ids in answer_sections:
        for i in ids:
            type_map[i] = t
    for q in questions:
        q["ans_section_type"] = type_map.get(q["qid"], q["type"])

    stats = {
        "total_questions": len(questions),
        "by_qtype": {},
        "by_ans_type": {},
        "missing_answers": missing,
        "dup_qids": [x for x in set(a for a in [q["qid"] for q in questions]) if
                     [q["qid"] for q in questions].count(x) > 1],
        "b1_groups": 0,
    }
    for q in questions:
        stats["by_qtype"][q["type"]] = stats["by_qtype"].get(q["type"], 0) + 1
        t = q["ans_section_type"]
        stats["by_ans_type"][t] = stats["by_ans_type"].get(t, 0) + 1
    # B1 组数统计（连续 B1 题共享同一组）
    prev = None
    group_keys = set()
    for q in questions:
        if q["type"] == "B1":
            key = tuple(sorted(q["options"].items()))
            group_keys.add(key)
    stats["b1_groups"] = len(group_keys)
    return questions, answers, stats


def main():
    all_papers = []
    total_q = 0
    all_stats = []
    for f in FILES:
        path = os.path.join(BASE, f)
        text = extract_full_text(path)
        qs, ans, st = parse_paper(text)
        paper_no = f.replace("药理学题库", "").replace(".pdf", "")
        all_papers.append({"paper": paper_no, "file": f, "questions": qs,
                           "answer_count": len(ans), "stats": st})
        total_q += len(qs)
        all_stats.append((paper_no, st))

    with open(OUT_JSON, "w", encoding="utf-8") as fo:
        json.dump(all_papers, fo, ensure_ascii=False, indent=1)

    lines = []
    lines.append(f"总题数: {total_q}")
    for no, st in all_stats:
        lines.append(f"\n卷 {no}: 题数 {st['total_questions']} | 解析题型 {st['by_qtype']} | 答案区题型 {st['by_ans_type']} | B1 组 {st['b1_groups']}")
        lines.append(f"  缺答案: {st['missing_answers'][:20]}{'...' if len(st['missing_answers'])>20 else ''} | 重复题号: {st['dup_qids'][:10]}")
    # 答案覆盖率
    miss_all = [qid for no, st in all_stats for qid in st["missing_answers"]]
    lines.append(f"\n缺答案总数: {len(miss_all)} / {total_q}  ({len(miss_all)/total_q*100:.1f}%)")
    with open(OUT_STATS, "w", encoding="utf-8") as fo:
        fo.write("\n".join(lines))
    print("\n".join(lines))
    print(f"\n已输出: {OUT_JSON}")


if __name__ == "__main__":
    main()
