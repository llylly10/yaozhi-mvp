# -*- coding: utf-8 -*-
"""检索质量自动评测（2026-09-29）：题库章节归属作弱标注，对比 BM25 单路 vs BM25+语义混合。

弱标注口径：
- 题库题 chapter_ref="CHnn" → 教材中标注为「第nn章」的页为其命中集合；
- 仅统计章节起始页已可靠定位的章（corpus.CHAPTER_STARTS：第 1-20、24、30、39、40 章），
  未覆盖章的页面标签不可靠，两模式同受影响，故剔除不计；
- hit@k = top-k 内出现任一该章页面。查询构造与诊断链路一致（题干 + ≤60 字短选项）。

用法（backend 目录）：../.venv/Scripts/python.exe eval/retrieval_eval.py
输出：两种模式的 hit@1/3/5、MRR、BM25 空手救回数、回归数、分章明细。
"""
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import SyllabusChapter, TikuQuestion  # noqa: E402
from app.rag import retriever  # noqa: E402
from app.rag.corpus import CHAPTER_STARTS, load_pages  # noqa: E402

PAGE_CH = re.compile(r"^(第(\d+)章)")
QUERY_MAX = 400


def page_chapter_no(chapter: str) -> int | None:
    m = PAGE_CH.match(chapter or "")
    return int(m.group(2)) if m else None


def build_query(q) -> str:
    parts = [q.stem or ""]
    for o in (q.options or []):
        t = o.get("text", "")
        if t and len(t) <= 60:
            parts.append(t)
    query = " ".join(parts)
    return query[:QUERY_MAX] if query else ""


def main() -> dict:
    pages = load_pages()

    # 金标注：大纲章标题 ↔ 页标签子串匹配（大纲编号因补章与教材编号错位，章号不可直接映射）
    db = SessionLocal()
    try:
        syllabus = db.execute(select(SyllabusChapter)).scalars().all()
        tiku_rows = db.execute(select(TikuQuestion).where(
            TikuQuestion.review_status == "published")).scalars().all()
    finally:
        db.close()

    def norm(s: str) -> str:
        return re.sub(r"\s+", "", s or "")

    gold_pages = {}  # 大纲章号 → {pdf_page: label}
    for sc in syllabus:
        title = norm(sc.title)
        if len(title) < 3:
            continue
        hit_pages = {p.pdf_page: p.chapter for p in pages if title in norm(p.chapter)}
        if hit_pages:
            gold_pages[sc.book_chapter_no] = hit_pages

    cases = []
    skipped = {"no_matching_pages": 0, "no_stem": 0}
    for q in tiku_rows:
        m = re.match(r"^CH(\d+)$", (q.chapter_ref or "").strip().upper())
        gold = gold_pages.get(int(m.group(1))) if m else None
        if not gold:
            skipped["no_matching_pages"] += 1
            continue
        if not (q.stem or "").strip():
            skipped["no_stem"] += 1
            continue
        cases.append({"qid": f"{q.paper_no}-{q.qid}", "query": build_query(q), "gold": gold})
    print(f"题库 published {len(tiku_rows)} 题 → 可评测 {len(cases)} 题"
          f"（剔除：{skipped}）；可测大纲章 {len(gold_pages)}/{len(syllabus)}")

    results = {}
    for mode, enabled in (("bm25", False), ("hybrid", True)):
        settings.rag_semantic_enabled = enabled
        retriever.reset_for_tests()
        t0 = time.time()
        stat = defaultdict(int)
        rr_sum = 0.0
        per_chapter = defaultdict(lambda: [0, 0])  # 大纲章号 → [hit5, total]
        rescued, regressed = [], []
        bm25_hits = {}
        if mode == "hybrid":
            bm25_only_top5 = {}
        for c in cases:
            hits = retriever.retrieve_mixed(c["query"], k=5, db=None)
            gold = c["gold"]
            chs = [1 if (h.source == "textbook" and norm(h.chapter) in {norm(g) for g in gold.values()} or
                         any(norm(g) in norm(h.chapter or "") for g in gold.values())) else 0
                   for h in hits]
            ranks = [i + 1 for i, f in enumerate(chs) if f]
            hit5 = bool(ranks)
            hit1 = bool(ranks and ranks[0] == 1)
            hit3 = bool(ranks and ranks[0] <= 3)
            rr = 1.0 / ranks[0] if ranks else 0.0
            stat["n"] += 1
            stat["hit1"] += hit1
            stat["hit3"] += hit3
            stat["hit5"] += hit5
            rr_sum += rr
            per_chapter[c["gold"] and list(c["gold"].keys())[0]][0] += hit5
            per_chapter[c["gold"] and list(c["gold"].keys())[0]][1] += 1
            if mode == "bm25":
                bm25_hits[c["qid"]] = hit5
            else:
                if not bm25_hits.get(c["qid"]) and hit5:
                    rescued.append(c["qid"])
                if bm25_hits.get(c["qid"]) and not hit5:
                    regressed.append(c["qid"])
        results[mode] = {
            "hit1": round(stat["hit1"] / stat["n"], 4),
            "hit3": round(stat["hit3"] / stat["n"], 4),
            "hit5": round(stat["hit5"] / stat["n"], 4),
            "mrr": round(rr_sum / stat["n"], 4),
            "seconds": round(time.time() - t0, 1),
            "per_chapter": {f"第{k}章": f"{v[0]}/{v[1]}" for k, v in sorted(per_chapter.items())},
            "_rescued": rescued,
            "_regressed": regressed,
            "_n": stat["n"],
        }
        print(f"[{mode}] hit@1={results[mode]['hit1']} hit@3={results[mode]['hit3']} "
              f"hit@5={results[mode]['hit5']} MRR={results[mode]['mrr']} "
              f"({results[mode]['seconds']}s)")

    settings.rag_semantic_enabled = True
    retriever.reset_for_tests()
    return {
        "evaluated": results["bm25"]["_n"],
        "bm25": {k: v for k, v in results["bm25"].items() if not k.startswith("_")},
        "hybrid": {k: v for k, v in results["hybrid"].items() if not k.startswith("_")},
        "bm25空手_混合救回": results["hybrid"]["_rescued"],
        "bm25命中_混合回归": results["hybrid"]["_regressed"],
        "分章明细": results["hybrid"]["per_chapter"],
    }


if __name__ == "__main__":
    out = main()
    out_file = Path(__file__).resolve().parent / "retrieval_eval_results.json"
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"结果已写 {out_file}")
