from __future__ import annotations

import enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class AgentMode(str, enum.Enum):
    CHAT = "chat"
    PLAN = "plan"


class ChatModel(str, enum.Enum):
    GPT_5_2 = "gpt-5.2-2025-12-11"
    GPT_5_MINI = "gpt-5-mini-2025-08-07"


class ChatRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    thread_id: str | None = None
    message: str | None = None
    confirmations: dict[str, bool] | None = None
    mode: AgentMode | None = None
    model: ChatModel | None = None
    auto_confirm_tools: bool | None = None

    @model_validator(mode="after")
    def _check_message_xor_confirmations(self) -> ChatRequest:
        has_message = self.message is not None
        has_confirmations = self.confirmations is not None
        if has_message == has_confirmations:
            raise ValueError("Provide either 'message' or 'confirmations', not both or neither")
        if has_confirmations and not self.thread_id:
            raise ValueError("'thread_id' is required when sending confirmations")
        if has_confirmations and any(
            value is not None for value in (self.mode, self.model, self.auto_confirm_tools)
        ):
            raise ValueError("'mode', 'model', and 'auto_confirm_tools' can only be set when sending a message")
        return self


class ChatResponse(BaseModel):
    thread_id: str
    session_id: str
    status: str


class SessionConfig(BaseModel):
    mode: AgentMode = AgentMode.PLAN
    model: ChatModel = ChatModel.GPT_5_MINI
    auto_confirm_tools: bool = False


class ThreadStatusResponse(BaseModel):
    thread_id: str
    status: str
    session_config: SessionConfig | None = None
    current_session_id: str | None = None
    pending_tool_calls: list[dict[str, Any]] | None = None
    detail: str | None = None


class ThreadHistoryItem(BaseModel):
    thread_id: str
    is_open: bool = True
    status: str
    session_config: SessionConfig | None = None
    current_session_id: str | None = None
    pending_tool_calls: list[dict[str, Any]] | None = None
    detail: str | None = None
    created_at: str
    updated_at: str
    conversation: list[dict[str, Any]] = Field(default_factory=list)


class ThreadHistoryResponse(BaseModel):
    threads: list[ThreadHistoryItem]


class ThreadOpenStateRequest(BaseModel):
    is_open: bool


class ThreadOpenStateResponse(BaseModel):
    thread_id: str
    is_open: bool


class ThreadState(BaseModel):
    status: str
    session_config: SessionConfig | None = None
    conversation: list[dict[str, Any]] = Field(default_factory=list)
    current_session_id: str | None = None
    pending_tool_calls: list[dict[str, Any]] | None = None
    detail: str | None = None
