import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))  # 保证 `app`/`seed` 可导入

from app.config import settings  # noqa: E402
from app.db import Base, SessionLocal, engine, migrate  # noqa: E402
from app.router import router  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

app = FastAPI(title="药知 MVP API", version="1.1-w1")
# 演示部署：允许所有来源（Cloudflare Pages 经 Functions 代理 /api 时为同源，此处为兜底）。
# 生产环境应改为具体的 Pages 域名白名单。
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])
app.include_router(router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    migrate()  # 补齐增量列（SQLite 不自动加列）
    if settings.seed_on_startup:
        from seed.seed import seed
        db = SessionLocal()
        try:
            seed(db)
        finally:
            db.close()


@app.get("/healthz")
def healthz():
    return {"ok": True}
