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

# 内容资产随仓库走（backend/seed/ → 上两级为仓库根），避免硬编码盘符
MAT_DIR = Path(__file__).resolve().parents[2] / "corpus" / "course-materials"
# 批注稿清单：后续 P2/P3 批在此追加 (chapter_ref, json文件名)
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
    # P4d 批（2026-09-03，17 章 302 题）
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
    # P4e 批：CH3 单章剩余 3 题（钙拮抗药，章映射偏差已标注待裁决）
    ("CH3", "P4e-CH3钙拮抗药3题解析批注稿-20260903.json"),
    # P5 批：63 道并列题权威仲裁解析批注稿（2026-09-12，全库 786 题 100% 收官）
    ("*", "P5-并列题63题解析批注稿-20260912.json"),
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
        query = db.query(TikuQuestion).filter(
            TikuQuestion.paper_no == paper_no,
            TikuQuestion.qid == int(qid)
        )
        if chapter_ref and chapter_ref != "*":
            query = query.filter(TikuQuestion.chapter_ref == chapter_ref)
        q = query.first()
        if not q:
            print(f"  ⚠ 未找到 {chapter_ref}-{key}，跳过")
            continue
        # 兼容两种批注稿写法：{"key": {"analysis": "...", ...}} 与 {"key": "解析文本"}
        if isinstance(item, dict):
            analysis = (item.get("analysis") or "").strip()
            if item.get("cognitive_level"):
                q.cognitive_level = item["cognitive_level"]
            if item.get("difficulty"):
                q.difficulty = item["difficulty"]
            if item.get("source_ref"):
                q.source_ref = item["source_ref"]
            if item.get("chapter_ref") and q.chapter_ref != item["chapter_ref"]:
                q.chapter_ref = item["chapter_ref"]
        elif isinstance(item, str):
            analysis = item.strip()
        else:
            print(f"  ⚠ 批注稿 {chapter_ref}-{key} 值类型异常({type(item).__name__})，跳过")
            continue
        if not analysis:
            print(f"  ⚠ 批注稿 {chapter_ref}-{key} 解析为空，跳过")
            continue
        if analysis != q.analysis:
            q.analysis = analysis
        q.review_status = "published"   # published = 内容化 + AI 自审通过（演示口径）
        n += 1
    db.commit()
    return n


def restore_content(db) -> dict:
    """seed 恢复链挂接：reset-demo 后重放内容化，保证不丢。

    batches 按 chapter_ref 累加（同一章可登记多个批注稿文件，避免同 key 覆盖）。
    """
    result = {"tagged": rule_tag_all(db), "batches": {}}
    for chapter_ref, fname in BATCH_FILES:
        p = Path(MAT_DIR) / fname
        if not p.exists():
            print(f"  ⚠ 缺批注稿 {p}，跳过 {chapter_ref}")
            continue
        n = _import_batch(db, chapter_ref, p)
        result["batches"][chapter_ref] = result["batches"].get(chapter_ref, 0) + n
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
