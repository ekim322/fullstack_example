from __future__ import annotations

import hmac

from fastapi import APIRouter, HTTPException
from starlette import status

from sequence.core.auth import create_session_token
from sequence.core.config import get_settings
from sequence.models.auth import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    settings = get_settings()
    if not hmac.compare_digest(body.password, settings.CLIENT_PASSWORD):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    user_id = body.user_id.strip()
    if not user_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "user_id is required")

    token, expires_at = create_session_token(user_id, settings.SESSION_SIGNING_SECRET)
    return LoginResponse(user_id=user_id, token=token, expires_at=expires_at)
