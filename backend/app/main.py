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
# 可用 YAOZHI_CORS_ORIGINS 配置白名单（逗号分隔）；生产同源反代时建议收紧。
_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["*"],
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
    # 安全配置告警：默认值面向本地开发，公网部署必须显式配置（deploy/cloud 已置 true）
    import logging
    _log = logging.getLogger("uvicorn.warning")
    if not settings.auth_required:
        _log.warning("鉴权未启用（YAOZHI_AUTH_REQUIRED=false）：用户级接口不做 token 校验，仅限本地开发")
    if not settings.admin_key:
        _log.warning("管理密钥未配置（YAOZHI_ADMIN_KEY 为空）：/admin/* 与 /eval/run 处于开放状态")


@app.get("/healthz")
def healthz():
    return {"ok": True}
