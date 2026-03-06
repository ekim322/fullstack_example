from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Any


class ToolHelper:
    _workspace_user_id_ctx: ContextVar[str | None] = ContextVar("workspace_user_id", default=None)
    _workspace_service_ctx: ContextVar[Any | None] = ContextVar("workspace_service", default=None)

    @classmethod
    def set_workspace_context(
        cls,
        *,
        user_id: str | None,
        workspace_service: Any | None,
    ) -> tuple[Token, Token]:
        user_token = cls._workspace_user_id_ctx.set(user_id)
        service_token = cls._workspace_service_ctx.set(workspace_service)
        return user_token, service_token

    @classmethod
    def reset_workspace_context(cls, user_token: Token, service_token: Token) -> None:
        cls._workspace_user_id_ctx.reset(user_token)
        cls._workspace_service_ctx.reset(service_token)

    @classmethod
    def current_workspace_user_id(cls) -> str | None:
        return cls._workspace_user_id_ctx.get()

    @classmethod
    def current_workspace_service(cls) -> Any | None:
        return cls._workspace_service_ctx.get()

    @property
    def workspace_user_id(self) -> str | None:
        return self.current_workspace_user_id()

    @property
    def workspace_service(self) -> Any | None:
        return self.current_workspace_service()

    def require_workspace_context(self) -> tuple[str, Any]:
        user_id = self.workspace_user_id
        workspace_service = self.workspace_service
        if not user_id:
            raise RuntimeError("Workspace tool context is missing an authenticated user_id.")
        if workspace_service is None:
            raise RuntimeError("Workspace tool context is missing workspace_service.")
        return user_id, workspace_service
