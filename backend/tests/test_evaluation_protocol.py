# -*- coding: utf-8 -*-
"""自动化评测协议单元测试（红线门禁与保护测试集校验）。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from eval.benchmark_data import get_benchmark_cases, verify_dataset_integrity  # noqa: E402
from eval.evaluator import evaluate_benchmark, get_latest_eval_report  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_eval_persist_dir(tmp_path, monkeypatch):
    """评测类测试一律隔离持久化副作用：mock 评测若写真实目录，会把
    backend/eval_report.json 与当日 markdown 报告覆盖掉（2026-10-02 实付教训）。
    _write_markdown_report 硬编码仓库根路径，_persist_dir 隔离挡不住，须一并打掉。"""
    from eval import evaluator

    monkeypatch.setattr(evaluator, "_persist_dir", lambda: tmp_path)
    monkeypatch.setattr(evaluator, "_write_markdown_report", lambda data: None)


def test_benchmark_dataset_quota():
    """断言保护测试集包含不少于 80 例，且四大错因类别均有不少于 20 例金标配额。"""
    counts = verify_dataset_integrity()
    assert sum(counts.values()) >= 80
    for cat in ["知识遗忘", "概念混淆", "机制理解不足", "审题与应用失误"]:
        assert counts[cat] >= 20, f"类别 {cat} 样本配额不足"


def test_evaluator_redline_gates():
    """断言评测引擎能正确执行三级红线门禁判定，且基线模型通过门禁。"""
    rep = evaluate_benchmark("mock")
    assert rep["total_cases"] >= 80
    assert rep["overall_passed"] is True
    assert rep["status_label"] == "PASSED"

    # 门禁 1: 无零召回类别
    assert rep["gates"]["gate_no_zero_recall"]["passed"] is True
    for cat, s in rep["category_stats"].items():
        assert s["recall"] > 0.0, f"类别 {cat} 召回率为 0，触犯单类死刑门禁"

    # 门禁 2: Macro-Recall >= 0.60
    assert rep["gates"]["gate_recall_threshold"]["passed"] is True
    assert rep["macro_recall"] >= 0.60

    # 门禁 3: Macro-F1 >= 0.65
    assert rep["gates"]["gate_f1_threshold"]["passed"] is True
    assert rep["macro_f1"] >= 0.65


def test_confusion_matrix_dimensions():
    """断言 4x4 混淆矩阵维度完整且行和等于期望数。"""
    rep = evaluate_benchmark("mock")
    matrix = rep["confusion_matrix"]
    assert len(matrix) == 4
    for ecat, row in matrix.items():
        assert len(row) == 4
        assert sum(row.values()) == rep["category_stats"][ecat]["expected_count"]


def test_api_eval_endpoints():
    """断言 /eval/latest 与 /eval/run API 端到端返回合法指标结构。"""
    r1 = client.get("/eval/latest")
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["total_cases"] >= 80
    assert "macro_f1" in d1
    assert "confusion_matrix" in d1

    r2 = client.post("/eval/run", json={"provider": "mock"})
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["overall_passed"] is True
    assert d2["accuracy"] > 0.70


def test_external_report_persists_across_restart(tmp_path, monkeypatch):
    """external 模式报告持久化：保存 → 清空进程内存（模拟重启）→ /eval/latest 应回读文件报告。"""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from eval import evaluator

    monkeypatch.setattr(evaluator, "_persist_dir", lambda: tmp_path)
    saved = {"run_at": "2026-09-29 12:00:00", "provider_mode": "external_api",
             "total_cases": 80, "hits": 70, "accuracy": 0.875,
             "macro_recall": 0.88, "macro_f1": 0.89, "status_label": "PASSED"}
    evaluator._save_report(saved)
    assert (tmp_path / "eval_report.json").exists()

    evaluator._LATEST_REPORT = None  # 模拟容器重启丢失进程内存
    out = evaluator.get_latest_eval_report()
    assert out["provider_mode"] == "external_api"
    assert out["run_at"] == "2026-09-29 12:00:00"
