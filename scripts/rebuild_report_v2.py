# -*- coding: utf-8 -*-
"""从已捕获数据重建 2026-10-02 13:18:54 的 prompt v2 external 评测报告（一次性脚本）。

背景：该次运行（macro-F1 0.9023，错例 8）的报告文件先被 pytest mock 评测覆盖、
后被一次额度耗尽的污染跑批覆盖。逐类指标/混淆矩阵/门禁完整保存在
scratch/external_eval_summary_promptv2.eval0.90.json（该次运行自身写出），
8 个错例的期望/预测类别来自该次运行的控制台输出（逐行 MISS 记录），
案例元数据取自 eval/benchmark_data.py。本脚本按 evaluator._write_markdown_report
的同一渲染格式重建，不引入任何未捕获字段。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

summary = json.loads(
    (ROOT / "scratch" / "external_eval_summary_promptv2.eval0.90.json").read_text(encoding="utf-8"))

# 该次运行控制台输出的 8 条 MISS（case_id -> 预测类别）
PREDICTED = {
    "BM-YW-002": "概念混淆", "BM-YW-010": "概念混淆", "BM-YW-016": "概念混淆",
    "BM-JZ-010": "概念混淆", "BM-JZ-013": "概念混淆", "BM-JZ-017": "概念混淆",
    "BM-JZ-020": "概念混淆", "BM-ST-013": "知识遗忘",
}

from eval.benchmark_data import get_benchmark_cases  # noqa: E402
cases = {c["case_id"]: c for c in get_benchmark_cases()}
missing = set(PREDICTED) - set(cases)
assert not missing, f"错例 id 不在基准数据中: {missing}"

cats = ["知识遗忘", "概念混淆", "机制理解不足", "审题与应用失误"]
acc = summary["accuracy"]
macro_recall = summary["macro_recall"]
macro_f1 = summary["macro_f1"]
stats = summary["category_stats"]
matrix = summary["confusion_matrix"]
run_at = summary["run_at"]

assert summary["status"] == "PASSED"
assert summary["mismatch_count"] == len(PREDICTED) == 8
assert abs(sum(matrix[c][c] for c in cats) / 80 - acc) < 1e-9

L = []
L.append("# 药知 MVP · 错因诊断标准保护测试集评测报告")
L.append("")
L.append(f"- 评测日期：{run_at}")
L.append("- 评测模式：external_api")
L.append("- 保护测试集规模：80 案例（四大错因各 20 案例配额）")
L.append("- 门禁结论：**PASSED — 评测通过（符合准入试点标准）**")
L.append("")
L.append("## 一、总体指标与红线门禁")
L.append("")
L.append("| 指标项 | 实际值 | 门禁标准 | 门禁状态 |")
L.append("|---|---|---|---|")
L.append(f"| 案例总数 | 80 | $\\ge 80$ | ✅ 达标 |")
L.append(f"| 总体准确率 (Accuracy) | {acc * 100:.1f}% | 观察参考 | ✅ 正常 |")
L.append(f"| 宏平均召回率 (Macro-Recall) | {macro_recall * 100:.1f}% | $\\ge 60.0\\%$ | ✅ 通过 |")
L.append(f"| 宏平均 F1 (Macro-F1) | {macro_f1 * 100:.1f}% | $\\ge 65.0\\%$ | ✅ 通过 |")
L.append("| 关键类别零召回排查 | 全部类别召回率 > 0 | 严禁为 0 | ✅ 通过 |")
L.append("")
L.append("## 二、四大错因逐类性能")
L.append("")
L.append("| 错因类别 | 期望案例 | 预测案例 | TP | Recall (召回率) | Precision (精确率) | F1-Score |")
L.append("|---|---|---|---|---|---|---|")
for cat in cats:
    s = stats[cat]
    L.append(f"| {cat} | {s['expected_count']} | {s['predicted_count']} | {s['tp']} | "
             f"{s['recall'] * 100:.1f}% | {s['precision'] * 100:.1f}% | {s['f1']:.3f} |")
L.append("")
L.append("## 三、4 × 4 混淆矩阵（行 = 期望金标，列 = 预测输出）")
L.append("")
L.append("| 期望类别 \\ 预测类别 | " + " | ".join(cats) + " |")
L.append("|---|" + "---|" * len(cats))
for ecat in cats:
    L.append("| " + " | ".join([ecat] + [str(matrix[ecat][p]) for p in cats]) + " |")
L.append("")
L.append("## 四、反例归因样本（Top 10）")
L.append("")
L.append("| 案例编号 | 章节 | 题目梗概 | 期望错因类别 | 预测错因类别 | 专家归因说明 |")
L.append("|---|---|---|---|---|---|")
for cid, pred in PREDICTED.items():
    c = cases[cid]
    stem = c["stem"][:40] + "..." if len(c["stem"]) > 40 else c["stem"]
    L.append(f"| {cid} | {c['chapter']} | {stem} | {c['expected_category']} | {pred} | {c['clinical_rationale']} |")
L.append("")
L.append("---")
L.append("")
L.append("> 本文件由 2026-10-02 13:18:54 运行的捕获数据重建（scratch/external_eval_summary_promptv2.eval0.90.json +")
L.append("> 运行日志逐条 MISS 记录），原文件先后被 pytest mock 评测与一次额度耗尽的污染跑批覆盖。")
L.append("> 归一化声明：运行脚本断言 real_calls=80 / fallbacks=0，全部 80 例均为 qwen3.7-flash 真模型归因。")

out = ROOT / "评测报告-保护测试集-2026-10-02.md"
out.write_text("\n".join(L), encoding="utf-8")
print(f"rebuilt -> {out} ({out.stat().st_size} bytes)")
