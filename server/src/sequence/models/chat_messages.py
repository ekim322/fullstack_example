# models/chat_messages.py
from __future__ import annotations

import json
import logging
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Content / summary blocks
# ---------------------------------------------------------------------------


class OutputTextBlock(BaseModel):
    type: Literal["output_text"] = "output_text"
    text: str


class SummaryTextBlock(BaseModel):
    type: Literal["summary_text"] = "summary_text"
    text: str


# ---------------------------------------------------------------------------
# Conversation item types
# ---------------------------------------------------------------------------


class UserMessage(BaseModel):
    """{"role": "user", "content": "..."}"""

    role: Literal["user"] = "user"
    content: str

    def full_text(self) -> str:
        return self.content


class AssistantMessage(BaseModel):
    """
    {
        "type": "message",
        "role": "assistant",
        "content": [{"type": "output_text", "text": "..."}]
    }
    """

    type: Literal["message"] = "message"
    role: Literal["assistant"] = "assistant"
    content: list[OutputTextBlock] = Field(default_factory=list)

    # Returned by the API but rejected as input — excluded from serialisation.
    id: str | None = Field(default=None, exclude=True)
    status: str | None = Field(default=None, exclude=True)

    def full_text(self) -> str:
        return "\n".join(block.text for block in self.content)


class ReasoningItem(BaseModel):
    """
    {
        "type": "reasoning",
        "summary": [{"type": "summary_text", "text": "..."}],
        "encrypted_content": "<opaque string>"
    }

    `encrypted_content` must be passed back verbatim on subsequent turns.
    Never alter or re-encode it.
    """

    type: Literal["reasoning"] = "reasoning"
    summary: list[SummaryTextBlock] = Field(default_factory=list)
    encrypted_content: str | None = None

    id: str | None = Field(default=None, exclude=True)
    status: str | None = Field(default=None, exclude=True)

    def summary_text(self) -> str:
        return "\n".join(block.text for block in self.summary)


class FunctionCallItem(BaseModel):
    """
    {
        "type": "function_call",
        "id": "...",
        "call_id": "...",
        "name": "...",
        "arguments": "{...}"   <- JSON-encoded string, matches API wire format
    }
    """

    type: Literal["function_call"] = "function_call"
    id: str | None = None
    call_id: str
    name: str
    arguments: str  # kept as str to match the API exactly

    status: str | None = Field(default=None, exclude=True)

    def parsed_arguments(self) -> dict[str, Any]:
        try:
            return json.loads(self.arguments) if self.arguments else {}
        except (json.JSONDecodeError, TypeError):
            logger.warning("Failed to parse function call arguments: %s", self.arguments)
            return {}


class FunctionCallOutputItem(BaseModel):
    """{"type": "function_call_output", "call_id": "...", "output": "..."}"""

    type: Literal["function_call_output"] = "function_call_output"
    call_id: str
    output: str


# ---------------------------------------------------------------------------
# Shared union type — used as a type hint across base_agent, llm_client, chat_db
# ---------------------------------------------------------------------------

ConversationItem = Union[
    UserMessage,
    AssistantMessage,
    ReasoningItem,
    FunctionCallItem,
    FunctionCallOutputItem,
]


def parse_conversation_item(raw: dict[str, Any]) -> ConversationItem:
    """Parse a raw conversation dict into the correct typed model.

    Dispatch is manual (not a pydantic discriminated union) because UserMessage
    uses `role` as its discriminator while all other types use `type` — pydantic
    requires a single shared discriminator field for tagged unions.
    """
    item_type = raw.get("type")
    role = raw.get("role")

    if role == "user":
        return UserMessage.model_validate(raw)
    elif item_type == "message":
        return AssistantMessage.model_validate(raw)
    elif item_type == "reasoning":
        return ReasoningItem.model_validate(raw)
    elif item_type == "function_call":
        return FunctionCallItem.model_validate(raw)
    elif item_type == "function_call_output":
        return FunctionCallOutputItem.model_validate(raw)
    else:
        raise ValueError(f"Unknown conversation item: type={item_type!r}, role={role!r}")


def to_api_dict(item: ConversationItem) -> dict[str, Any]:
    """Serialise a ConversationItem to a dict safe to send as API input.

    Fields marked `exclude=True` (status, id on assistant/reasoning items) are
    omitted automatically. None values are also stripped to keep payloads clean.
    """
    return item.model_dump(exclude_none=True)
