# -*- coding: utf-8 -*-
"""解析 vs 标准答案 一致性硬校验（只读，2026-09-03）。

药理解析普遍以「故选X。」「选X。」「答案为X。」收尾。把解析里给出的结论字母
与题库标答比对：不一致 = 硬错误（学生会被讲错）。

运行: cd yaozhi-mvp && python corpus/tools/audit_answer_consistency.py
"""
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAT = ROOT / "corpus" / "course-materials"
DB = ROOT / "backend" / "yaozhi_w1.db"

FILES = sorted(MAT.glob("P*-CH*解析批注稿-*.json"))

# 结论句：故选D / 选D / 答案为D / 正确答案D / 本题选D
CONCL = re.compile(r"(?:故选|故应选|因此选|答案[为是:]?|正确答案[为是:]?|本题选|选)\s*([A-E](?:\s*[、,和]\s*[A-E])*)")
# 排除干扰：「下列关于…的叙述错误的是」等题干词不在解析内，风险低
NEG = re.compile(r"(?:不选|非|除外|不是|不宜)选?\s*([A-E])")


def extract_letters(txt: str):
    """取解析末尾的结论字母集合；优先取最后一句。"""
    tail = txt[-90:]
    m = None
    for m in CONCL.finditer(tail):
        pass
    if not m:
        return None, None
    raw = re.sub(r"\s", "", m.group(1))
    letters = set(re.findall(r"[A-E]", raw))
    return letters, m.group(0)


def main():
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    cur = con.cursor()
    dbidx = {}
    for ch, pn, qid, stem, opt, ans, typ in cur.execute(
            "SELECT chapter_ref,paper_no,qid,stem,options,answer,type FROM tiku_questions"):
        dbidx[(ch or "", pn, qid)] = (stem, opt, (ans or "").strip(), typ)

    conflict, noconcl, missing, ok = [], [], [], 0
    per_batch = Counter()
    per_batch_bad = Counter()
    samples = []

    for f in FILES:
        data = json.load(open(f, encoding="utf-8"))
        meta = data.get("meta", {})
        batch = meta.get("batch", f.stem)
        ch = batch.split("-")[1] if "-" in batch else "?"
        for k, v in data.items():
            if k == "meta":
                continue
            ana = v if isinstance(v, str) else (v or {}).get("analysis", "")
            if not ana:
                continue
            try:
                pn, qid = k.split("-", 1)
                qid = int(qid)
            except Exception:
                missing.append((batch, k, "key格式"))
                continue
            row = dbidx.get((ch, pn, qid))
            if not row:
                # 并列章题：放宽到按 paper_no+qid 找
                cands = [(c2, r) for (c2, p2, q2), r in dbidx.items()
                         if p2 == pn and q2 == qid]
                if not cands:
                    missing.append((batch, k, "DB无此题"))
                    continue
                _, row = cands[0]
            stem, opt, ans, typ = row
            per_batch[batch] += 1
            letters, raw = extract_letters(ana)
            if letters is None:
                noconcl.append((batch, k, ana[-60:]))
                continue
            ans_set = set(re.findall(r"[A-E]", ans))
            if not ans_set:
                noconcl.append((batch, k, f"标答非字母:{ans}"))
                continue
            if letters != ans_set:
                per_batch_bad[batch] += 1
                conflict.append((batch, k, ans, "".join(sorted(letters)), raw, ana))
            else:
                ok += 1

    print(f"校验批注稿题数: {sum(per_batch.values())}   结论一致: {ok}   冲突: {len(conflict)}   无结论句: {len(noconcl)}   DB缺: {len(missing)}")
    print(f"冲突率(占可判题): {len(conflict)/max(1,ok+len(conflict)):.1%}\n")

    print("=== 各批冲突分布 ===")
    for b in sorted(per_batch):
        bad = per_batch_bad.get(b, 0)
        if bad:
            print(f"  {b:<14} 题数{per_batch[b]:>4}  冲突 {bad:>3}  ({bad/per_batch[b]:.1%})")

    print("\n=== 冲突明细（标答 vs 解析结论）===")
    for batch, k, ans, got, raw, ana in conflict:
        print(f"[{batch} {k}] 标答={ans}  解析={raw}")
        print(f"    解析尾: …{ana[-70:]}")
    if noconcl:
        print(f"\n=== 无结论句 {len(noconcl)} 题（人工看即可，未必错）===")
        for batch, k, tail in noconcl[:20]:
            print(f"  [{batch} {k}] …{tail}")
    if missing:
        print(f"\n=== DB 缺题 {len(missing)} ===")
        for b, k, why in missing[:30]:
            print(f"  [{b} {k}] {why}")
    con.close()


if __name__ == "__main__":
    main()
