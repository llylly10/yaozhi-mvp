"""FastAPI 鉴权依赖：路由级守卫、管理密钥、令牌签发/校验。

设计取舍（对齐 MVP 演示定位，2026-09-28）：
- `YAOZHI_AUTH_REQUIRED`（默认 false）：本地开发与既有测试零改动；部署 compose 置 true 后，
  所有可定位到用户的接口（路径含 user_id，或 session/training/attempt 作用域）要求
  Bearer token 且 token 归属必须一致；公共内容接口（/domains、/questions、图谱、教材等）不要求登录。
- `/attempts` 的 user_id 在请求体里，由端点内联校验（见 router.submit_attempt）。
- `YAOZHI_ADMIN_KEY` 保护 /admin/* 与 /eval/run（X-Admin-Key 头）；未配置时放行并在启动日志告警，
  生产环境必配（deploy/cloud 用 env_file 注入，不入库）。
- 令牌：7 天过期（YAOZHI_TOKEN_TTL_DAYS），登出即撤销；对比 purge_withdrawn 的先例，
  时间比较统一转 naive 规避 SQLite 丢时区问题。
"""
import hmac
from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Attempt, AuthToken, DiagnosisSession, DemoUser, TrainingSession, now
from .security import new_token, token_hash

# 登录/注册本身不要求已有 token
EXEMPT_ROUTES = {"/sessions/demo", "/auth/login", "/auth/logout"}


def _naive(dt):
    return dt.replace(tzinfo=None) if dt is not None and dt.tzinfo is not None else dt


def bearer_token(request: Request) -> str | None:
    h = request.headers.get("authorization") or ""
    return h[7:].strip() if h.lower().startswith("bearer ") else None


def current_user(request: Request, db: Session) -> DemoUser | None:
    raw = bearer_token(request)
    if not raw:
        return None
    tok = db.execute(
        select(AuthToken).where(AuthToken.token_hash == token_hash(raw))
    ).scalar_one_or_none()
    if tok is None or tok.revoked_at is not None:
        return None
    if _naive(tok.expires_at) < _naive(now()):
        return None
    return db.get(DemoUser, tok.user_id)


def issue_token(db: Session, user_id: str) -> str:
    raw = new_token()
    db.add(AuthToken(user_id=user_id, token_hash=token_hash(raw),
                     expires_at=now() + timedelta(days=settings.token_ttl_days)))
    return raw


def _scoped_owner_user_id(db: Session, params: dict) -> str | None:
    """从 session/training/attempt 作用域参数反查归属用户；查不到（404 场景）返回 None 放行。"""
    attempt_id = params.get("attempt_id")
    if attempt_id:
        a = db.get(Attempt, attempt_id)
        return a.user_id if a else None
    session_id = params.get("session_id")
    if session_id:
        # /diagnoses/{session_id} 与 /training/{session_id} 均为诊断会话语义
        s = db.get(DiagnosisSession, session_id)
        if s:
            a = db.get(Attempt, s.attempt_id)
            return a.user_id if a else None
    training_id = params.get("training_id")
    if training_id:
        ts = db.get(TrainingSession, training_id)
        if ts:
            s = db.get(DiagnosisSession, ts.diagnosis_id)
            if s:
                a = db.get(Attempt, s.attempt_id)
                return a.user_id if a else None
    return None


def guard_request(request: Request, db: Session = Depends(get_db)) -> None:
    """路由级守卫（挂在 APIRouter 上）：能定位到用户的接口要求 token 且归属一致。"""
    if not settings.auth_required:
        return
    route = request.scope.get("route")
    if route is not None and route.path in EXEMPT_ROUTES:
        return
    params = request.path_params
    owner = params.get("user_id") or _scoped_owner_user_id(db, params)
    if owner is None:
        return  # 公共内容接口：不要求登录
    user = current_user(request, db)
    if user is None:
        raise HTTPException(401, "未登录或登录已过期，请重新登录")
    if owner != user.id:
        raise HTTPException(403, "无权访问其他账号的数据")


def require_admin(request: Request) -> None:
    """/admin/* 与 /eval/run 的管理密钥门禁；未配置密钥=开发放行（启动日志有告警）。"""
    if not settings.admin_key:
        return
    key = request.headers.get("x-admin-key", "")
    if not hmac.compare_digest(key, settings.admin_key):
        raise HTTPException(403, "需要管理员密钥：请携带正确的 X-Admin-Key 请求头")
