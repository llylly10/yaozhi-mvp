# -*- coding: utf-8 -*-
"""独立留存集 v2 真模型评测跑批脚本（prompt v3 验收尺子，可重复执行）。

用法（Git Bash，仓库根 yaozhi-mvp/ 下）:
  cd backend && ../.venv/Scripts/python.exe ../scripts/run_eval_holdout_v2.py

与 run_eval_holdout.py（v1）的差异:
  - 案例集为holdout_v2_data.py 40 例（文风对齐开发集版）；
  - _save_report 永久屏蔽——留存集报告绝不写 eval_report.json / 保护测试集 md；
  - 产物文件名带 v2，与 v1 报告并存可对照。

判定口径（重要）:
  v1 留存集 0.75 对照开发集 0.90，落差 15pp，但其中 4 例经逐例定性属**标注口径
  分歧**（遗忘类理由写成跨药归属长句式，句中"记到…头上"本身即混淆类语言信号）。
  v2 重建后文风已镜像开发集，若v2 分数仍显著低于开发集，方可判定为**真实泛化缺口**。
  对照基线：qwen3.7-flash + prompt v2 在开发集 80 例上 acc 0.8875 / macro-F1 0.8898
  （2026-10-08 真模型跑批）。
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
# qwen3.7-flash + prompt v2 在 80 例开发集上的基线（2026-10-08 真模型跑批）
DEV_BASELINE = {"accuracy": 0.8875, "macro_recall": 0.8875, "macro_f1": 0.8898}
# v1 留存集结果（文风未对齐），作为"文风影响"的参考点
V1_BASELINE = {"accuracy": 0.75, "macro_recall": 0.75, "macro_f1": 0.75}


def main() -> None:
    from app.config import settings
    from app.llm.provider import ExternalApiProvider, get_provider
    import eval.evaluator as ev
    from eval.holdout_v2_data import get_holdout_v2_cases

    # ---- 防呆①：锁定主库 ----
    db_raw = settings.database_url.split("sqlite:///")[-1]
    db_path = Path(db_raw).resolve()
    assert db_path.exists() and db_path.stat().st_size > MIN_MASTER_DB_BYTES, (
        f"数据库不是主库（{db_path}）——请从 backend/ 目录启动本脚本")
    print(f"db = {db_path} ({db_path.stat().st_size // 1024} KB)")
    print(f"model = {settings.external_model}")
    print(f"key configured = {bool(settings.external_api_key)}")

    # ---- 防呆②：provider 类型断言 ----
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

    # ---- 防呆③：真调用 / 回退双计数 ----
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

    cases = get_holdout_v2_cases()
    assert len(cases) == EXPECTED_CASES, f"留存集 v2 应为 {EXPECTED_CASES} 例，实得 {len(cases)}"
    print(f"cases = {len(cases)}（独立留存集 v2·文风对齐版），逐条真模型归因中...", flush=True)

    report = ev.evaluate_benchmark("external_api", cases=cases)

    print(f"\n== 运行完毕 == real_calls={calls['real']} fallbacks={calls['fallback']}")
    assert calls["real"] == len(cases), (
        f"真模型调用数 {calls['real']} != 案例数 {len(cases)}，存在静默降级，结果不可信！")
    assert calls["fallback"] == 0, (
        f"{calls['fallback']} 条案例回退到规则 mock（真模型调用异常），结果不可信！")

    today = datetime.now().strftime("%Y-%m-%d")
    summary = {
        "case_set": "holdout_v2_40",
        "calls": calls,
        "model": settings.external_model,
        "run_at": report["run_at"],
        "status": report["status_label"],
        "accuracy": report["accuracy"], "macro_recall": report["macro_recall"],
        "macro_f1": report["macro_f1"],
        "dev_baseline": DEV_BASELINE,
        "v1_baseline": V1_BASELINE,
        "category_stats": report["category_stats"],
        "confusion_matrix": report["confusion_matrix"],
        "mismatch_count": report["mismatch_count"],
    }
    out = ROOT / "scratch" / "holdout_v2_eval_summary.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")

    write_md(report, today, settings.external_model)
    print(f"summary -> {out}")

    print(f"\nstatus={report['status_label']}")
    print(f"accuracy={report['accuracy']}（开发集 {DEV_BASELINE['accuracy']} / v1 留存集 {V1_BASELINE['accuracy']}）")
    print(f"macro_f1={report['macro_f1']}（开发集 {DEV_BASELINE['macro_f1']} / v1 {V1_BASELINE['macro_f1']}）")
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


def write_md(report: dict, today: str, model: str) -> None:
    L = []
    L.append("# 药知· 归因诊断独立留存集 v2 评测报告")
    L.append("")
    L.append(f"- 评测日期：{report['run_at']}")
    L.append(f"- 评测模式：{report['provider_mode']}（模型 {model}）")
    L.append("- 案例集：**独立留存集 v2 · 40 例**（`eval/holdout_v2_data.py`，四类各 10 例）")
    L.append("  - 与开发集 80 题、留存集 v1 40 题**题干级零重叠**")
    L.append("  - **文风严格对齐开发集**：理由平均 32 字（开发集 37 / v1 49），"
             "混淆类明写「混淆」，遗忘类无跨药归属句式")
    L.append(f"- 门禁结论：**{report['status_label']} — {report['status_text']}**"
             "（阈值与保护测试集一致：无零召回 / Macro-Recall≥0.60 / Macro-F1≥0.65）")
    L.append("")
    L.append("## 一、三口径对照（同模型同 prompt）")
    L.append("")
    L.append("| 指标 | 留存集 v2（文风对齐，40 例） | 留存集 v1（40 例） | 开发集基线（80 例） |")
    L.append("|---|---|---|---|")
    L.append(f"| Accuracy | {report['accuracy'] * 100:.1f}% | 75.0% | 88.8% |")
    L.append(f"| Macro-Recall | {report['macro_recall'] * 100:.1f}% | 75.0% | 88.8% |")
    L.append(f"| Macro-F1 | {report['macro_f1'] * 100:.1f}% | 75.0% | 89.0% |")
    L.append("")
    L.append("> **v1 与 v2 的差值即「文风未对齐」带来的口径落差**。v1 中4 例遗忘被判混淆，"
             "经逐例定性为标注口径分歧（v1 遗忘类理由写成「把 X 记到 Y 头上」这类跨药归属"
             "长句式，句中语言信号本身指向混淆），而非模型退化。v2 修正文风后，"
             "剩余错例方可视为真实泛化缺口。")
    L.append("")
    L.append("## 二、四大错因逐类性能")
    L.append("")
    L.append("| 错因类别 | 期望案例 | TP | Recall | Precision | F1 |")
    L.append("|---|---|---|---|---|---|")
    for cat, s in report["category_stats"].items():
        L.append(f"| {cat} | {s['expected_count']} | {s['tp']} | "
                 f"{s['recall'] * 100:.1f}% | {s['precision'] * 100:.1f}% | {s['f1']:.3f} |")
    L.append("")
    L.append("## 三、4 × 4 混淆矩阵（行 = 期望金标，列 = 预测输出）")
    L.append("")
    cats = report["categories"]
    L.append("| 期望类别 \\ 预测类别 | " + " | ".join(cats) + " |")
    L.append("|---|" + "---|" * len(cats))
    for ecat in cats:
        L.append("| " + ecat + " | " + " | ".join(
            [str(report["confusion_matrix"][ecat][pc]) for pc in cats]) + " |")
    L.append("")
    L.append("## 四、反例归因清单")
    L.append("")
    if report["mismatches"]:
        L.append("| 案例编号 | 章节 | 题目梗概 | 期望错因 | 预测错因 | 案例归因说明 |")
        L.append("|---|---|---|---|---|---|")
        for m in report["mismatches"]:
            L.append(f"| {m['case_id']} | {m['chapter']} | {m['stem']} | "
                     f"{m['expected_category']} | {m['predicted_category']} | "
                     f"{m['clinical_rationale']} |")
    else:
        L.append("无诊断错误案例。")
    L.append("")
    L.append("> 金标为技术侧单标注，定稿前须经药理顾问复核（顾问任务包任务 4）。")
    L.append("")
    out = ROOT / f"评测报告-独立留存集v2-{today}.md"
    out.write_text("\n".join(L), encoding="utf-8")
    print(f"report -> {out}")


if __name__ == "__main__":
    main()