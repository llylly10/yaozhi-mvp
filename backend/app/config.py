from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # W1 开发/测试用 SQLite；部署切 PostgreSQL：postgresql+psycopg://…（模型层未用 PG 专有类型）
    database_url: str = "sqlite:///./yaozhi_w1.db"
    model_provider: str = "mock"  # mock | external_api（Qwen DashScope OpenAI 兼容）| vllm（保留）
    # ---- external_api（Qwen）相关 ----
    qwen_api_key: str = ""          # 阿里云百炼 DashScope API Key（env: YAOZHI_QWEN_API_KEY）
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen-plus"  # 演示默认用 plus(归因延迟~1s, 质量可靠); 可切 qwen3.7-max-2026-06-08(更强但20-65s)
    # ---- ④ 真模型超时/熔断保护（W2，2026-09-08）----
    model_call_timeout: float = 25.0     # 单次 LLM 调用硬超时秒（兜底于 openai 客户端 timeout=40）
    model_max_retries: int = 1           # 失败重试次数（openai client max_retries）
    circuit_breaker_threshold: int = 3   # 连续失败 N 次 → 熔断开闸（进入 cooldown 走 Mock）
    circuit_breaker_cooldown: float = 60.0  # 熔断冷却秒，期间 external_api 直接降级 Mock
    # ---- ③ RAG 检索（W3 落地，2026-09-08）----
    rag_enabled: bool = True   # 诊断时按题干检索教材切片作"知识库切片"证据；语料缺失自动 no-op
    rag_top_k: int = 2         # 每道错题并入的证据卡切片数
    seed_on_startup: bool = True

    class Config:
        env_prefix = "YAOZHI_"


settings = Settings()
