import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))  # 保证 `app`/`seed` 可导入

from app.config import settings  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.router import router  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

app = FastAPI(title="药知 MVP API", version="1.1-w1")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"],
                   allow_headers=["*"])
app.include_router(router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
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
