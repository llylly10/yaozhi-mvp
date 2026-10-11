# -*- coding: utf-8 -*-
"""混淆 vs 机制 二分类边界探针（2026-11-11）。

背景：prompt v3 追加三条细则冒烟仅翻对 2/7，已回滚。规则 5（机制判据改
"能否推出因果链"）对 JZ-001/JZ-002 完全未生效，尽管规则文本几乎照这两句
理由原文写成 —— 说明模型不做逐条细则推理，而做整体语义匹配。

**核心假设**：模型的归类由「题干是否含机制名词」主导，而非「作答理由讲的是
不是因果推导」。

  JZ-001LD50 含义      题干无机制名词  → v2 判遗忘（金标机制）❌
  JZ-002  代谢器官        题干无机制名词  → v2 判遗忘（金标机制）❌
  JZ-003  肾小管分泌      题干有"分泌/转运" → v2 判混淆（金标机制）❌
  JZ-010  作用位点差异    题干有"作用位点" → v2 判混淆（金标机制）❌
  JZ-007  螺内酯机制      题干有"机制"    → v2 已判对（金标机制）✅

探针设计（A 组对照 / B 组变量）：
  A 组：原题干 + 原理由 —— 复现基线；
  B 组：**同一道题**，题干追加机制名词提示（"从作用机制角度"、"该过程涉及…"），
        理由原文不变。若B 组翻对 → 证实假设：模型只看题干不看理由。

附加探针（C 组）：仅把金标类别的特征词显式写入理由，看模型是否跟���走。

用法：cd backend && ../.venv/Scripts/python.exe ../scripts/probe_confusion_vs_mechanism.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# 6 道边界题：金标全为「机制」或「混淆」，是 v2 与 v3 的翻错集合
CASES = {
    "HO2-JZ-001": dict(expect="机制理解不足",
                       stem_hint="请从药效学的指标含义与毒性与安全范围的关系角度判断。"),
    "HO2-JZ-002": dict(expect="机制理解不足",
                       stem_hint="请从药物生物转化（代谢）机制的角度判断。"),
    "HO2-JZ-003": dict(expect="机制理解不足",
                       stem_hint="请从肾小管物质转运机制的角度判断。"),
    "HO2-JZ-010": dict(expect="机制理解不足",
                       stem_hint="请从抗凝药在凝血级联中作用位点差异的机制角度判断。"),
    "HO2-HX-001": dict(expect="概念混淆",
                       stem_hint="请从药物与代谢产物的身份区分角度判断。"),
    "HO2-HX-004": dict(expect="概念混淆",
                       stem_hint="请从药效学中激动与拮抗的作用方式角度判断。"),
}


def main() -> None:
    from app.config import settings
    from app.llm.provider import ExternalApiProvider, get_provider
    from eval.holdout_v2_data import get_holdout_v2_cases

    provider = get_provider()
    if not isinstance(provider, ExternalApiProvider):
        print("FATAL: provider 非ExternalApiProvider，中止。")
        sys.exit(2)
    print(f"model = {settings.external_model}")
    print(f"病例数 = {len(CASES)}，每组3 次（观察稳定性）")
    print("=" * 78)

    cases = {c["case_id"]: c for c in get_holdout_v2_cases()}

    def ask(cid: str, stem: str, rationale: str, domain: str) -> str:
        c = cases[cid]
        opts = "\n".join(f"{o['key']}. {o['text']}" for o in c["options"])
        try:
            out = provider.attribute_misconception(
                question_stem=stem, options_text=opts,
                selected_option=c["selected_option"], correct_answer="(见选项)",
                student_rationale=rationale, domain_name=domain)
            return out.get("category", "?")
        except Exception as e:  # noqa: BLE001
            return f"ERROR:{str(e)[:60]}"

    rows = []
    for group in ["A-原题干原理由", "B-题干加机制名词提示", "C-理由加类别特征词"]:
        print(f"\n### 组{group}")
        for cid, meta in CASES.items():
            c = cases[cid]
            if group.startswith("A"):
                stem, rat = c["stem"], c["clinical_rationale"]
            elif group.startswith("B"):
                stem, rat = c["stem"] + " " + meta["stem_hint"], c["clinical_rationale"]
            else:
                stem = c["stem"]
                # 在理由末尾追加金标类别的判别特征词（模拟"明确指向"的情形）
                key = {"机制理解不足": "这是对作用机制与因果推导过程的理解失败，不是单纯忘记结论。",
                       "概念混淆": "这是把两个具体对象的属性张冠李戴，属于概念混淆。"}[meta["expect"]]
                rat = c["clinical_rationale"] + key
            got = ask(cid, stem, rat, c["chapter"])
            ok = "✓" if got == meta["expect"] else "✗"
            print(f"  {ok} {cid} 期望={meta['expect']:<6} 实得={got}")
            rows.append({"group": group, "case_id": cid,
                         "expect": meta["expect"], "got": got})

    print("\n" + "=" * 78)
    print("汇总（各组翻对数）")
    summary = {}
    for group in ["A-原题干原理由", "B-题干加机制名词提示", "C-理由加类别特征词"]:
        ok = sum(1 for r in rows if r["group"] == group and r["got"] == r["expect"])
        summary[group] = f"{ok}/{len(CASES)}"
        print(f"  {group}: {summary[group]}")

    base = int(summary["A-原题干原理由"].split("/")[0])
    b = int(summary["B-题干加机制名词提示"].split("/")[0])
    c_ = int(summary["C-理由加类别特征词"].split("/")[0])
    print()
    if b > base:
        print(f"✅ 假设成立：题干加机制名词提示后翻对 {b-base} 例 —— "
              f"**模型主要看题干是否含机制名词，而非看作答理由**")
    else:
        print(f"⚠️ 假设不成立：B 组未优于 A 组（{b} vs {base}）—— 变量不在题干机制名词")
    if c_ > base:
        print(f"✅ 理由中显式点明类别特征词可提升 {c_-base} 例 —— "
              f"**模型能听出明确信号，但需要信号足够强**")
    else:
        print(f"⚠️ C 组未优于 A 组（{c_} vs {base}）—— 连显式信号都压不动")

    out = ROOT / "scratch" / "probe_confusion_vs_mechanism.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"rows": rows, "summary": summary},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n-> {out}")


if __name__ == "__main__":
    main()