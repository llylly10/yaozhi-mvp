# -*- coding: utf-8 -*-
"""外部真模型评测跑批脚本（维护用，可重复执行）。

用法（Git Bash，仓库根 yaozhi-mvp/ 下）:
  cd backend && ../.venv/Scripts/python.exe ../scripts/run_eval_external.py

前置: YAOZHI_EXTERNAL_API_KEY 已在环境变量中（阿里云百炼 DashScope Key）。
行为: 直接调 eval.evaluator.evaluate_benchmark("external_api")，80 案例逐条真模型归因
      （模型取 settings.external_model，非流式 + thinking，单条硬超时 90s，连续 3 次失败熔断降级）。
防呆: ① provider 必须实例化为 ExternalApiProvider（get_provider 静默降级 Mock 则中止）;
      ② 数据库必须是 backend/yaozhi_w1.db 主库（database_url 相对路径按 cwd 解析，
         仓库根 yaozhi_w1.db 是 0 字节空壳，cwd 不对会写错库/报告落错目录）;
      ③ 逐条计数真模型调用与静默回退（evaluator 对单条异常回退 _predict_rule_mock 不报错），
         结束后断言 real == 案例数 且 fallback == 0，否则结果不可信直接报错。
产物: 评测报告-保护测试集-<date>.md（yaozhi-mvp 根）+ backend/eval_report.json
      + model_runs 审计表 80 行 + scratch/external_eval_summary.json。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

MIN_MASTER_DB_BYTES = 1_000_000  # 主库数十 MB；空壳/新建库远小于此


def main() -> None:
    from app.config import settings
    from app.llm.provider import ExternalApiProvider, get_provider
    import eval.evaluator as ev

    # ---- 防呆 ②：锁定主库，防相对路径解析到仓库根空壳 ----
    db_raw = settings.database_url.split("sqlite:///")[-1]
    db_path = Path(db_raw).resolve()
    assert db_path.exists() and db_path.stat().st_size > MIN_MASTER_DB_BYTES, (
        f"数据库不是主库（{db_path}，{db_path.stat().st_size if db_path.exists() else 0} 字节）——"
        "请从 backend/ 目录启动本脚本")
    print(f"db = {db_path} ({db_path.stat().st_size // 1024} KB)")

    print(f"model_provider = {settings.model_provider}")
    print(f"base_url = {settings.external_base_url}")
    print(f"model = {settings.external_model}")
    print(f"key configured = {bool(settings.external_api_key)}")

    # ---- 防呆 ①：provider 类型断言 ----
    provider = get_provider()
    print(f"provider = {type(provider).__name__}")
    if not isinstance(provider, ExternalApiProvider):
        print("FATAL: provider 不是 ExternalApiProvider（key 缺失或实例化失败已静默降级 Mock），中止。")
        sys.exit(2)

    # ---- 预检：1 发真调用探明 API 可用性（额度耗尽/欠费时快速失败，不烧整轮）----
    try:
        probe = provider.attribute_misconception(
            question_stem="预检题：下列属于质子泵抑制剂的是：",
            options_text="A. 奥美拉唑\nB. 雷尼替丁",
            selected_option="B", correct_answer="A",
            student_rationale="分类记混了", domain_name="预检")
        print(f"预检 OK: {probe['category']}")
    except Exception as e:  # noqa: BLE001
        print(f"FATAL: 预检真模型调用失败，中止（不进入 80 例跑批）：{str(e)[:300]}")
        sys.exit(3)

    # ---- 防呆 ③：真模型调用 / 静默回退 双计数 ----
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

    # ---- 报告落盘缓冲：回退污染的报告绝不能写盘，断言通过后再落 ----
    # （2026-10-02 实付教训：evaluate_benchmark 内部先 _save_report 后返回，
    #   熔断降级跑出的假 external 报告会先落盘污染 eval_report.json 与当日 md）
    real_save = ev._save_report
    ev._save_report = lambda data: None

    from eval.benchmark_data import get_benchmark_cases
    n_cases = len(get_benchmark_cases())
    print(f"cases = {n_cases}，开始逐条真模型归因（单条最长 90s，全程预计 3-15 分钟）...", flush=True)

    report = ev.evaluate_benchmark("external_api")

    print(f"\n== 运行完毕 == real_calls={calls['real']} fallbacks={calls['fallback']}")
    assert calls["real"] == n_cases, (
        f"真模型调用数 {calls['real']} != 案例数 {n_cases}，存在静默降级，结果不可信！")
    assert calls["fallback"] == 0, (
        f"{calls['fallback']} 条案例回退到规则 mock（真模型调用异常），结果不可信！")

    real_save(report)  # 断言通过，安全落盘

    print(f"mode={report['provider_mode']}  run_at={report['run_at']}  status={report['status_label']}")
    print(f"accuracy={report['accuracy']}  macro_recall={report['macro_recall']}  macro_f1={report['macro_f1']}")
    for cat, s in report["category_stats"].items():
        print(f"  {cat}: recall={s['recall']:.2f} precision={s['precision']:.2f} f1={s['f1']:.3f} "
              f"(tp={s['tp']}/{s['expected_count']})")
    print("confusion_matrix (行=期望, 列=预测):")
    for ecat, row in report["confusion_matrix"].items():
        print(f"  {ecat}: {row}")
    print(f"mismatch_count={report['mismatch_count']}")
    for m in report["mismatches"][:10]:
        print(f"  MISS {m['case_id']} [{m['chapter']}] 期望={m['expected_category']} "
              f"预测={m['predicted_category']} | {m['clinical_rationale'][:40]}")

    out = ROOT / "scratch" / "external_eval_summary.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        "calls": calls, "status": report["status_label"], "run_at": report["run_at"],
        "accuracy": report["accuracy"], "macro_recall": report["macro_recall"],
        "macro_f1": report["macro_f1"], "category_stats": report["category_stats"],
        "confusion_matrix": report["confusion_matrix"], "mismatch_count": report["mismatch_count"],
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"summary -> {out}")


if __name__ == "__main__":
    main()
