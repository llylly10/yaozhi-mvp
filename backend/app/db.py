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
    # users 表（隐私合规增量列）
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
    # tiku_questions 内容化列（MVP 内容补全 2026-09-03，旧库补列，reset 后由 create_all 带出）
    tiku_needed = {
        "analysis": "TEXT",
        "cognitive_level": "VARCHAR(8)",
        "difficulty": "VARCHAR(4)",
        "source_ref": "VARCHAR(256)",
    }
    existing_t = {c["name"] for c in inspect(engine).get_columns("tiku_questions")}
    for col, dtype in tiku_needed.items():
        if col not in existing_t:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE tiku_questions ADD COLUMN {col} {dtype}"))
    # misconceptions 错因目录案例列（v0.7 错因卡第④字段，2026-09-08，旧库补列）
    existing_m = {c["name"] for c in inspect(engine).get_columns("misconceptions")}
    if "case_evidence" not in existing_m:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE misconceptions ADD COLUMN case_evidence TEXT"))
