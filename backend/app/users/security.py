"""密码哈希与登录令牌的原语（仅标准库，零新增依赖）。

- 密码：PBKDF2-HMAC-SHA256，随机盐，存储格式 `pbkdf2_sha256$<iter>$<salt_b64>$<hash_b64>`；
  `password_hash IS NULL` 表示存量无密码演示账号（凭邀请码进入，兼容 W1 行为）。
- 令牌：`secrets.token_urlsafe(32)` 原文只下发一次，库存 sha256 摘要，泄露库不泄露可用凭据。
"""
import base64
import hashlib
import hmac
import secrets

PBKDF2_ITERATIONS = 120_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode(),
        base64.b64encode(dk).decode(),
    )


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algo, iters, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                                 base64.b64decode(salt_b64), int(iters))
        return hmac.compare_digest(dk, base64.b64decode(hash_b64))
    except Exception:  # noqa: BLE001 格式损坏一律视为不匹配
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
