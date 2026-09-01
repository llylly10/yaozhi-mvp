from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

# W1 单进程开发约定；W2 接真实模型时按 v1.1 §2.3 增加任务领取，不影响本文件
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate():
    """W1 增量迁移：为新加的可空列补齐 SQLite 表结构。

    SQLite 的 create_all 不会给已存在的表加列，导致旧的 yaozhi_w1.db
    缺 consented_at 等列而崩溃。迁移幂等：列已存在则跳过。
    """
    needed = {
        "consented_at": "DATETIME",
        "withdrawn_at": "DATETIME",
        "purged_at": "DATETIME",
        "deletion_receipt": "VARCHAR(32)",
    }
    existing = {c["name"] for c in inspect(engine).get_columns("users")}
    for col, dtype in needed.items():
        if col not in existing:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {dtype}"))
