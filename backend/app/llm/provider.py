"""统一 ModelProvider（ADR-08）。W1 仅 Mock：确定性输出，保证单题闭环可测。

W2 接 external_api / vllm：实现相同接口，输出经 JsonSchemaValidator 校验。
模型任务边界（v1.1 §5.1）：rerank 在候选集内排序；followup_judge 仅三分类；
模型不生成追问、不错因目录外创造标签、不宣布掌握。
"""
import hashlib
import json

from ..models import ModelRun
from ..db import SessionLocal


class MockProvider:
    name = "mock"
    model = "deterministic-mock-v0"

    def rerank(self, candidates: list[dict]) -> list[dict]:
        """candidates: [{"misconception_id", "rule_score", ...}] → 加 rerank_score 排序。
        Mock 策略：完全跟随 rule_score（确定性），供 W1 闭环与评测回放。"""
        out = sorted(candidates, key=lambda c: (-float(c["rule_score"]), c["misconception_id"]))
        for i, c in enumerate(out):
            c["rerank_score"] = round(float(c["rule_score"]), 3)
            c["final_rank"] = i + 1
        return out

    def judge_open_answer(self, answer: str, open_judge: dict) -> dict:
        """开放型追问判定：关键词精确匹配（真实模型接入后升级为三分类）。"""
        kws = open_judge.get("accept_keywords", [])
        hit = [k for k in kws if k in answer]
        return {"accepted": len(hit) >= 1, "hits": hit, "supports": open_judge.get("supports")}

    def log_run(self, task_type: str, payload: dict, latency_ms: int, db=None):
        close = False
        if db is None:
            db = SessionLocal()
            close = True
        try:
            db.add(ModelRun(
                task_type=task_type, provider=self.name, model=self.model,
                input_hash=hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16],
                output=payload, latency_ms=latency_ms))
            db.commit()
        finally:
            if close:
                db.close()


def get_provider():
    from ..config import settings
    return MockProvider()  # W2: settings.model_provider == "external_api" → ExternalApiProvider()
