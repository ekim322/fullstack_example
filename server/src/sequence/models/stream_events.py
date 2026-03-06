from __future__ import annotations

import enum
import time
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field


class EventType(str, enum.Enum):
    TEXT_DELTA = "text_delta"
    REASONING_DELTA = "reasoning_delta"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    DONE = "done"


class DoneReason(str, enum.Enum):
    COMPLETE = "complete"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    STOPPED = "stopped"
    ERROR = "error"


class StreamEvent(BaseModel):
    type: EventType
    data: dict[str, Any] = Field(default_factory=dict)
    ts: float = Field(default_factory=time.time)

    def to_redis(self) -> dict[str, str]:
        return {"payload": self.model_dump_json()}

    @classmethod
    def from_redis(cls, fields: dict[str, str]) -> StreamEvent:
        return cls.model_validate_json(fields["payload"])

    @classmethod
    def text_delta(cls, delta: str) -> StreamEvent:
        return cls(type=EventType.TEXT_DELTA, data={"delta": delta})

    @classmethod
    def reasoning_delta(cls, delta: str) -> StreamEvent:
        return cls(type=EventType.REASONING_DELTA, data={"delta": delta})

    @classmethod
    def tool_call(cls, name: str, call_id: str, arguments: str) -> StreamEvent:
        return cls(
            type=EventType.TOOL_CALL,
            data={"name": name, "call_id": call_id, "arguments": arguments},
        )

    @classmethod
    def tool_result(cls, name: str, call_id: str, output: str, declined: bool = False) -> StreamEvent:
        return cls(
            type=EventType.TOOL_RESULT,
            data={"name": name, "call_id": call_id, "output": output, "declined": declined},
        )

    @classmethod
    def done(
        cls,
        reason: DoneReason,
        conversation: list[dict[str, Any]],
        pending_tool_calls: list[dict[str, Any]] | None = None,
        detail: str | None = None,
    ) -> StreamEvent:
        d: dict[str, Any] = {"reason": reason.value, "conversation": conversation}
        if pending_tool_calls:
            d["pending_tool_calls"] = pending_tool_calls
        if detail:
            d["detail"] = detail
        return cls(type=EventType.DONE, data=d)


# ── Internal signals (never leave the server) ──────────────────────────────


@dataclass
class LLMOutputItemComplete:
    """Emitted by LLMClient once per completed output item during streaming.

    Carries one cleaned, input-ready item (reasoning, message, or function_call).
    The agent appends it to conversation immediately so progress is never lost
    if the task is cancelled before the stream ends.
    """

    item: dict[str, Any]


@dataclass
class LLMResponseComplete:
    """Sentinel emitted after all output items have been streamed.

    The agent uses this to know the LLM turn is fully done and it is safe
    to evaluate tool calls, check stop conditions, etc.
    """

    output: list[dict[str, Any]] = field(default_factory=list)
