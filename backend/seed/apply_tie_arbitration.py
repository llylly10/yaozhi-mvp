# -*- coding: utf-8 -*-
"""并列题人工仲裁映射修正——恢复链幂等重放器
=================================================================
背景：63 道跨章节并列题此前以逗号并列存储（如 CH12,CH27），
导致处于 draft 状态未能进入业务 Question 池。
本模块提供 63 道题权威裁决主章的映射重放器 apply_tie_fixes(session)，
供 seed._restore_course_assets 在 apply_a_fixes 之后调用，
保证 reset-demo 后 63 题始终归位于单一主章，供 contentize_tiku 与 seed_tiku_bridge 物化。
"""
import io
import sys
from typing import Dict, Tuple

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# (paper_no, qid) -> 裁决目标主章（依据人卫第9版核心考查机制）
TIE_FIXES: Dict[Tuple[str, int], str] = {
    ("01", 198): "CH12",
    ("02", 155): "CH16",
    ("02", 216): "CH17",
    ("03", 49): "CH17",
    ("03", 141): "CH17",
    ("03", 28): "CH15",
    ("01", 100): "CH27",
    ("01", 220): "CH17",
    ("01", 195): "CH17",
    ("02", 42): "CH19",
    ("01", 88): "CH19",
    ("01", 199): "CH36",
    ("01", 186): "CH2",
    ("03", 146): "CH20",
    ("01", 59): "CH2",
    ("01", 176): "CH20",
    ("01", 131): "CH21",
    ("02", 208): "CH21",
    ("02", 172): "CH20",
    ("02", 220): "CH20",
    ("02", 141): "CH20",
    ("01", 245): "CH21",
    ("02", 290): "CH21",
    ("03", 92): "CH21",
    ("01", 242): "CH21",
    ("01", 49): "CH22",
    ("01", 162): "CH22",
    ("01", 296): "CH22",
    ("02", 205): "CH22",
    ("02", 264): "CH22",
    ("01", 181): "CH25",
    ("01", 228): "CH31",
    ("01", 161): "CH26",
    ("03", 97): "CH34",
    ("02", 280): "CH15",
    ("03", 123): "CH15",
    ("03", 105): "CH21",
    ("01", 68): "CH6",
    ("03", 35): "CH16",
    ("02", 25): "CH35",
    ("02", 6): "CH38",
    ("03", 22): "CH33",
    ("03", 109): "CH36",
    ("01", 3): "CH36",
    ("01", 145): "CH38",
    ("02", 142): "CH37",
    ("01", 225): "CH6",
    ("01", 80): "CH7",
    ("01", 122): "CH7",
    ("02", 187): "CH7",
    ("02", 204): "CH7",
    ("03", 33): "CH7",
    ("03", 96): "CH7",
    ("01", 102): "CH6",
    ("02", 288): "CH16",
    ("01", 113): "CH7",
    ("01", 178): "CH20",
    ("01", 172): "CH20",
    ("02", 124): "CH21",
    ("02", 266): "CH21",
    ("01", 185): "CH25",
    ("02", 257): "CH7",
    ("01", 123): "CH25",
}


def apply_tie_fixes(session) -> int:
    """幂等写库：把 63 题并列 chapter_ref 强制更新为仲裁目标主章。返回更新数。"""
    from app.models import TikuQuestion
    n = 0
    for (p, q), target in TIE_FIXES.items():
        row = session.query(TikuQuestion).filter_by(paper_no=p, qid=q).first()
        if row is None or row.chapter_ref == target:
            continue
        row.chapter_ref = target
        n += 1
    return n


def main():
    import sqlite3
    apply = "--apply" in sys.argv
    db_path = r"D:\ceshi\yaozhi-mvp\backend\yaozhi_w1.db"
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    print(f"模式: {'APPLY(写库)' if apply else 'DRY-RUN(预览)'}\n=== 并列题仲裁 63 题 ===")
    updated = 0
    for (p, q), target in TIE_FIXES.items():
        cur.execute("SELECT chapter_ref FROM tiku_questions WHERE paper_no=? AND qid=?", (p, q))
        row = cur.fetchone()
        if not row:
            print(f"  {p}-{q:03d}: 题库中未找到")
            continue
        curr = row[0]
        if curr != target:
            updated += 1
            if apply:
                cur.execute("UPDATE tiku_questions SET chapter_ref=? WHERE paper_no=? AND qid=?", (target, p, q))
            print(f"  {p}-{q:03d}: {curr} -> {target}")
        else:
            print(f"  {p}-{q:03d}: 已是目标 {target}")
    if apply:
        conn.commit()
        print(f"成功更新 {updated} 题并列映射为单一主章！")
    else:
        print(f"DRY-RUN: 共有 {updated} 题待更新")
    conn.close()


if __name__ == "__main__":
    main()
