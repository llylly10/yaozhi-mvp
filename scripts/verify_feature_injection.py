# -*- coding: utf-8 -*-
"""方案 A 验证：题干机制特征显式注入（input-side feature injection）。

探针已证实根因：模型判断「是否机制题」时读题干，不读学生理由；而把类别信号
显式写在输入里比写在 system prompt 里有效得多（C 组 4/6 > B 组 3/6）。

本脚本只验证一件事：**在题干前加一行自动提取的机制特征标签，能否翻对那 6 道边界题**。
不跑全量，判定阈值沿用 smoke 口径（T>=4/6 才值得动生产代码）。

注意：这行标签是**确定性规则提取**（不是模型判断），可解释、可回滚、无额外
模型调用成本——若验证通过再考虑接入 engine。

用法：cd backend && ../.venv/Scripts/python.exe ../scripts/verify_feature_injection.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# 题干机制特征词表（确定性规则，可解释）
MECHANISM_HINTS = {
    "机制": "机制", "原理": "机制", "通路": "机制", "途径": "机制",
    "受体": "机制", "靶点": "机制", "酶": "机制", "转化": "代谢",
    "代谢": "代谢", "生物转化": "代谢", "合成": "合成/分解",
    "分解": "合成/分解", "灭活": "作用位点", "降解": "作用位点",
    "转运": "物质转运", "分泌": "物质转运", "重吸收": "物质转运",
    "滤过": "物质转运", "再吸收": "物质转运", "位点": "作用位点",
    "作用点": "作用位点", "反馈": "反馈调节", "反馈调节": "反馈调节",
    "负反馈": "反馈调节", "信号转导": "信号转导", "第二信使": "信号转导",
    "为什么": "因果问法", "原因": "因果问法", "为什么是": "因果问法",
    "根本原因": "因果问法", "依据": "因果问法", "机制是": "因果问法",
    "反映": "指标含义", "含义": "指标含义", "说明": "指标含义",
    "指标": "指标含义", "代表": "指标含义",
}


def extract_feature(stem: str) -> str:
    """从题干确定性提取机制特征标签，返回可直接拼进prompt 的短串。"""
    hits = []
    for kw, tag in MECHANISM_HINTS.items():
        if kw in stem and tag not in hits:
            hits.append(tag)
    return "、".join(hits[:3])


CASES = {
    "HO2-JZ-001": "机制理解不足",
    "HO2-JZ-002": "机制理解不足",
    "HO2-JZ-003": "机制理解不足",
    "HO2-JZ-010": "机制理解不足",
    "HO2-HX-001": "概念混淆",
    "HO2-HX-004": "概念混淆",
}


def main() -> None:
    from app.config import settings
    from app.llm.provider import ExternalApiProvider, get_provider
    from eval.holdout_v2_data import get_holdout_v2_cases

    provider = get_provider()
    if not isinstance(provider, ExternalApiProvider):
        print("FATAL: provider非 ExternalApiProvider，中止。")
        sys.exit(2)
    print(f"model = {settings.external_model}")
    cases = {c["case_id"]: c for c in get_holdout_v2_cases()}

    # 先打印提取结果，人工核对规则是否靠谱
    print("\n=== 特征提取结果（人工核对） ===")
    for cid in CASES:
        f = extract_feature(cases[cid]["stem"])
        print(f"  {cid} 提取=[{f or '（无）'}]  金标={CASES[cid]}")

    print("\n=== D 组：题干前注入特征标签 ===")
    rows = []
    for cid, expect in CASES.items():
        c = cases[cid]
        feat = extract_feature(c["stem"])
        stem_aug = (f"【本题机制特征】{feat}\n" if feat else "") + c["stem"]
        opts = "\n".join(f"{o['key']}. {o['text']}" for o in c["options"])
        try:
            out = provider.attribute_misconception(
                question_stem=stem_aug, options_text=opts,
                selected_option=c["selected_option"], correct_answer="(见选项)",
                student_rationale=c["clinical_rationale"], domain_name=c["chapter"])
            got = out.get("category", "?")
        except Exception as e:  # noqa: BLE001
            got = f"ERROR:{str(e)[:50]}"
        ok = "✓" if got == expect else "✗"
        print(f"  {ok} {cid} 期望={expect:<6} 实得={got}")
        rows.append({"case_id": cid, "expect": expect, "got": got,
                     "feature": feat})

    ok = sum(1 for r in rows if r["got"] == r["expect"])
    print(f"\nD 组翻对 {ok}/{len(CASES)}")
    print("对照：探针 A 组（无注入）= 1/6，B 组（题干加提示）= 3/6，C 组（理由加特征词）= 4/6")
    print("结论：" + ("**注入有效，值得接入**" if ok >= 4 else "注入无效，不接生产"))

    out = ROOT / "scratch" / "verify_feature_injection.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"-> {out}")


if __name__ == "__main__":
    main()