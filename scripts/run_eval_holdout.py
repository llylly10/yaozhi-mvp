# -*- coding: utf-8 -*-
"""独立留存集真模型评测跑批脚本（维护用，可重复执行）。

背景: 归因 prompt v2 在 80 案例开发集上迭代三轮（macro-F1 0.9023），数字有乐观
偏差。本脚本在 40 例独立留存集（eval/holdout_data.py，与开发集零题目重叠、
从未参与调优）上复测当前默认模型 + prompt，检验真实泛化水平。

用法（Git Bash，仓库根 yaozhi-mvp/ 下）:
  cd backend && ../.venv/Scripts/python.exe ../scripts/run_eval_holdout.py

与 run_eval_external.py 的差异:
  - 案例集为独立留存集 40 例（evaluate_benchmark(cases=...)）;
  - _save_report 永久屏蔽——留存集报告绝不写 eval_report.json / 保护测试集 md
    （/eval/latest 只认保护测试集基线）;
  - 产物: yaozhi-mvp 根 评测报告-独立留存集-<date>.md + scratch/holdout_eval_summary.json。
防呆与 run_eval_external.py 相同: 主库锁定 / provider 类型断言 / 预检探针 /
真调用与回退双计数（real==40 且 fallback==0 才写报告）。
"""
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

MIN_MASTER_DB_BYTES = 1_000_000
EXPECTED_CASES = 40
# prompt v2 在 80 例开发集上的 qwen3.7-flash 基线（同模型同 prompt，供对照）
DEV_BASELINE = {"accuracy": 0.90, "macro_recall": 0.90, "macro_f1": 0.9023}


def main() -> None:
    from app.config import settings
    from app.llm.provider import ExternalApiProvider, get_provider
    import eval.evaluator as ev
    from eval.holdout_data import get_holdout_cases

    # ---- 防呆 ②：锁定主库 ----
    db_raw = settings.database_url.split("sqlite:///")[-1]
    db_path = Path(db_raw).resolve()
    assert db_path.exists() and db_path.stat().st_size > MIN_MASTER_DB_BYTES, (
        f"数据库不是主库（{db_path}）——请从 backend/ 目录启动本脚本")
    print(f"db = {db_path} ({db_path.stat().st_size // 1024} KB)")

    print(f"model_provider = {settings.model_provider}")
    print(f"model = {settings.external_model}")
    print(f"key configured = {bool(settings.external_api_key)}")

    # ---- 防呆 ①：provider 类型断言 ----
    provider = get_provider()
    print(f"provider = {type(provider).__name__}")
    if not isinstance(provider, ExternalApiProvider):
        print("FATAL: provider 不是 ExternalApiProvider（静默降级 Mock），中止。")
        sys.exit(2)

    # ---- 预检探针：额度耗尽/欠费时快速失败 ----
    try:
        probe = provider.attribute_misconception(
            question_stem="预检题：下列属于质子泵抑制剂的是：",
            options_text="A. 奥美拉唑\nB. 雷尼替丁",
            selected_option="B", correct_answer="A",
            student_rationale="分类记混了", domain_name="预检")
        print(f"预检 OK: {probe['category']}")
    except Exception as e:  # noqa: BLE001
        print(f"FATAL: 预检真模型调用失败，中止（不进入 40 例跑批）：{str(e)[:300]}")
        sys.exit(3)

    # ---- 防呆 ③：真调用 / 回退 双计数 ----
    calls = {"real": 0, "fallback": 0}
    orig_attr = ExternalApiProvider.attribute_misconception

    def counting_attr(self, **kw):
        calls["real"] += 1
        return orig_attr(self, **kw)

    ExternalApiProvider.attribute_misconception = counting_attr

    orig_mock = ev._predict_rule_mock

    def counting_mock(*a, **k):
        calls["fallback"] += 1
        return orig_mock(*a, **k)

    ev._predict_rule_mock = counting_mock

    # ---- 留存集报告绝不触碰 eval_report.json / 保护测试集 md ----
    ev._save_report = lambda data: None

    cases = get_holdout_cases()
    assert len(cases) == EXPECTED_CASES, f"留存集应为 {EXPECTED_CASES} 例，实得 {len(cases)}"
    print(f"cases = {len(cases)}（独立留存集），开始逐条真模型归因（单条最长 90s）...",
          flush=True)

    report = ev.evaluate_benchmark("external_api", cases=cases)

    print(f"\n== 运行完毕 == real_calls={calls['real']} fallbacks={calls['fallback']}")
    assert calls["real"] == len(cases), (
        f"真模型调用数 {calls['real']} != 案例数 {len(cases)}，存在静默降级，结果不可信！")
    assert calls["fallback"] == 0, (
        f"{calls['fallback']} 条案例回退到规则 mock（真模型调用异常），结果不可信！")

    # ---- 自有报告落盘（不写 eval_report.json）----
    today = datetime.now().strftime("%Y-%m-%d")
    summary = {
        "case_set": "holdout_40",
        "calls": calls,
        "model": settings.external_model,
        "run_at": report["run_at"],
        "status": report["status_label"],
        "accuracy": report["accuracy"], "macro_recall": report["macro_recall"],
        "macro_f1": report["macro_f1"],
        "category_stats": report["category_stats"],
        "confusion_matrix": report["confusion_matrix"],
        "mismatch_count": report["mismatch_count"],
    }
    out = ROOT / "scratch" / "holdout_eval_summary.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")

    write_holdout_md(report, today, settings.external_model)
    print(f"summary -> {out}")

    print(f"mode={report['provider_mode']}  run_at={report['run_at']}  status={report['status_label']}")
    print(f"accuracy={report['accuracy']}（开发集同模型同prompt基线 {DEV_BASELINE['accuracy']}）")
    print(f"macro_recall={report['macro_recall']}（基线 {DEV_BASELINE['macro_recall']}）")
    print(f"macro_f1={report['macro_f1']}（基线 {DEV_BASELINE['macro_f1']}）")
    for cat, s in report["category_stats"].items():
        print(f"  {cat}: recall={s['recall']:.2f} precision={s['precision']:.2f} f1={s['f1']:.3f} "
              f"(tp={s['tp']}/{s['expected_count']})")
    print("confusion_matrix (行=期望, 列=预测):")
    for ecat, row in report["confusion_matrix"].items():
        print(f"  {ecat}: {row}")
    print(f"mismatch_count={report['mismatch_count']}")
    for m in report["mismatches"][:15]:
        print(f"  MISS {m['case_id']} [{m['chapter']}] 期望={m['expected_category']} "
              f"预测={m['predicted_category']} | {m['clinical_rationale'][:44]}")


