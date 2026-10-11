# -*- coding: utf-8 -*-
"""prompt v3 冒烟：小样本验证三条新规则是否打在点上（2026-10-11）。

不跑全量 40 例（省额度），只跑：
  - T 组：v2 实测的 7 个错例（HO2-*）——期望 v3 能翻对其中多数；
  - C 组：v2 已正确的 3 例对照（覆盖四类，防止新规则误伤已对案例）。

判定：
  - T 组翻对 >= 4/7 且 C 组保持 >= 2/3 → 值得跑全量 v2 验证；
  - 否则回滚（v2 基线备份 scratch/scratch_provider_v2_backup.py）。

用法：cd backend && ../.venv/Scripts/python.exe ../scripts/smoke_prompt_v3.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# v2 实测错例 7 个（期望 v3 翻对）
TARGETS = [
    ("HO2-JZ-001", "机制理解不足"),# LD50 含义 → v2 判遗忘
    ("HO2-JZ-002", "机制理解不足"),  # 代谢器官 → v2 判遗忘
    ("HO2-JZ-003", "机制理解不足"),  # 肾小管分泌 → v2 判混淆
    ("HO2-JZ-010", "机制理解不足"),  # 华法林vs肝素 → v2 判混淆
    ("HO2-HX-001", "概念混淆"),      # 普鲁卡因过敏原 → v2 判遗忘
    ("HO2-HX-004", "概念混淆"),      # 激动vs拮抗 → v2 判机制
    ("HO2-ST-009", "审题与应用失误"),  # 金标存疑，不指望翻对
]

# v2 已正确的对照（防误伤）
CONTROLS = ["HO2-YW-001", "HO2-HX-005", "HO2-ST-002"]


def main() -> None:
    from app.config import settings
    from app.llm.provider import ExternalApiProvider, get_provider
    from eval.holdout_v2_data import get_holdout_v2_cases

    provider = get_provider()
    if not isinstance(provider, ExternalApiProvider):
        print("FATAL: provider 非ExternalApiProvider，中止。")
        sys.exit(2)
    print(f"model = {settings.external_model}")

    cases = {c["case_id"]: c for c in get_holdout_v2_cases()}

    # 直接走 provider 单条路径，保证与评测口径一致
    results = []
    for cid, expect in TARGETS + [(c, "预期待定") for c in CONTROLS]:
        c = cases[cid]
        opts_text = "\n".join(f"{o['key']}. {o['text']}" for o in c["options"])
        try:
            out = provider.attribute_misconception(
                question_stem=c["stem"], options_text=opts_text,
                selected_option=c["selected_option"], correct_answer="(见标注)",
                student_rationale=c["clinical_rationale"], domain_name=c["chapter"])
            got = out.get("category", "?")
            ok = "✓" if got == expect else ("—" if expect == "预期待定" else "✗")
            print(f"  {ok} {cid} 期望={expect} 实得={got}")
            results.append({"case_id": cid, "expect": expect, "got": got,
                            "rationale": out.get("rationale", "")[:60]})
        except Exception as e:  # noqa: BLE001
            print(f"  ! {cid} 调用失败: {str(e)[:120]}")
            results.append({"case_id": cid, "expect": expect, "got": "ERROR",
                            "rationale": str(e)[:60]})

    fixed = sum(1 for r in results[:len(TARGETS)] if r["got"] == r["expect"])
    ctrl_kept = sum(1 for r in results[len(TARGETS):] if r["expect"] == "预期待定" and r["got"] != "ERROR")
    print(f"\nT组翻对 {fixed}/{len(TARGETS)}；C 组可判 {ctrl_kept}/{len(CONTROLS)}")
    print("建议：" + ("值得跑全量 v2" if fixed >= 4 and ctrl_kept >= 2 else "回滚"))

    out = ROOT / "scratch" / "prompt_v3_smoke.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"-> {out}")


if __name__ == "__main__":
    main()