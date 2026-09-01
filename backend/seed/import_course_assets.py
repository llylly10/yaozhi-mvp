# -*- coding: utf-8 -*-
"""导入课程资产（题库原文 + 大纲树）到 yaozhi_w1.db。

来源: D:\\ceshi\\corpus\\course-materials\\tiku_parsed.json / 教学大纲-结构化.json
幂等: 按 (paper_no, qid) 与 book_chapter_no 查重，已存在则跳过（可重复执行）。
运行: cd backend && python -m seed.import_course_assets
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    SyllabusChapter, SyllabusExperiment, TikuPaper, TikuQuestion)

MAT_DIR = r"D:\ceshi\corpus\course-materials"
TIKU_JSON = MAT_DIR + r"\tiku_parsed.json"
SYLLABUS_JSON = MAT_DIR + r"\教学大纲-结构化.json"


def options_to_list(opts: dict) -> list:
    """{"A": "…", "B": "…"} -> [{"key","text"}...]，保持键顺序。"""
    return [{"key": k, "text": v} for k, v in opts.items() if v]


def import_tiku(db):
    if not Path(TIKU_JSON).exists():
        print(f"⚠ 缺少题库文件: {TIKU_JSON}，跳过")
        return 0, 0
    with open(TIKU_JSON, encoding="utf-8") as f:
        papers = json.load(f)

    # 已有键集合，避免逐条查询
    existing_q = {(r.paper_no, r.qid) for r in db.query(TikuQuestion).all()}
    existing_p = {p.paper_no for p in db.query(TikuPaper).all()}

    n_paper, n_q, n_skip = 0, 0, 0
    for paper in papers:
        pno = paper["paper"]
        st = paper.get("stats", {}) or {}
        by_qt = st.get("by_qtype", {}) or {}
        by_at = st.get("by_ans_type", {}) or {}
        if pno not in existing_p:
            db.add(TikuPaper(
                paper_no=pno,
                file=paper.get("file", ""),
                total=len(paper["questions"]),
                count_a1=by_qt.get("A1", 0),
                count_a2=by_at.get("A2", 0),
                count_b1=by_qt.get("B1", 0),
                answer_count=paper.get("answer_count", 0),
                stats=st,
            ))
            n_paper += 1
            existing_p.add(pno)
        for q in paper["questions"]:
            if (pno, q["qid"]) in existing_q:
                n_skip += 1
                continue
            db.add(TikuQuestion(
                paper_no=pno,
                qid=q["qid"],
                type=q.get("type", ""),
                stem=q.get("stem", ""),
                options=options_to_list(q.get("options", {})),
                answer=q.get("answer", ""),
                ans_section_type=q.get("ans_section_type", ""),
            ))
            existing_q.add((pno, q["qid"]))
            n_q += 1
    db.commit()
    print(f"[题库] 卷 {n_paper} 新增 / 题 {n_q} 新增 / {n_skip} 已存在跳过")
    return n_paper, n_q


def import_syllabus(db):
    if not Path(SYLLABUS_JSON).exists():
        print(f"⚠ 缺少大纲文件: {SYLLABUS_JSON}，跳过")
        return 0
    with open(SYLLABUS_JSON, encoding="utf-8") as f:
        data = json.load(f)

    existing = {c.book_chapter_no for c in db.query(SyllabusChapter).all()}
    n_new, n_skip = 0, 0
    for ch in data["chapters"]:
        bno = ch["book_chapter_no"]
        if bno in existing:
            n_skip += 1
            continue
        items = ch.get("teach_items", []) or []
        db.add(SyllabusChapter(
            book_chapter_no=bno,
            title=ch.get("title", ""),
            teach_seqs=[it["teach_seq"] for it in items],
            hours_theory=sum(it.get("hours_theory", 0) for it in items),
            hours_practice=sum(it.get("hours_practice", 0) for it in items),
            objectives=ch.get("objectives", {}),
            key_points=ch.get("key_points", []),
            difficulties=ch.get("difficulties", []),
            sections=ch.get("sections", []),
            experiments=ch.get("experiments", []),
            notes=ch.get("notes", []),
        ))
        existing.add(bno)
        n_new += 1

    # 实验明细（10 个实验，含独立实践课 9/10）
    import re
    exp_pat = re.compile(r"^实验(\d+)\s*")
    existing_e = {e.seq_no for e in db.query(SyllabusExperiment).all()}
    n_exp = 0
    for exp in data.get("experiments", []):
        m = exp_pat.match(exp["name"])
        seq = int(m.group(1)) if m else 0
        if seq == 0 or seq in existing_e:
            continue
        db.add(SyllabusExperiment(seq_no=seq, name=exp["name"],
                                  hours=exp.get("hours", 3), desc=exp.get("desc", [])))
        existing_e.add(seq)
        n_exp += 1
    db.commit()
    print(f"[大纲] 章节 {n_new} 新增 / {n_skip} 已存在跳过；实验 {n_exp} 新增")
    return n_new


def main():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        import_tiku(db)
        import_syllabus(db)
        # 汇总（口径：实验表为全集 32；章节 hours_practice 为挂章子集 25）
        qs = db.query(TikuQuestion).count()
        ps = db.query(TikuPaper).count()
        sc = db.query(SyllabusChapter).count()
        se = db.query(SyllabusExperiment).count()
        hours = db.query(SyllabusChapter).all()
        th = sum(c.hours_theory for c in hours)
        ch_p = sum(c.hours_practice for c in hours)
        exp_h = sum(e.hours for e in db.query(SyllabusExperiment).all())
        print(f"汇总: tiku_papers={ps} / tiku_questions={qs} / "
              f"syllabus_chapters={sc} / syllabus_experiments={se}")
        print(f"学时: 理论 {th} + 实践 {exp_h} = {th + exp_h}"
              f"（挂章实践 {ch_p} + 独立实验 {exp_h - ch_p}）")
    finally:
        db.close()


if __name__ == "__main__":
    main()