def write_holdout_md(report: dict, today: str, model: str) -> None:
    lines = []
    lines.append("# 药知 MVP · 归因诊断独立留存集评测报告")
    lines.append("")
    lines.append(f"- 评测日期：{report['run_at']}")
    lines.append(f"- 评测模式：{report['provider_mode']}（模型 {model}）")
    lines.append("- 案例集：**独立留存集 40 例**（eval/holdout_data.py，四大错因各 10 例，"
                 "与 80 例开发集零题目重叠，构建后从未参与任何 prompt 调优）")
    lines.append(f"- 门禁结论：**{report['status_label']} — {report['status_text']}**"
                 "（门禁阈值与保护测试集一致：无零召回 / Macro-Recall≥0.60 / Macro-F1≥0.65）")
    lines.append("")
    lines.append("## 一、留存集成绩 vs 开发集基线（同模型同 prompt）")
    lines.append("")
    lines.append("| 指标 | 独立留存集（40 例） | 开发集基线（80 例，prompt v2 迭代后） |")
    lines.append("|---|---|---|")
    lines.append(f"| Accuracy | {report['accuracy'] * 100:.1f}% | 90.0% |")
    lines.append(f"| Macro-Recall | {report['macro_recall'] * 100:.1f}% | 90.0% |")
    lines.append(f"| Macro-F1 | {report['macro_f1'] * 100:.1f}% | 90.2% |")
    lines.append("")
    lines.append("> 说明：开发集基线在同一案例集上迭代三轮得出，存在乐观偏差；"
                 "本表差值即调优过拟合幅度的一阶估计。留存集案例为技术侧单标注，"
                 "金标定稿宜经药理顾问复核。")
    lines.append("")
    lines.append("## 二、四大错因逐类性能")
    lines.append("")
    lines.append("| 错因类别 | 期望案例 | TP | Recall | Precision | F1 |")
    lines.append("|---|---|---|---|---|---|")
    for cat, s in report["category_stats"].items():
        lines.append(f"| {cat} | {s['expected_count']} | {s['tp']} | "
                     f"{s['recall'] * 100:.1f}% | {s['precision'] * 100:.1f}% | {s['f1']:.3f} |")
    lines.append("")
    lines.append("## 三、4 × 4 混淆矩阵（行 = 期望金标，列 = 预测输出）")
    lines.append("")
    cats = report["categories"]
    lines.append("| 期望类别 \\ 预测类别 | " + " | ".join(cats) + " |")
    lines.append("|---|" + "---|" * len(cats))
    for ecat in cats:
        lines.append("| " + " | ".join([ecat] + [str(report["confusion_matrix"][ecat][pc])
                                                 for pc in cats]) + " |")
    lines.append("")
    lines.append("## 四、反例归因清单")
    lines.append("")
    if report["mismatches"]:
        lines.append("| 案例编号 | 章节 | 题目梗概 | 期望错因类别 | 预测错因类别 | 案例归因说明 |")
        lines.append("|---|---|---|---|---|---|")
        for m in report["mismatches"]:
            lines.append(f"| {m['case_id']} | {m['chapter']} | {m['stem']} | "
                         f"{m['expected_category']} | {m['predicted_category']} | "
                         f"{m['clinical_rationale']} |")
    else:
        lines.append("无诊断错误案例。")
    lines.append("")
    out = ROOT / f"评测报告-独立留存集-{today}.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"report -> {out}")


if __name__ == "__main__":
    main()
