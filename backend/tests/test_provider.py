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
    CircuitOpenError, ExternalApiProvider, MockProvider, ProviderError,
    TimeoutError, _run_with_deadline, get_provider,
)


# ---------- ④ W2：硬超时 + 熔断保护（确定性，无网络） ----------

def _ext_provider(monkeypatch, api_key="k", threshold=2, cooldown=5.0):
    monkeypatch.setattr(settings, "qwen_api_key", api_key)
    monkeypatch.setattr(settings, "model_call_timeout", 5.0)
    monkeypatch.setattr(settings, "circuit_breaker_threshold", threshold)
    monkeypatch.setattr(settings, "circuit_breaker_cooldown", cooldown)
    p = ExternalApiProvider()
    p._hard_timeout = 0.05  # 缩短以快速触发硬超时
    return p


def test_run_with_deadline_times_out_when_slow():
    """慢调用超时 → TimeoutError；不阻塞主流程。"""
    def slow():
        import time
        time.sleep(1.0)
        return "late"
    import pytest as _pt
    with _pt.raises(TimeoutError):
        _run_with_deadline(slow, 0.05)


def test_run_with_deadline_returns_when_fast():
    def fast():
        return {"ok": 1}
    assert _run_with_deadline(fast, 1.0) == {"ok": 1}


def test_circuit_breaker_opens_after_consecutive_failures(monkeypatch):
    """连续失败达阈值 → 熔断开启（_circuit_open=True）。"""
    p = _ext_provider(monkeypatch, threshold=2)
    assert not p._circuit_open()
    p._record_failure()
    assert p._fail_count == 1 and not p._circuit_open()
    p._record_failure()  # 达阈值
    assert p._circuit_open()


def test_circuit_open_raises_without_calling_real_model(monkeypatch):
    """熔断期 _chat_json 直接抛 CircuitOpenError，绝不发起真请求。"""
    p = _ext_provider(monkeypatch, threshold=1)
    p._open_until = 1e18  # 强制开启（冷却到纪元时间外）
    monkeypatch.setattr(p, "_get_client",
                        lambda: (_ for _ in ()).throw(AssertionError("不应创建 client")))
    import pytest as _pt
    with _pt.raises(CircuitOpenError):
        p._chat_json("s", "u")


def test_get_provider_caches_external_instance(monkeypatch):
    """实例缓存：熔断态跨请求保留（同一实例）。"""
    monkeypatch.setattr(settings, "model_provider", "external_api")
    monkeypatch.setattr(settings, "qwen_api_key", "k")
    from app.llm import provider as prov_mod
    prov_mod._cached_external = None
    a = get_provider()
    b = get_provider()
    assert a is b
    # 切回 mock → 缓存清空
    monkeypatch.setattr(settings, "model_provider", "mock")
    m = get_provider()
    assert isinstance(m, MockProvider)
    assert prov_mod._cached_external is None
    prov_mod._cached_external = None


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
    from app.llm import provider as prov_mod
    prov_mod._cached_external = None
    monkeypatch.setattr(settings, "model_provider", "external_api")
    monkeypatch.setattr(settings, "external_api_key", "")
    monkeypatch.setattr(settings, "qwen_api_key", "")
    monkeypatch.delenv("YAOZHI_EXTERNAL_API_KEY", raising=False)
    monkeypatch.delenv("YAOZHI_QWEN_API_KEY", raising=False)
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
