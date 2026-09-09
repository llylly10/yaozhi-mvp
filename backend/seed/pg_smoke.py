# -*- coding: utf-8 -*-
"""W2-② PG+pgvector 迁移冒烟（本地 PG18，非 Docker）。

验证正式架构的 SQLite→PostgreSQL 同构可移植承诺：
  1. SQLAlchemy Base.metadata.create_all 在 PG 上建出全部表（与 SQLite 同构，native_enum=False）
  2. migrate() 增量补列在 PG 上幂等不崩
  3. seed(db) 完整重放（题库 786/章节 35/补章/内容化/桥接/错因目录）在 PG 上落地
  4. 关键表行数满足既有阈值

用法：
  set YAOZHI_DATABASE_URL=postgresql+psycopg://yaozhi:yaozhi_dev@localhost:5432/yaozhi
  python backend/seed/pg_smoke.py            # 跑一遍完整 PG 冒烟（会清空重建业务数据）

说明：这是本地开发 DB 冒烟，会 DROP 目标库中 Base 相关表后重建，
不触碰 SQLite 的 yaozhi_w1.db / corpus 原文。
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))  # repo root

# 必须在任何 app import 前设好 DATABASE_URL，否则 engine 已在 import 期绑定
_default_pg = "postgresql+psycopg://yaozhi:yaozhi_dev@localhost:5432/yaozhi"
os.environ.setdefault("YAOZHI_DATABASE_URL", _default_pg)
os.environ.setdefault("YAOZHI_MODEL_PROVIDER", "mock")
os.environ.setdefault("YAOZHI_SEED_ON_STARTUP", "false")

from sqlalchemy import inspect, text  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import Base, SessionLocal, engine, migrate  # noqa: E402
from app import models  # noqa: E402,F401  注册全部表

assert engine.dialect.name == "postgresql", f"应连 PG，实际 {engine.dialect.name}"


def main() -> int:
    print(f"[pg-smoke] DATABASE_URL={settings.database_url}")
    # 1) DROP 已有（仅 Base 元数据涉及的表），幂等重建
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    migrate()  # PG 上应幂等（无列缺失即空转）
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    expected = [c.__tablename__ for c in models.Base.__subclasses__()]
    missing = [t for t in expected if t not in tables]
    print(f"[pg-smoke] 建表完成: 共 {len(tables)} 张；缺 {len(missing)}: {missing}")
    assert not missing, f"PG 建表缺: {missing}"

    # 2) 完整 seed
    from seed.seed import seed
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()

    # 3) 关键表行数阈值（对齐 SQLite 主库既有基线）
    db = SessionLocal()
    try:
        checks = {
            "tiku_questions": "SELECT count(*) FROM tiku_questions",  # 786
            "syllabus_chapters": "SELECT count(*) FROM syllabus_chapters",  # 35
            "questions": "SELECT count(*) FROM questions",  # 桥接物化 723
            "diagnostic_domains": "SELECT count(*) FROM diagnostic_domains",
            "misconceptions": "SELECT count(*) FROM misconceptions",
        }
        thr = {
            "tiku_questions": 786, "syllabus_chapters": 35, "questions": 723,
            "diagnostic_domains": 1, "misconceptions": 10,
        }
        allok = True
        for name, sql in checks.items():
            n = db.execute(text(sql)).scalar()
            ok = n >= thr[name]
            allok &= ok
            print(f"[pg-smoke] {'✅' if ok else '🔴'} {name} = {n} (>= {thr[name]})")
        db.commit()
        print("[pg-smoke] PG 冒烟" + ("PASS" if allok else "FAIL"))
        return 0 if allok else 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
