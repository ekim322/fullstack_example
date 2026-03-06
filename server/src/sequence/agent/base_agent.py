# agent/base_agent.py
import asyncio
import logging
from collections.abc import AsyncGenerator, Iterable
from typing import Any

from sequence.agent.helpers.tool_helper import ToolHelper
from sequence.agent.llm_client import LLMClient, ReasoningEffort
from sequence.agent.prompts.system_prompt import SYSTEM_PROMPT
from sequence.agent.tool_registry import ToolRegistry
from sequence.models.chat_messages import (
    AssistantMessage,
    FunctionCallItem,
    FunctionCallOutputItem,
    OutputTextBlock,
    ReasoningItem,
    SummaryTextBlock,
    UserMessage,
    parse_conversation_item,
    to_api_dict,
)
from sequence.models.stream_events import (
    DoneReason,
    EventType,
    LLMOutputItemComplete,
    LLMResponseComplete,
    StreamEvent,
)

logger = logging.getLogger(__name__)

_MAX_ITERATIONS = 50
_MAX_IDENTICAL_TOOL_REPEATS = 3


class LLMAgent:
    def __init__(
        self,
        llm_client: LLMClient,
        system_prompt: str | None = SYSTEM_PROMPT,
        tool_dir: str | list[str] | None = "sequence.agent.tools",
        auto_execute_tools: Iterable[str] | None = None,
    ):
        self.llm_client = llm_client
        if system_prompt is not None:
            self.llm_client.system_prompt = system_prompt
        self.auto_execute_tools = set(auto_execute_tools or ())

        if tool_dir is not None:
            tool_helper = ToolHelper()
            self.tool_registry = ToolRegistry(tool_dir=tool_dir, dependencies={"tool_helper": tool_helper})
            self.llm_client.tools = self.tool_registry.tool_schemas or []
        else:
            self.tool_registry = None
            self.llm_client.tools = []

    async def _execute_tool(self, name: str, args: dict[str, Any]) -> str:
        if self.tool_registry is None:
            return "Error: no tool registry configured"
        return await self.tool_registry.call(name, args)

    @staticmethod
    def _get_pending_tool_calls(conversation: list[dict[str, Any]]) -> list[FunctionCallItem]:
        """Return FunctionCallItems that have no corresponding output by call_id.

        This is robust even when some tool outputs are interleaved after later
        function calls (for example: auto-executed tools mixed with tools that
        still await user confirmation).
        """
        completed_call_ids: set[str] = set()
        for raw in conversation:
            try:
                parsed = parse_conversation_item(raw)
            except Exception:
                continue
            if isinstance(parsed, FunctionCallOutputItem):
                completed_call_ids.add(parsed.call_id)

        pending: list[FunctionCallItem] = []
        for raw in conversation:
            try:
                parsed = parse_conversation_item(raw)
            except Exception:
                continue
            if isinstance(parsed, FunctionCallItem) and parsed.call_id not in completed_call_ids:
                pending.append(parsed)
        return pending

    @staticmethod
    def _are_tool_calls_identical(a: list[FunctionCallItem], b: list[FunctionCallItem]) -> bool:
        if len(a) != len(b):
            return False
        return all(x.name == y.name and x.arguments == y.arguments for x, y in zip(a, b))

    async def _execute_and_yield(self, tc: FunctionCallItem, conversation: list[dict[str, Any]]) -> StreamEvent:
        result = await self._execute_tool(tc.name, tc.parsed_arguments())
        output_item = FunctionCallOutputItem(call_id=tc.call_id, output=result)
        conversation.append(to_api_dict(output_item))

        return StreamEvent.tool_result(name=tc.name, call_id=tc.call_id, output=result)

    @staticmethod
    def _decline_tool(tc: FunctionCallItem, conversation: list[dict[str, Any]]) -> StreamEvent:
        output = "Tool call was declined by the user."
        output_item = FunctionCallOutputItem(call_id=tc.call_id, output=output)
        conversation.append(to_api_dict(output_item))
        return StreamEvent.tool_result(name=tc.name, call_id=tc.call_id, output=output, declined=True)

    @staticmethod
    def _flush_partial_buffers(
        text_buffer: str,
        reasoning_buffer: str,
        conversation: list[dict[str, Any]],
    ) -> None:
        """Append any accumulated-but-incomplete deltas to conversation as
        incomplete items. Called on cancellation so partial streamed content
        isn't silently dropped from history.
        """
        if reasoning_buffer:
            item = ReasoningItem(summary=[SummaryTextBlock(text=reasoning_buffer)])
            conversation.append(to_api_dict(item))
            logger.debug("Flushed partial reasoning (%d chars)", len(reasoning_buffer))

        if text_buffer:
            item = AssistantMessage(content=[OutputTextBlock(text=text_buffer)])
            conversation.append(to_api_dict(item))
            logger.debug("Flushed partial assistant message (%d chars)", len(text_buffer))

    async def run(
        self,
        messages: list[dict[str, Any]],
        auto_confirm_tools: bool = False,
        confirmations: dict[str, bool] | None = None,
        model: str | None = None,
        reasoning: ReasoningEffort | None = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Drive the agent loop, yielding StreamEvents.

        `messages` is mutated in-place throughout.
        This is intentional so that callers (e.g. chat_service) can read partial progress.
        On cancellation, any partially-streamed text or reasoning that hadn't yet completed
        a full output item is flushed as an incomplete item before the error propagates.
        """
        conversation = messages

        # ── Resume path ──
        pending = self._get_pending_tool_calls(conversation)
        if pending:
            if not confirmations:
                confirmations = {}
            for tc in pending:
                approved = (
                    auto_confirm_tools or tc.name in self.auto_execute_tools or confirmations.get(tc.call_id, False)
                )
                if approved:
                    yield await self._execute_and_yield(tc, conversation)
                else:
                    yield self._decline_tool(tc, conversation)

        # ── Main loop ──
        prev_tool_calls: list[FunctionCallItem] = []
        consecutive_repeats = 0

        for _ in range(_MAX_ITERATIONS):
            # Collect completed output items and tool calls for this turn.
            # LLMOutputItemComplete events update conversation immediately as each
            # item finishes streaming (reasoning block, message, function call).
            # LLMResponseComplete is the sentinel that ends the turn.
            tool_calls: list[FunctionCallItem] = []
            stream_complete = False

            # Accumulate deltas for the current streaming turn so we can
            # reconstruct a partial item if the task is cancelled mid-stream.
            # Buffers are cleared when the corresponding item completes cleanly
            # (meaning it was already appended via LLMOutputItemComplete).
            text_buffer = ""
            reasoning_buffer = ""

            try:
                async for item in self.llm_client.stream_response(
                    conversation,
                    model=model,
                    reasoning=reasoning,
                ):
                    if isinstance(item, LLMOutputItemComplete):
                        # Append to conversation right away so cancellation never
                        # loses a completed item (including encrypted_content).
                        conversation.append(item.item)
                        parsed = parse_conversation_item(item.item)
                        if isinstance(parsed, FunctionCallItem):
                            tool_calls.append(parsed)
                        elif isinstance(parsed, AssistantMessage):
                            text_buffer = ""
                        elif isinstance(parsed, ReasoningItem):
                            reasoning_buffer = ""

                    elif isinstance(item, LLMResponseComplete):
                        stream_complete = True

                    else:
                        # StreamEvent — accumulate deltas and forward to caller
                        if item.type == EventType.TEXT_DELTA:
                            text_buffer += item.data.get("delta", "")
                        elif item.type == EventType.REASONING_DELTA:
                            reasoning_buffer += item.data.get("delta", "")
                        yield item

            except asyncio.CancelledError:
                # Task was cancelled (e.g. user hit stop). Flush any partial
                # content that had been streaming but hadn't completed an item yet.
                # After this, the CancelledError propagates to _run_session_loop
                # which saves `conversation` (now including any partial items) to Redis.
                self._flush_partial_buffers(text_buffer, reasoning_buffer, conversation)
                raise

            if not stream_complete:
                yield StreamEvent.done(
                    reason=DoneReason.ERROR,
                    conversation=conversation,
                    detail="LLM stream ended without a complete response",
                )
                return

            if not tool_calls:
                yield StreamEvent.done(reason=DoneReason.COMPLETE, conversation=conversation)
                return

            # ── Repeat-call guard ──
            if self._are_tool_calls_identical(tool_calls, prev_tool_calls):
                consecutive_repeats += 1
            else:
                consecutive_repeats = 1
                prev_tool_calls = tool_calls

            if consecutive_repeats >= _MAX_IDENTICAL_TOOL_REPEATS:
                logger.warning("Identical tool calls repeated %d times, injecting warning", consecutive_repeats)
                names = [tc.name for tc in tool_calls]
                warning = UserMessage(
                    content=(
                        f"You have called {names} with identical arguments "
                        f"{consecutive_repeats} times in a row. Stop and try "
                        "a different approach or ask the user for clarification."
                    )
                )
                conversation.append(to_api_dict(warning))
                consecutive_repeats = 0
                prev_tool_calls = []
                continue

            if not auto_confirm_tools:
                auto_calls = [tc for tc in tool_calls if tc.name in self.auto_execute_tools]
                manual_calls = [tc for tc in tool_calls if tc.name not in self.auto_execute_tools]

                # Execute auto-allowed tools immediately.
                for tc in auto_calls:
                    yield await self._execute_and_yield(tc, conversation)

                # Pause only for tools that still need user confirmation.
                if manual_calls:
                    yield StreamEvent.done(
                        reason=DoneReason.AWAITING_CONFIRMATION,
                        conversation=conversation,
                        pending_tool_calls=[
                            {"name": tc.name, "call_id": tc.call_id, "arguments": tc.arguments}
                            for tc in manual_calls
                        ],
                    )
                    return

                # All calls were auto-executed; continue next loop turn.
                continue

            # auto_confirm_tools=True path
            for tc in tool_calls:
                yield await self._execute_and_yield(tc, conversation)

        yield StreamEvent.done(
            reason=DoneReason.ERROR,
            conversation=conversation,
            detail=f"Agent exceeded maximum iterations ({_MAX_ITERATIONS})",
        )
