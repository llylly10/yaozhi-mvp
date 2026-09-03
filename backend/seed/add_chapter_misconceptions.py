# -*- coding: utf-8 -*-
"""章级通用错因目录（四分类 × 35 章），2026-09-03。

背景
----
题库 786 题中 723 道已内容化并物化为 T 题，但这 723 题**没有任何错因标注**
（misconceptions 原只有种子域 M 受体药的 10 条）。导致 router.submit_attempt
对题库题走「只给解析、不进诊断」分支——错因诊断、靶向训练、迁移复测在这 723 题上
全部不生效，期末练题场景的核心闭环不成立。

本脚本为每个章节域建立**一级四分类通用错因**，让题库题答错也能出低证据错因卡
（证据等级=低，可追问细化），从而闭合 练→诊断→训练→复测 链路。

内容纪律
--------
条目为**教学法通用模板**（按章名填充），**不捏造具体药理事实**（不写"某药是某类"、
不写剂量/数值）。具体错点留给二级条目（待药理顾问补充，届时证据等级可由低升中/高）。
这与作战方案「通用四分类 × 章节常见错点两级结构；无 distractor_signals 时给
一级分类 + 低证据等级」一致。

用法
----
  python -m seed.add_chapter_misconceptions          # dry-run
  python -m seed.add_chapter_misconceptions --apply   # 写库
seed 恢复链自动调用 apply_chapter_misconceptions(db)（幂等）。
"""
import io
import json
import re
import sys
import uuid
from pathlib import Path

if __name__ == "__main__":
    # 仅命令行入口重包装 stdout；被 seed import 时不包装，避免与 pytest capture 冲突
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# backend/ 入 path：本模块被 `python -m seed.xxx` 或 seed 恢复链 import 时，
# 一律用绝对导入 app.*（相对导入 ..app 会在 -m 方式下越出顶层包）
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# (序号, 四分类, 干预路由 remediation_type, 名称模板, 规则信号 indicators)
TEMPLATES = [
    ("01", "知识遗忘", "记忆卡",
     "{ch}核心知识点记忆缺失（药物分类归属、作用特点、首选药等未记牢）",
     ["属于", "是", "首选", "主要", "分类", "特点", "代表药", "包括"]),
    ("02", "概念混淆", "混淆对变式",
     "{ch}同类药物或相近概念的效应／归属记忆反转（方向记反、张冠李戴）",
     ["拮抗", "激动", "相反", "鉴别", "区别", "不同于", "对比", "两者"]),
    ("03", "机制理解不足", "断环重讲",
     "{ch}作用机制的因果链推导断裂（受体／酶／离子通道／信号通路环节未打通）",
     ["机制", "原理", "为什么", "由于", "通过", "阻断", "抑制", "激动", "导致"]),
    ("04", "审题与应用失误", "情境拆解",
     "{ch}未识别题干反向提问（除外／错误／不宜），或特殊人群与禁忌情境下选药失误",
     ["不属于", "除外", "错误的是", "不是", "不宜", "禁用", "慎用", "禁忌", "避免"]),
]

# 归因优先级：审题与应用失误 > 机制理解不足 > 知识遗忘 > 概念混淆（兜底）
# （反向提问识别失误会直接导致选错，优先判；其次看是否考机制；再次看是否为识记题）
ATTRIBUTION_ORDER = ["04", "03", "01", "02"]

CH_RE = re.compile(r"^CH(\d+)$")


def _chapter_label(domain_name: str, chapter_ref: str) -> str:
    """domain.name 形如『章节 7 作用于肾上腺素受体的药物』→ 取章标题部分。"""
    name = (domain_name or "").strip()
    m = re.match(r"^章节\s*\d+\s*(.*)$", name)
    label = (m.group(1) if m else name).strip()
    return label or (chapter_ref or "")


def _build_rows(domains):
    """domains: [(domain_id, domain_name, chapter_ref)] → [(code, category, name, ...)]"""
    rows = []
    for dom_id, dom_name, chapter_ref in domains:
        m = CH_RE.match((chapter_ref or "").strip())
        ch_no = m.group(1) if m else re.sub(r"\D", "", dom_name or "")[:2] or "0"
        label = _chapter_label(dom_name, chapter_ref)
        for seq, category, reme, name_tpl, inds in TEMPLATES:
            rows.append({
                "code": f"MIS-CH{ch_no}-{seq}",
                "category": category,
                "name": name_tpl.format(ch=label),
                "domain_id": dom_id,
                "indicators": inds,
                "remediation_type": reme,
            })
    return rows


def apply_chapter_misconceptions(db, skip_codes: set | None = None) -> int:
    """SQLAlchemy 版写库（幂等，按 code 查重跳过）。返回新增条数。

    供 seed 恢复链调用。skip_codes 用于跳过已有精细错因的域（种子域）。
    """
    from app.models import DiagnosticDomain, Misconception

    skip_codes = skip_codes or set()
    doms = [(d.id, d.name, d.chapter_ref) for d in db.query(DiagnosticDomain).all()]
    # 已有精细错因的域不铺通用模板（避免与人工条目并列干扰归因）
    fine = db.query(Misconception.domain_id).filter(
        Misconception.code.like("MIS-ANS-%")).all()
    fine_domains = {r[0] for r in fine}
    doms = [d for d in doms if d[0] not in fine_domains]

    n = 0
    for row in _build_rows(doms):
        if row["code"] in skip_codes:
            continue
        if db.query(Misconception).filter_by(code=row["code"]).first():
            continue
        db.add(Misconception(
            id=uuid.uuid4().hex, code=row["code"], category=row["category"],
            name=row["name"], domain_id=row["domain_id"],
            indicators=json.dumps(row["indicators"], ensure_ascii=False),
            counter_indicators="[]", remediation_type=row["remediation_type"],
            remediation_payload="{}", status="published"))
        n += 1
    if n:
        db.commit()
    return n


def main():
    apply = "--apply" in sys.argv
    print("模式:", "APPLY(写库)" if apply else "DRY-RUN(预览)")
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        if apply:
            n = apply_chapter_misconceptions(db)
            print(f"新增错因条目: {n}")
        else:
            from app.models import DiagnosticDomain, Misconception
            doms = [(d.id, d.name, d.chapter_ref) for d in db.query(DiagnosticDomain).all()]
            fine = {r[0] for r in db.query(Misconception.domain_id).filter(
                Misconception.code.like("MIS-ANS-%")).all()}
            doms = [d for d in doms if d[0] not in fine]
            rows = _build_rows(doms)
            print(f"将生成 {len(rows)} 条（{len(doms)} 章 × 4 类；跳过种子域 {len(fine)} 个）")
            for r in rows[:8]:
                print(f"  {r['code']:<14}{r['category']:<8}{r['remediation_type']:<6}{r['name'][:44]}")
            print("  ...")
            print("提示: 加 --apply 写库")
    finally:
        db.close()


if __name__ == "__main__":
    main()
