from __future__ import annotations

import asyncio
import enum
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from sequence.agent.agent_router import AgentRouter
from sequence.agent.helpers.tool_helper import ToolHelper
from sequence.core.redis import RedisClient
from sequence.models.chat import AgentMode, ChatModel, SessionConfig, ThreadState
from sequence.models.stream_events import DoneReason, EventType, StreamEvent
from sequence.database.chat_db import ChatDB
from sequence.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

_THREAD_TTL = 3600
_SESSION_STREAM_TTL = 3600
_STREAM_MAXLEN = 2000
_SSE_BLOCK_MS = 1_000
_SSE_READ_COUNT = 10
_MAX_EMPTY_CYCLES = 120
_LOCK_TTL = 5


class StopSessionOutcome(str, enum.Enum):
    STOPPED = "stopped"
    ALREADY_STOPPED = "already_stopped"
    THREAD_NOT_FOUND = "thread_not_found"
    FORBIDDEN = "forbidden"


class ChatService:
    def __init__(
        self,
        redis: RedisClient,
        agent_router: AgentRouter,
        chat_db: ChatDB,
        workspace_service: WorkspaceService | None = None,
    ) -> None:
        self.redis = redis
        self.agent_router = agent_router
        self.chat_db = chat_db
        self.workspace_service = workspace_service
        self._tasks: dict[str, asyncio.Task[None]] = {}

    @staticmethod
    def _thread_key(thread_id: str) -> str:
        return f"thread:{thread_id}"

    @staticmethod
    def _session_stream_key(session_id: str) -> str:
        return f"session:{session_id}:events"

    @staticmethod
    def _thread_lock_key(thread_id: str) -> str:
        return f"thread:{thread_id}:lock"

    @staticmethod
    def _session_thread_key(session_id: str) -> str:
        return f"session:{session_id}:thread"

    async def _save_thread(self, thread_id: str, state: ThreadState, user_id: str | None) -> None:
        await self.redis.set(self._thread_key(thread_id), state.model_dump_json(), ttl=_THREAD_TTL)
        await self.chat_db.save_thread(thread_id, state, user_id=user_id)

    async def _load_thread(self, thread_id: str) -> ThreadState | None:
        raw = await self.redis.get(self._thread_key(thread_id))
        if raw:
            return ThreadState.model_validate_json(raw)

        # Redis miss (e.g. TTL expired) — rebuild from Postgres and re-warm cache
        logger.info("Redis miss for thread %s — loading from Postgres", thread_id)
        state = await self.chat_db.load_thread(thread_id)
        if state:
            await self.redis.set(self._thread_key(thread_id), state.model_dump_json(), ttl=_THREAD_TTL)
        return state

    async def _can_access_thread(self, thread_id: str, user_id: str) -> bool:
        owner = await self.chat_db.get_thread_owner(thread_id)
        if owner is None:
            return True
        return owner == user_id

    async def _thread_id_for_session(self, session_id: str) -> str | None:
        cached = await self.redis.get(self._session_thread_key(session_id))
        if cached:
            return cached

        thread_id = await self.chat_db.get_thread_id_by_session(session_id)
        if thread_id:
            await self.redis.set(self._session_thread_key(session_id), thread_id, ttl=_SESSION_STREAM_TTL)
        return thread_id

    async def validate_session_access(self, session_id: str, user_id: str) -> str:
        thread_id = await self._thread_id_for_session(session_id)
        if not thread_id:
            raise ValueError("Session not found")
        if not await self._can_access_thread(thread_id, user_id):
            raise PermissionError("Forbidden")
        return thread_id

    async def _run_session_loop(
        self,
        thread_id: str,
        session_id: str,
        user_id: str | None,
        messages: list[dict[str, Any]],
        session_config: SessionConfig,
        confirmations: dict[str, bool] | None = None,
    ) -> None:
        """Run the agent and relay events to the Redis stream.

        `messages` is the live conversation list — the agent mutates it in-place
        as items complete, so it always reflects the most recent state even if
        this task is cancelled mid-stream.
        """
        stream_key = self._session_stream_key(session_id)
        agent_stream: AsyncGenerator[StreamEvent, None] | None = None
        context_tokens: tuple[Any, Any] | None = None

        if user_id and self.workspace_service is not None:
            context_tokens = ToolHelper.set_workspace_context(
                user_id=user_id,
                workspace_service=self.workspace_service,
            )

        try:
            agent_stream = self.agent_router.run(
                mode=session_config.mode,
                messages=messages,
                auto_confirm_tools=session_config.auto_confirm_tools,
                confirmations=confirmations,
                model=session_config.model,
            )
            async for event in agent_stream:
                if event.type == EventType.DONE:
                    await self._handle_done(
                        thread_id=thread_id,
                        session_id=session_id,
                        user_id=user_id,
                        event=event,
                        session_config=session_config,
                        stream_key=stream_key,
                    )
                else:
                    await self.redis.stream_add(stream_key, event.to_redis(), max_len=_STREAM_MAXLEN)

        except asyncio.CancelledError:
            # Cancellation can land while this loop is awaiting Redis (after a
            # delta event was yielded) rather than while the agent is awaiting
            # the model stream. In that case, the agent never sees
            # CancelledError and does not flush its partial buffers.
            #
            # Best-effort: throw CancelledError into the agent generator so it
            # can append any buffered partial text/reasoning before we save.
            await self._flush_agent_stream_on_cancel(agent_stream)

            # The task was cancelled (e.g. stop_session). Save whatever the agent
            # managed to append to `messages` before the cancellation. Because the
            # agent mutates the list in-place, `messages` is already up to date with
            # all completed output items (reasoning blocks, assistant messages, tool
            # calls) even if the current item was only partially streamed.
            logger.info("Session cancelled: thread=%s session=%s — saving partial conversation", thread_id, session_id)
            await self._save_thread(
                thread_id,
                ThreadState(
                    status=DoneReason.STOPPED.value,
                    session_config=session_config,
                    conversation=list(messages),
                    current_session_id=session_id,
                    detail="Session stopped by user",
                ),
                user_id=user_id,
            )
            done_event = StreamEvent(
                type=EventType.DONE,
                data={"reason": DoneReason.STOPPED.value, "detail": "Session stopped by user"},
            )
            await self.redis.stream_add(stream_key, done_event.to_redis(), max_len=_STREAM_MAXLEN)
            raise  # re-raise so asyncio marks the task as cancelled

        except Exception:
            logger.exception("Agent session failed: thread=%s session=%s", thread_id, session_id)
            error_event = StreamEvent(
                type=EventType.DONE,
                data={"reason": DoneReason.ERROR.value, "detail": "Internal agent error"},
            )
            await self.redis.stream_add(stream_key, error_event.to_redis(), max_len=_STREAM_MAXLEN)
            await self._save_thread(
                thread_id,
                ThreadState(
                    status="error",
                    session_config=session_config,
                    conversation=list(messages),
                    current_session_id=session_id,
                    detail="Internal agent error",
                ),
                user_id=user_id,
            )

        finally:
            if context_tokens is not None:
                ToolHelper.reset_workspace_context(*context_tokens)
            self._tasks.pop(session_id, None)

    async def _flush_agent_stream_on_cancel(
        self,
        agent_stream: AsyncGenerator[StreamEvent, None] | None,
    ) -> None:
        if agent_stream is None:
            return

        try:
            await agent_stream.athrow(asyncio.CancelledError())
        except (StopAsyncIteration, asyncio.CancelledError, GeneratorExit):
            # Expected outcomes: generator exited or re-raised cancellation.
            return
        except RuntimeError:
            # Generator was already closed/running; nothing else to flush.
            return
        except Exception:
            logger.exception("Failed to flush agent partial buffers during cancellation")

    async def _handle_done(
        self,
        thread_id: str,
        session_id: str,
        user_id: str | None,
        event: StreamEvent,
        session_config: SessionConfig,
        stream_key: str,
    ) -> None:
        thread_state = ThreadState(
            status=event.data["reason"],
            session_config=session_config,
            conversation=event.data.get("conversation", []),
            current_session_id=session_id,
            pending_tool_calls=event.data.get("pending_tool_calls"),
        )
        await self._save_thread(thread_id, thread_state, user_id=user_id)

        client_data: dict[str, Any] = {"reason": event.data["reason"]}
        for key in ("pending_tool_calls", "detail"):
            if key in event.data:
                client_data[key] = event.data[key]

        trimmed = StreamEvent(type=EventType.DONE, data=client_data)
        await self.redis.stream_add(stream_key, trimmed.to_redis(), max_len=_STREAM_MAXLEN)

    def _spawn_task(self, session_id: str, coro) -> None:
        task = asyncio.create_task(coro)
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
        self._tasks[session_id] = task

    async def handle_chat(
        self,
        thread_id: str | None = None,
        message: str | None = None,
        confirmations: dict[str, bool] | None = None,
        mode: AgentMode | None = None,
        model: ChatModel | None = None,
        auto_confirm_tools: bool | None = None,
        user_id: str | None = None,
    ) -> tuple[str, str]:
        if user_id is None or not user_id.strip():
            raise ValueError("user_id is required")

        if not thread_id:
            thread_id = uuid.uuid4().hex

        lock_key = self._thread_lock_key(thread_id)
        lock_token = await self.redis.acquire_lock(lock_key, ttl=_LOCK_TTL)
        if not lock_token:
            raise ValueError("Thread is busy — try again shortly")

        try:
            thread = await self._load_thread(thread_id)

            if thread and not await self._can_access_thread(thread_id, user_id):
                raise ValueError("Thread not found")

            if message is not None:
                # New message path
                if thread:
                    if thread.status == "running":
                        raise ValueError("Thread already has an active session")
                    if thread.status == DoneReason.AWAITING_CONFIRMATION.value:
                        raise ValueError(
                            "Thread is awaiting tool confirmation — "
                            "send confirmations or decline before sending a new message"
                        )
                    conversation = thread.conversation
                else:
                    conversation = []

                conversation.append({"role": "user", "content": message})
                resolved_session_config = SessionConfig(
                    mode=mode or AgentMode.PLAN,
                    model=model or ChatModel.GPT_5_MINI,
                    auto_confirm_tools=auto_confirm_tools if auto_confirm_tools is not None else False,
                )

            else:
                # Confirmation path
                if not thread:
                    raise ValueError("Thread not found")
                if thread.status != DoneReason.AWAITING_CONFIRMATION.value:
                    raise ValueError(f"Thread is not awaiting confirmation (status={thread.status})")
                if thread.session_config is None:
                    raise ValueError("Thread has no session configuration to continue from")

                conversation = thread.conversation
                resolved_session_config = thread.session_config

            session_id = uuid.uuid4().hex

            await self._save_thread(
                thread_id,
                ThreadState(
                    status="running",
                    session_config=resolved_session_config,
                    conversation=conversation,
                    current_session_id=session_id,
                ),
                user_id=user_id,
            )

        finally:
            await self.redis.release_lock(lock_key, token=lock_token)

        await self.redis.set(self._session_thread_key(session_id), thread_id, ttl=_SESSION_STREAM_TTL)
        await self.redis.raw.expire(self._session_stream_key(session_id), _SESSION_STREAM_TTL)
        self._spawn_task(
            session_id,
            self._run_session_loop(
                thread_id=thread_id,
                session_id=session_id,
                user_id=user_id,
                messages=conversation,  # agent mutates this list in-place
                session_config=resolved_session_config,
                confirmations=confirmations,
            ),
        )
        return thread_id, session_id

    async def stream_session_events(
        self,
        session_id: str,
        last_id: str = "0-0",
        user_id: str | None = None,
        access_validated: bool = False,
    ) -> AsyncGenerator[tuple[str, StreamEvent] | None, None]:
        if user_id is None or not user_id.strip():
            raise ValueError("user_id is required")

        if not access_validated:
            thread_id = await self._thread_id_for_session(session_id)
            if not thread_id:
                raise ValueError("Session not found")
            if not await self._can_access_thread(thread_id, user_id):
                raise PermissionError("Forbidden")

        stream_key = self._session_stream_key(session_id)

        for _ in range(_MAX_EMPTY_CYCLES):
            entries = await self.redis.stream_read(
                stream_key,
                last_id=last_id,
                count=_SSE_READ_COUNT,
                block_ms=_SSE_BLOCK_MS,
            )

            if entries:
                for entry_id, fields in entries:
                    last_id = entry_id
                    event = StreamEvent.from_redis(fields)
                    yield entry_id, event
                    if event.type == EventType.DONE:
                        return
                continue

            yield None

    async def get_thread_status(self, thread_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        if user_id is None or not user_id.strip():
            return None
        if not await self._can_access_thread(thread_id, user_id):
            return None

        return await self.chat_db.get_thread_status(thread_id)

    async def stop_session(self, thread_id: str, user_id: str | None = None) -> StopSessionOutcome:
        """Cancel the running task for this thread.

        The CancelledError handler in _run_session_loop takes care of saving
        the partial conversation and emitting a DONE event to the stream.
        """
        if user_id is None or not user_id.strip():
            return StopSessionOutcome.FORBIDDEN
        if not await self._can_access_thread(thread_id, user_id):
            return StopSessionOutcome.FORBIDDEN

        thread_status = await self.chat_db.get_thread_status(thread_id)
        if not thread_status:
            return StopSessionOutcome.THREAD_NOT_FOUND

        if thread_status.get("status") != "running":
            return StopSessionOutcome.ALREADY_STOPPED

        session_id = thread_status.get("current_session_id")
        if not isinstance(session_id, str) or not session_id:
            return StopSessionOutcome.ALREADY_STOPPED

        task = self._tasks.get(session_id)
        if not task or task.done():
            return StopSessionOutcome.ALREADY_STOPPED

        task.cancel()
        # Don't await the task here — the CancelledError handler inside
        # _run_session_loop owns saving state and emitting the DONE event.
        # Awaiting here would also risk the current request being cancelled
        # before the handler finishes.
        return StopSessionOutcome.STOPPED

    async def list_threads_for_user(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        rows = await self.chat_db.get_all_conversations(user_id=user_id, limit=limit, offset=offset)
        return [
            {
                "thread_id": row["thread_id"],
                "is_open": row["is_open"],
                "status": row["status"],
                "session_config": row["session_config"],
                "current_session_id": row["current_session_id"],
                "pending_tool_calls": row["pending_tool_calls"],
                "detail": row["detail"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "conversation": row["conversation"],
            }
            for row in rows
        ]

    async def set_thread_open_state(self, thread_id: str, user_id: str, is_open: bool) -> bool:
        if not user_id.strip():
            return False
        if not await self._can_access_thread(thread_id, user_id):
            return False

        return await self.chat_db.set_thread_open_state(
            thread_id=thread_id,
            user_id=user_id,
            is_open=is_open,
        )

    async def shutdown(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()
        logger.info("ChatService shut down")
