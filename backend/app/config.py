from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # W1 开发/测试用 SQLite；部署切 PostgreSQL：postgresql+psycopg://…（模型层未用 PG 专有类型）
    database_url: str = "sqlite:///./yaozhi_w1.db"
    model_provider: str = "mock"  # mock | external_api | vllm（W2 接入真实模型）
    seed_on_startup: bool = True

    class Config:
        env_prefix = "YAOZHI_"


settings = Settings()
