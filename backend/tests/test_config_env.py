# -*- coding: utf-8 -*-
"""config .env 配置通道单测（2026-09-29）：本地 backend/.env 支持 + 环境变量优先级。"""
import os
import sys

import pytest

_BACKEND = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, _BACKEND)
sys.path.insert(0, os.path.join(_BACKEND, "app"))

from app.config import Settings  # noqa: E402


def test_env_file_loads(tmp_path):
    f = tmp_path / "custom.env"
    f.write_text("YAOZHI_EXTERNAL_API_KEY=test-key-123\n"
                 "YAOZHI_RAG_SEMANTIC_MIN_COS=0.42\n", encoding="utf-8")
    s = Settings(_env_file=str(f))
    assert s.external_api_key == "test-key-123"
    assert s.rag_semantic_min_cos == pytest.approx(0.42)


def test_real_env_overrides_env_file(tmp_path, monkeypatch):
    f = tmp_path / "custom.env"
    f.write_text("YAOZHI_EXTERNAL_API_KEY=from-file\n", encoding="utf-8")
    monkeypatch.setenv("YAOZHI_EXTERNAL_API_KEY", "from-env")
    s = Settings(_env_file=str(f))
    assert s.external_api_key == "from-env"
