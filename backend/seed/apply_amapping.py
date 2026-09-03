# -*- coding: utf-8 -*-
"""
A 类疑似错误映射修正——恢复链幂等重放器
=================================================================
背景：0d8267c 用 fix_a_mapping.py 一次性改库修正 4 题 A 类疑似错误单映射，
但该修正从未进入 map_tiku_chapters 词表 → 每次 reset-demo 恢复链用词表
重算 chapter_ref 时都会把这 4 题覆盖回错误值（已核实：01-154 被打回 CH3）。

本模块提供 SQLAlchemy 版幂等重放 apply_a_fixes(session)，供
seed._restore_course_assets 在 map_question 重算 + apply_bchapters 之后调用，
保证 reset-demo 后 A 类修正成果不丢失。人工判定优先级 > 词表启发。

用法（独立执行，dry-run/--apply 与 fix_a_mapping 等价视角，供复核用）:
  python apply_amapping.py           # 打印当前库值 vs 目标
  python apply_amapping.py --apply    # 写库
"""
import io
import sys

if __name__ == "__main__":
    # 仅命令行入口重包装 stdout；被 seed._restore_course_assets import 时不包装
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# (paper_no, qid) -> 目标章（人工核对结论，来源 corpus/course-materials 审校）
FIXES = {
    ("01", 30): "CH24",   # HMG-CoA 还原酶抑制剂(洛伐他汀) → 调血脂/抗动脉粥样硬化药
    ("01", 265): "CH17",  # 丙磺舒(促尿酸排泄) → 解热镇痛抗炎药与抗痛风药
    ("02", 160): "CH42",  # 羟基脲(抗代谢) → 抗恶性肿瘤药
    ("01", 154): "CH20",  # 尼莫地平(钙拮抗, 脑血管) → 抗高血压药/钙拮抗药
}


def apply_a_fixes(session) -> int:
    """幂等写库：把 4 题 chapter_ref 强制为目标修正值。返回更新数。"""
    from app.models import TikuQuestion
    n = 0
    for (p, q), target in FIXES.items():
        row = session.query(TikuQuestion).filter_by(paper_no=p, qid=q).first()
        if row is None or row.chapter_ref == target:
            continue
        row.chapter_ref = target
        n += 1
    return n


def main():
    apply = "--apply" in sys.argv
    import sqlite3
    DB = r"D:\ceshi\yaozhi-mvp\backend\yaozhi_w1.db"
    con = sqlite3.connect(DB)
    cur = con.cursor()
    print(f"模式: {'APPLY(写库)' if apply else 'DRY-RUN(预览)'}\n=== A 类修正 4 题 ===")
    for (p, q), target in FIXES.items():
        cur.execute("SELECT chapter_ref FROM tiku_questions WHERE paper_no=? AND qid=?", (p, q))
        r = cur.fetchone()
        if r is None:
            print(f"  {p}-{q:03d}: 题不存在!")
            continue
        old = r[0]
        mark = "已是目标,跳过" if old == target else "将更新"
        print(f"  {p}-{q:03d}: {old if old else '(空)'} → {target}  [{mark}]")
        if apply and old != target:
            cur.execute("UPDATE tiku_questions SET chapter_ref=? WHERE paper_no=? AND qid=?",
                        (target, p, q))
    if apply:
        con.commit()
    con.close()
    if not apply:
        print("提示: 加 --apply 写库")


if __name__ == "__main__":
    main()
