from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # W1 开发/测试用 SQLite；部署切 PostgreSQL：postgresql+psycopg://…（模型层未用 PG 专有类型）
    database_url: str = "sqlite:///./yaozhi_w1.db"
    model_provider: str = "external_api"  # mock | external_api（OpenAI 兼容，默认 deepseek-v4-flash-0731）| vllm（保留）
    # ---- external_api（通用外部模型，OpenAI 兼容接口）----
    # 2026-09-15 起默认 qwen3.7-flash；2026-10-02 起 deepseek-v4-flash-0731（仍走阿里云百炼
    # DashScope compatible-mode，同一 Key；qwen 免费额度当日耗尽后切换，新模型额度独立）。
    # qwen_* 为旧字段，仅作回退。
    external_api_key: str = ""  # env: YAOZHI_EXTERNAL_API_KEY（阿里云百炼 Key）
    external_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"  # env: YAOZHI_EXTERNAL_BASE_URL
    external_model: str = "deepseek-v4-flash-0731"  # env: YAOZHI_EXTERNAL_MODEL
    # ---- external_api（Qwen，旧字段：仅当 external_* 为空时回退）----
    qwen_api_key: str = ""          # 阿里云百炼 DashScope API Key（env: YAOZHI_QWEN_API_KEY）
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen3.7-flash"  # 旧回退字段（极速响应与高质量推理）
    # ---- ④ 真模型超时/熔断保护（W2，2026-09-08；支持思考模型扩展至90s）----
    model_call_timeout: float = 90.0     # 单次 LLM 调用硬超时秒（思考模型需要充足推理时间）
    model_max_retries: int = 1           # 失败重试次数（openai client max_retries）
    circuit_breaker_threshold: int = 3   # 连续失败 N 次 → 熔断开闸（进入 cooldown 走 Mock）
    circuit_breaker_cooldown: float = 60.0  # 熔断冷却秒，期间 external_api 直接降级 Mock
    # ---- ③ RAG 检索（W3 落地，2026-09-08）----
    rag_enabled: bool = True   # 诊断时按题干检索教材切片作"知识库切片"证据；语料缺失自动 no-op
    rag_top_k: int = 2         # 每道错题并入的证据卡切片数
    # ---- 语义向量检索（2026-09-29 落地，教材语料专用）----
    # bge-small-zh 本地 ONNX（fastembed，无 torch / 无 API key）；页向量离线预构建
    # （backend/build_semantic_cache.py → app/rag/cache/）。依赖/缓存缺失自动退回
    # BM25 双路检索，绝不阻塞诊断与问答。
    rag_semantic_enabled: bool = True   # env: YAOZHI_RAG_SEMANTIC_ENABLED
    rag_semantic_min_cos: float = 0.45  # env: YAOZHI_RAG_SEMANTIC_MIN_COS，语义命中余弦门槛
                                        # （2026-09-29 实测：相关命中 0.58~0.69，噪声 0.38~0.40，取间隔带中值）
    rag_semantic_backend: str = "local"  # env: YAOZHI_RAG_SEMANTIC_BACKEND，local（fastembed 本地推理）| api（DashScope embedding，服务器零模型内存）
    rag_semantic_api_model: str = "text-embedding-v3"  # env: YAOZHI_RAG_SEMANTIC_API_MODEL，api 后端的 embedding 模型
    seed_on_startup: bool = True
    # ---- W2 账号鉴权（2026-09-28 补齐）----
    # 默认关闭=本地开发/既有测试零改动；部署（docker-compose / deploy/cloud）置 true。
    auth_required: bool = False  # env: YAOZHI_AUTH_REQUIRED，开启后用户级接口要求 Bearer token 且校验归属
    admin_key: str = ""          # env: YAOZHI_ADMIN_KEY，保护 /admin/* 与 /eval/run（X-Admin-Key 头）；空=开发放行
    invite_code: str = "DEMO2026"  # env: YAOZHI_INVITE_CODE，演示邀请码（生产建议改掉）
    token_ttl_days: int = 7      # env: YAOZHI_TOKEN_TTL_DAYS，登录令牌有效期
    cors_origins: str = "*"      # env: YAOZHI_CORS_ORIGINS，逗号分隔来源白名单

    class Config:
        env_prefix = "YAOZHI_"
        # 本地开发配置（backend/.env，.gitignore 已排除不入库）；优先级：环境变量 > .env > 默认值。
        # 注意：跑测试前请清掉外部模型 key（或暂移 .env），否则带真 key 的 .env 会污染评测确定性。
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
