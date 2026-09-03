# -*- coding: utf-8 -*-
"""题库内容化（MVP 内容补全 2026-09-03，P1 批起）。

把 tiku_questions（786 题池）从"仅题干+答案"提升为闭环可用内容：
  - cognitive_level / difficulty / source_ref：规则初标（仅填空值，保留人工精修）
  - analysis：AI 撰写解析，批注稿 JSON（corpus/course-materials/P1-*.json）导入
  - review_status：published = 内容化 + AI 自审通过（演示口径；真实试点专家审核红线不变）

幂等：重复执行安全（已填值不覆盖；批注稿按题号 upsert）。
reset-demo 用 drop_all→create_all 重建表后，seed._restore_course_assets 会调用
restore_content(db) 重放本模块，保证内容化成果不随复位丢失。

运行: cd backend && python -m seed.contentize_tiku            # 全量规则初标 + 导入全部批注稿
      python -m seed.contentize_tiku --list-batches
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/

from app.db import SessionLocal  # noqa: E402
from app.models import TikuQuestion  # noqa: E402

MAT_DIR = r"D:\ceshi\corpus\course-materials"
# 批注稿清单：后续 P2/P3 批在此追加 (chapter_ref, json文件名)
BATCH_FILES = [
    ("CH6", "P1-CH6解析批注稿-20260903.json"),
]

COG_ANALYSIS_WORDS = re.compile(r"机制|为什么|药理基础|理由是|原因是")
CASE_WORDS = re.compile(r"患者|病例|某男|某女|女性|男性|患儿|入院")
TYPE_WORDS = re.compile(r"下列属于|不属于|不包括|用于|禁用|慎用|作用")
DIFF_WORDS = re.compile(r"最佳|首先|最|不宜|除外|错误的是|不包括")


def _rule_cognitive(typ: str, ans_section_type: str, stem: str) -> str:
    s = stem or ""
    if ans_section_type == "A2" or CASE_WORDS.search(s):
        return "分析" if re.search(r"机制|为什么|药理基础|理由|原因", s) else "应用"
    if typ == "B1":
        return "理解" if re.search(r"机制|作用特点|主要|用于|不良反应", s) else "识记"
    if re.search(r"机制|为什么|药理基础|原因是|理由", s):
        return "理解"
    if TYPE_WORDS.search(s):
        return "识记"
    return "理解"


def _rule_difficulty(stem: str, typ: str, chapter_ref: str) -> str:
    s = stem or ""
    sc = 0
    if "," in (chapter_ref or ""):
        sc += 1
    if typ == "B1":
        sc += 1
    if DIFF_WORDS.search(s):
        sc += 1
    if len(s) > 70:
        sc += 1
    return ["易", "中", "难"][min(sc, 2)]


def rule_tag_all(db) -> int:
    """全库规则初标（幂等：仅填空值，人工精修/批注稿已填值不覆盖）。"""
    n = 0
    qs = db.query(TikuQuestion).all()
    for q in qs:
        dirty = False
        if not q.cognitive_level:
            q.cognitive_level = _rule_cognitive(q.type, q.ans_section_type, q.stem)
            dirty = True
        if not q.difficulty:
            q.difficulty = _rule_difficulty(q.stem, q.type, q.chapter_ref)
            dirty = True
        if not q.source_ref:
            q.source_ref = f"药理学题库{q.paper_no}.pdf Q{q.qid}（题库原文）"
            dirty = True
        n += int(dirty)
    db.commit()
    return n


def _import_batch(db, chapter_ref: str, json_path: Path) -> int:
    """导入某章解析批注稿（按 paper_no-qid upsert，置 published）。"""
    data = json.load(open(json_path, encoding="utf-8"))
    n = 0
    for key, item in data.items():
        if key == "meta":
            continue
        paper_no, qid = key.split("-", 1)
        q = (db.query(TikuQuestion)
             .filter(TikuQuestion.paper_no == paper_no,
                     TikuQuestion.qid == int(qid),
                     TikuQuestion.chapter_ref == chapter_ref).first())
        if not q:
            print(f"  ⚠ 未找到 {chapter_ref}-{key}，跳过")
            continue
        analysis = item.get("analysis", "")
        if analysis and analysis != q.analysis:
            q.analysis = analysis
        q.review_status = "published"   # published = 内容化 + AI 自审通过（演示口径）
        n += 1
    db.commit()
    return n


def restore_content(db) -> dict:
    """seed 恢复链挂接：reset-demo 后重放内容化，保证不丢。"""
    result = {"tagged": rule_tag_all(db), "batches": {}}
    for chapter_ref, fname in BATCH_FILES:
        p = Path(MAT_DIR) / fname
        if not p.exists():
            print(f"  ⚠ 缺批注稿 {p}，跳过 {chapter_ref}")
            continue
        result["batches"][chapter_ref] = _import_batch(db, chapter_ref, p)
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list-batches", action="store_true")
    args = ap.parse_args()
    if args.list_batches:
        for ch, f in BATCH_FILES:
            p = Path(MAT_DIR) / f
            print(f"{ch}: {f} ({'存在' if p.exists() else '缺失'})")
        return
    db = SessionLocal()
    try:
        r = restore_content(db)
        print(f"规则初标(新填): {r['tagged']} 题")
        for ch, n in r["batches"].items():
            print(f"批注稿导入 {ch}: {n} 题 → published")
    finally:
        db.close()


if __name__ == "__main__":
    main()
