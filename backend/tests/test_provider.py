"""ModelProvider 双 Provider 回归测试（技术架构 v0.5 · 附录 D 实现态）。

盯住四条规则：
  1. 默认 model_provider=mock → get_provider() 返回 MockProvider（确定性评测基线）
  2. external_api 配置缺失 api_key → 实例化抛 ProviderError，get_provider 降级 Mock（不崩溃）
  3. MockProvider.attribute_misconception 永远返回受控四分类之一（题库题兜底出卡）
  4. ExternalApiProvider.attribute_misconception 输出被归一化到受控目录（容错非目录标签）

真网络测试（Qwen 冒烟）默认跳过，仅在显式提供 YAOZHI_QWEN_API_KEY 且置
YAOZHI_RUN_LIVE=1 时执行——避免 CI 断网/无 key 时挂测试。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app.config import settings  # noqa: E402
from app.llm.provider import (  # noqa: E402
    ExternalApiProvider, MockProvider, ProviderError, get_provider,
)


def test_default_provider_is_mock(monkeypatch):
    monkeypatch.setattr(settings, "model_provider", "mock")
    p = get_provider()
    assert isinstance(p, MockProvider)


def test_external_api_without_key_raises(monkeypatch):
    monkeypatch.setattr(settings, "model_provider", "external_api")
    monkeypatch.setattr(settings, "qwen_api_key", "")
    monkeypatch.setattr(settings, "qwen_base_url", "http://127.0.0.1:1/v1")
    monkeypatch.setattr(settings, "qwen_model", "test-model")
    with pytest.raises(ProviderError):
        ExternalApiProvider(api_key="")


def test_get_provider_degrades_to_mock_when_no_key(monkeypatch):
    monkeypatch.setattr(settings, "model_provider", "external_api")
    monkeypatch.setattr(settings, "qwen_api_key", "")
    p = get_provider()
    # 实例化失败应降级为 Mock，而非让整个请求崩溃
    assert isinstance(p, MockProvider)


def test_mock_attribute_returns_controlled_category():
    p = MockProvider()
    for stem, want in [
        ("下列哪项不属于苯二氮卓类药物的作用？", "审题与应用失误"),
        ("普萘洛尔降压的机制是什么？", "机制理解不足"),
        ("治疗变异型心绞痛的首选药属于？", "知识遗忘"),
    ]:
        r = p.attribute_misconception(
            question_stem=stem, options_text="A.x\nB.y", selected_option="B",
            correct_answer="A", student_rationale="")
        assert r["category"] in {"审题与应用失误", "机制理解不足", "知识遗忘", "概念混淆"}
    # 无特征 → 兜底概念混淆
    r = p.attribute_misconception(
        question_stem="某药用于高血压治疗。", options_text="A.x\nB.y",
        selected_option="B", correct_answer="A", student_rationale="")
    assert r["category"] == "概念混淆"


@pytest.mark.skipif(
    not (__import__("os").environ.get("YAOZHI_QWEN_API_KEY") and __import__("os").environ.get("YAOZHI_RUN_LIVE")),
    reason="需真实 QWEN API key 且置 YAOZHI_RUN_LIVE=1 才跑真网络归因冒烟")
def test_live_qwen_attribute_normalizes_category(monkeypatch):
    """真模型归因：输出被归一化到受控四分类（网络冒烟，默认跳过）。"""
    import os
    monkeypatch.setattr(settings, "model_provider", "external_api")
    monkeypatch.setattr(settings, "qwen_api_key", os.environ["YAOZHI_QWEN_API_KEY"])
    monkeypatch.setattr(settings, "qwen_base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    p = get_provider()
    assert isinstance(p, ExternalApiProvider)
    r = p.attribute_misconception(
        question_stem="阿托品滴眼后对瞳孔和眼压的影响是？",
        options_text="A. 缩瞳、降低眼压\nB. 散瞳、升高眼压\nC. 缩瞳、升高眼压\nD. 散瞳、降低眼压",
        selected_option="A", correct_answer="B",
        student_rationale="阿托品阻断M受体使瞳孔括约肌收缩所以缩瞳，与毛果芸香碱一样降低眼压",
        domain_name="抗胆碱药")
    assert r["category"] in {"审题与应用失误", "机制理解不足", "知识遗忘", "概念混淆"}
    assert r["evidence_level"] in {"低", "中", "高"}
    assert r["rationale"]
