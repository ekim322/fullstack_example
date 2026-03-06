import asyncio
import logging
from collections.abc import AsyncGenerator
from typing import Any, Literal, Union

from openai import AsyncOpenAI
from openai.types.responses import (
    Response,
    ResponseInputParam,
    ResponseTextDeltaEvent,
    ResponseOutputItemAddedEvent,
    ResponseOutputItemDoneEvent,
    ResponseFunctionCallArgumentsDoneEvent,
    ResponseReasoningTextDeltaEvent,
    ResponseReasoningSummaryTextDeltaEvent,
)

from sequence.models.stream_events import StreamEvent, LLMOutputItemComplete, LLMResponseComplete
from sequence.models.chat_messages import parse_conversation_item, to_api_dict


logger = logging.getLogger(__name__)

ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh"]


class LLMClient:
    def __init__(
        self,
        api_key: str,
        system_prompt: str | None = None,
        tools: list[dict[str, Any]] | None = None,
        model: str = "gpt-5-mini-2025-08-07",
        reasoning: ReasoningEffort = "low",
        max_concurrency: int = 50,
    ):
        self.client = AsyncOpenAI(api_key=api_key)
        self.system_prompt = system_prompt
        self.tools = tools or []
        self.model = model
        self.reasoning = reasoning
        self.semaphore = asyncio.Semaphore(max_concurrency)

    def _build_kwargs(
        self,
        messages: str | list[dict[str, Any]] | ResponseInputParam,
        system_prompt: str | None,
        model: str | None,
        reasoning: ReasoningEffort | None,
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": model or self.model,
            "input": messages,
            "store": False,  # we manage conversation state ourselves
        }

        instructions = system_prompt if system_prompt is not None else self.system_prompt
        if instructions:
            kwargs["instructions"] = instructions

        if self.tools:
            kwargs["tools"] = self.tools

        effort = reasoning if reasoning is not None else self.reasoning
        if effort != "none":
            kwargs["reasoning"] = {"effort": effort, "summary": "auto"}
            # Request encrypted reasoning so it can be passed back on subsequent turns.
            # The encrypted_content field on reasoning output items will be preserved by
            # _clean_output_item and included in conversation history automatically.
            kwargs["include"] = ["reasoning.encrypted_content"]

        return kwargs

    @staticmethod
    def _clean_output_item(item: Any) -> dict[str, Any]:
        return to_api_dict(parse_conversation_item(item.model_dump()))

    async def get_response(
        self,
        messages: str | list[dict[str, Any]] | ResponseInputParam,
        system_prompt: str | None = None,
        model: str | None = None,
        reasoning: ReasoningEffort | None = None,
    ) -> Response:
        kwargs = self._build_kwargs(messages, system_prompt, model, reasoning)
        async with self.semaphore:
            return await self.client.responses.create(**kwargs)

    async def stream_response(
        self,
        messages: str | list[dict[str, Any]] | ResponseInputParam,
        system_prompt: str | None = None,
        model: str | None = None,
        reasoning: ReasoningEffort | None = None,
    ) -> AsyncGenerator[Union[StreamEvent, LLMOutputItemComplete, LLMResponseComplete], None]:
        """Stream a single LLM call.

        Yields, in order:
        - StreamEvent (text_delta, reasoning_delta, tool_call) — forwarded to the caller
        - LLMOutputItemComplete — one per completed output item; the agent appends
          each to conversation immediately so progress survives cancellation
        - LLMResponseComplete — sentinel indicating the turn is fully done

        Output items are emitted via ResponseOutputItemDoneEvent, which fires once
        per item after it is fully assembled (including encrypted_content on reasoning
        items). This replaces the previous get_final_response() approach.
        """
        kwargs = self._build_kwargs(messages, system_prompt, model, reasoning)
        fn_meta: dict[int, dict[str, Any]] = {}

        async with self.semaphore:
            async with self.client.responses.stream(**kwargs) as stream:
                async for event in stream:
                    # ── Reasoning summary deltas (what users see) ──
                    if isinstance(event, (ResponseReasoningSummaryTextDeltaEvent, ResponseReasoningTextDeltaEvent)):
                        if event.delta:
                            logger.debug("Reasoning delta: %s", event.delta)
                            yield StreamEvent.reasoning_delta(event.delta)

                    # ── Assistant text deltas ──
                    elif isinstance(event, ResponseTextDeltaEvent):
                        if event.delta:
                            logger.debug("Text delta: %s", event.delta)
                            yield StreamEvent.text_delta(event.delta)

                    # ── Track function call metadata as it starts ──
                    elif isinstance(event, ResponseOutputItemAddedEvent):
                        item = event.item
                        if getattr(item, "type", None) == "function_call":
                            fn_meta[event.output_index] = {
                                "name": getattr(item, "name", None),
                                "call_id": getattr(item, "call_id", None),
                            }

                    # ── Stream tool call to client as soon as args are done ──
                    elif isinstance(event, ResponseFunctionCallArgumentsDoneEvent):
                        meta = fn_meta.get(event.output_index, {})
                        logger.debug("Function args done: %s", meta)
                        yield StreamEvent.tool_call(
                            name=meta.get("name", ""),
                            call_id=meta.get("call_id", ""),
                            arguments=event.arguments or "{}",
                        )

                    # ── One complete output item is ready ──
                    # This fires for reasoning, message, and function_call items.
                    elif isinstance(event, ResponseOutputItemDoneEvent):
                        clean = self._clean_output_item(event.item)
                        logger.debug("Output item done: type=%s", clean.get("type"))
                        yield LLMOutputItemComplete(item=clean)

        yield LLMResponseComplete()
