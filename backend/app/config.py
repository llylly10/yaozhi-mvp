from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # W1 开发/测试用 SQLite；部署切 PostgreSQL：postgresql+psycopg://…（模型层未用 PG 专有类型）
    database_url: str = "sqlite:///./yaozhi_w1.db"
    model_provider: str = "mock"  # mock | external_api（Qwen DashScope OpenAI 兼容）| vllm（保留）
    # ---- external_api（Qwen）相关 ----
    qwen_api_key: str = ""          # 阿里云百炼 DashScope API Key（env: YAOZHI_QWEN_API_KEY）
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen3.7-max-2026-06-08"
    seed_on_startup: bool = True

    class Config:
        env_prefix = "YAOZHI_"


settings = Settings()
