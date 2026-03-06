from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from starlette import status

from sequence.core.auth import TokenValidationError, verify_session_token
from sequence.core.config import get_settings
from sequence.core.redis import RedisClient
from sequence.database.files_db import FilesDB
from sequence.services.chat_service import ChatService
from sequence.services.workspace_service import WorkspaceService


def get_redis(request: Request) -> RedisClient:
    return request.app.state.redis


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


def get_files_db(request: Request) -> FilesDB:
    return request.app.state.files_db


def get_workspace_service(request: Request) -> WorkspaceService:
    return request.app.state.workspace_service


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token

    token_from_query = request.query_params.get("auth_token")
    if token_from_query:
        return token_from_query.strip()

    return None


def get_authenticated_user_id(request: Request) -> str:
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authentication token")

    settings = get_settings()
    try:
        return verify_session_token(token, settings.SESSION_SIGNING_SECRET)
    except TokenValidationError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc


RedisDep = Annotated[RedisClient, Depends(get_redis)]
ChatServiceDep = Annotated[ChatService, Depends(get_chat_service)]
FilesDBDep = Annotated[FilesDB, Depends(get_files_db)]
WorkspaceServiceDep = Annotated[WorkspaceService, Depends(get_workspace_service)]
AuthenticatedUserDep = Annotated[str, Depends(get_authenticated_user_id)]
