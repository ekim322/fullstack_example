from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

_DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 12  # 12 hours


class TokenValidationError(ValueError):
    pass


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def _sign(payload_b64: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    return _b64url_encode(digest)


def create_session_token(
    user_id: str,
    secret: str,
    ttl_seconds: int = _DEFAULT_TOKEN_TTL_SECONDS,
) -> tuple[str, int]:
    expires_at = int(time.time()) + ttl_seconds
    payload = {"sub": user_id, "exp": expires_at}
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _sign(payload_b64, secret)
    return f"{payload_b64}.{signature}", expires_at


def verify_session_token(token: str, secret: str) -> str:
    parts = token.split(".", 1)
    if len(parts) != 2:
        raise TokenValidationError("Invalid token format")

    payload_b64, signature = parts
    expected = _sign(payload_b64, secret)
    if not hmac.compare_digest(signature, expected):
        raise TokenValidationError("Invalid token signature")

    try:
        payload_raw = _b64url_decode(payload_b64)
        payload = json.loads(payload_raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise TokenValidationError("Invalid token payload") from exc

    subject = payload.get("sub")
    expires_at = payload.get("exp")
    if not isinstance(subject, str) or not subject.strip():
        raise TokenValidationError("Invalid token subject")
    if not isinstance(expires_at, int):
        raise TokenValidationError("Invalid token expiry")
    if expires_at <= int(time.time()):
        raise TokenValidationError("Token expired")

    return subject
