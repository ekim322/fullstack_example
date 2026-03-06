from __future__ import annotations

import logging
import json
from typing import Any

from sequence.database.pg_base import PostgresBase
from sequence.models.chat import SessionConfig, ThreadState
from sequence.models.chat_messages import (
    AssistantMessage,
    FunctionCallItem,
    FunctionCallOutputItem,
    ReasoningItem,
    UserMessage,
    parse_conversation_item,
    to_api_dict,
)

logger = logging.getLogger(__name__)


def _to_jsonb(val: Any) -> str | None:
    """Serialise a value to a JSON string for asyncpg JSONB parameters."""
    return json.dumps(val) if val is not None else None


def _from_jsonb(val: Any) -> Any:
    """Deserialise a JSONB value returned by asyncpg.

    asyncpg stores our pre-serialised strings verbatim in PG, so on read it
    hands them back as Python strings rather than decoded objects. We json.loads
    them here to recover the original structure.
    """
    if isinstance(val, str):
        return json.loads(val)
    return val  # already decoded (e.g. asyncpg decoded it natively)


def _session_config_from_row(row: dict[str, Any] | Any) -> SessionConfig | None:
    mode = row["mode"]
    model = row["model"]
    if mode is None or model is None:
        return None
    return SessionConfig(
        mode=mode,
        model=model,
        auto_confirm_tools=bool(row["auto_confirm_tools"]),
    )


def _session_config_dict(row: dict[str, Any] | Any) -> dict[str, Any] | None:
    config = _session_config_from_row(row)
    return config.model_dump(mode="json") if config is not None else None


class ChatDB(PostgresBase):
    """Postgres-backed store for chat threads and their conversation history."""

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------
    async def connect(self) -> None:
        await super().connect()
        await self.create_tables()

    async def create_tables(self) -> None:
        create_threads_table = """
        CREATE TABLE IF NOT EXISTS threads (
            thread_id           TEXT        PRIMARY KEY,
            user_id             TEXT        DEFAULT NULL,
            is_open             BOOLEAN     NOT NULL DEFAULT TRUE,
            status              TEXT        NOT NULL,
            current_session_id  TEXT        DEFAULT NULL,
            pending_tool_calls  JSONB       DEFAULT NULL,
            detail              TEXT        DEFAULT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """

        create_thread_sessions_table = """
        CREATE TABLE IF NOT EXISTS thread_sessions (
            session_id          TEXT        PRIMARY KEY,
            thread_id           TEXT        NOT NULL
                                    REFERENCES threads(thread_id) ON DELETE CASCADE,
            mode                TEXT        NOT NULL,
            model               TEXT        NOT NULL,
            auto_confirm_tools  BOOLEAN     NOT NULL DEFAULT FALSE,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """

        create_messages_table = """
        CREATE TABLE IF NOT EXISTS messages (
            id                  BIGSERIAL   PRIMARY KEY,
            thread_id           TEXT        NOT NULL
                                    REFERENCES threads(thread_id) ON DELETE CASCADE,
            position            INTEGER     NOT NULL,

            -- Discriminator: user_message | assistant_message | reasoning
            --                | function_call | function_call_output | unknown
            item_type           TEXT        NOT NULL,

            -- user_message / assistant_message
            role                TEXT        DEFAULT NULL,
            content             TEXT        DEFAULT NULL,

            -- reasoning
            reasoning_summary   TEXT        DEFAULT NULL,
            encrypted_content   TEXT        DEFAULT NULL,

            -- function_call
            tool_name           TEXT        DEFAULT NULL,
            call_id             TEXT        DEFAULT NULL,
            arguments           JSONB       DEFAULT NULL,

            -- function_call_output
            tool_output         TEXT        DEFAULT NULL,

            -- full item for perfect round-trip (never parsed on write, only on read)
            raw                 JSONB       NOT NULL,

            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            UNIQUE (thread_id, position)
        );
        """

        create_messages_index = """
        CREATE INDEX IF NOT EXISTS idx_messages_thread_position
            ON messages (thread_id, position);
        """

        create_thread_sessions_index = """
        CREATE INDEX IF NOT EXISTS idx_thread_sessions_thread_created
            ON thread_sessions (thread_id, created_at DESC);
        """

        create_thread_sessions_session_id_unique = """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_sessions_session_id
            ON thread_sessions (session_id);
        """

        drop_legacy_thread_controls = """
        ALTER TABLE threads
            DROP COLUMN IF EXISTS mode,
            DROP COLUMN IF EXISTS model,
            DROP COLUMN IF EXISTS auto_confirm_tools;
        """

        ensure_threads_columns = """
        ALTER TABLE threads
            ADD COLUMN IF NOT EXISTS user_id            TEXT        DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS is_open            BOOLEAN     NOT NULL DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS status             TEXT        NOT NULL DEFAULT 'complete',
            ADD COLUMN IF NOT EXISTS current_session_id TEXT        DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS pending_tool_calls JSONB       DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS detail             TEXT        DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
        """

        ensure_thread_sessions_columns = """
        ALTER TABLE thread_sessions
            ADD COLUMN IF NOT EXISTS session_id         TEXT,
            ADD COLUMN IF NOT EXISTS thread_id          TEXT,
            ADD COLUMN IF NOT EXISTS mode               TEXT        NOT NULL DEFAULT 'plan',
            ADD COLUMN IF NOT EXISTS model              TEXT        NOT NULL DEFAULT 'gpt-5-mini-2025-08-07',
            ADD COLUMN IF NOT EXISTS auto_confirm_tools BOOLEAN     NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW();
        """

        await self.execute(create_threads_table)
        await self.execute(ensure_threads_columns)
        await self.execute(drop_legacy_thread_controls)
        await self.execute(create_thread_sessions_table)
        await self.execute(ensure_thread_sessions_columns)
        await self.execute(create_messages_table)
        await self.execute(create_messages_index)
        await self.execute(create_thread_sessions_index)
        await self.execute(create_thread_sessions_session_id_unique)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_structured_fields(item: Any) -> dict[str, Any]:
        """Dispatch on the parsed ConversationItem type and pull out structured
        columns. Returns a flat dict whose keys match the message table columns.
        All values default to None so callers can unpack unconditionally.
        """
        f: dict[str, Any] = {
            "item_type": "unknown",
            "role": None,
            "content": None,
            "reasoning_summary": None,
            "encrypted_content": None,
            "tool_name": None,
            "call_id": None,
            "arguments": None,
            "tool_output": None,
        }

        if isinstance(item, UserMessage):
            f["item_type"] = "user_message"
            f["role"] = "user"
            f["content"] = item.content

        elif isinstance(item, AssistantMessage):
            f["item_type"] = "assistant_message"
            f["role"] = "assistant"
            f["content"] = item.full_text() or None

        elif isinstance(item, ReasoningItem):
            f["item_type"] = "reasoning"
            f["reasoning_summary"] = item.summary_text() or None
            f["encrypted_content"] = item.encrypted_content

        elif isinstance(item, FunctionCallItem):
            f["item_type"] = "function_call"
            f["tool_name"] = item.name
            f["call_id"] = item.call_id
            f["arguments"] = item.parsed_arguments()  # dict, serialised below

        elif isinstance(item, FunctionCallOutputItem):
            f["item_type"] = "function_call_output"
            f["call_id"] = item.call_id
            f["tool_output"] = item.output

        return f

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------
    async def save_thread(
        self,
        thread_id: str,
        state: ThreadState,
        user_id: str | None = None,
    ) -> None:
        upsert_thread = """
        INSERT INTO threads (
            thread_id, user_id, status,
            current_session_id, pending_tool_calls, detail, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (thread_id) DO UPDATE SET
            user_id             = COALESCE(threads.user_id, EXCLUDED.user_id),
            status              = EXCLUDED.status,
            current_session_id  = EXCLUDED.current_session_id,
            pending_tool_calls  = EXCLUDED.pending_tool_calls,
            detail              = EXCLUDED.detail,
            updated_at          = NOW();
        """

        upsert_thread_session = """
        INSERT INTO thread_sessions (
            session_id, thread_id, mode, model, auto_confirm_tools, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (session_id) DO UPDATE SET
            thread_id           = EXCLUDED.thread_id,
            mode                = EXCLUDED.mode,
            model               = EXCLUDED.model,
            auto_confirm_tools  = EXCLUDED.auto_confirm_tools,
            updated_at          = NOW();
        """

        get_saved_count = """
        SELECT COALESCE(MAX(position) + 1, 0) FROM messages WHERE thread_id = $1;
        """

        insert_message = """
        INSERT INTO messages (
            thread_id, position, item_type,
            role, content,
            reasoning_summary, encrypted_content,
            tool_name, call_id, arguments,
            tool_output,
            raw
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
        """

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    upsert_thread,
                    thread_id,
                    user_id,
                    state.status,
                    state.current_session_id,
                    _to_jsonb(state.pending_tool_calls),  # JSONB — must be str
                    state.detail,
                )

                if state.current_session_id:
                    if state.session_config is None:
                        raise ValueError(
                            f"session_config is required when current_session_id is set (thread={thread_id})"
                        )
                    mode_val = (
                        state.session_config.mode.value
                        if hasattr(state.session_config.mode, "value")
                        else state.session_config.mode
                    )
                    model_val = (
                        state.session_config.model.value
                        if hasattr(state.session_config.model, "value")
                        else state.session_config.model
                    )
                    await conn.execute(
                        upsert_thread_session,
                        state.current_session_id,
                        thread_id,
                        mode_val,
                        model_val,
                        state.session_config.auto_confirm_tools,
                    )

                already_saved: int = await conn.fetchval(get_saved_count, thread_id)
                new_items = state.conversation[already_saved:]

                if not new_items:
                    logger.debug("Save thread %s — no new items (total=%d)", thread_id, already_saved)
                    return

                rows: list[tuple] = []
                for position, raw_item in enumerate(new_items, start=already_saved):
                    try:
                        parsed = parse_conversation_item(raw_item)
                        f = self._extract_structured_fields(parsed)
                        raw_for_db = _to_jsonb(to_api_dict(parsed))  # JSONB — must be str
                    except Exception:
                        logger.warning(
                            "Unrecognised conversation item at position %d for thread %s: %s",
                            position,
                            thread_id,
                            raw_item,
                        )
                        f = {
                            "item_type": "unknown",
                            "role": None,
                            "content": None,
                            "reasoning_summary": None,
                            "encrypted_content": None,
                            "tool_name": None,
                            "call_id": None,
                            "arguments": None,
                            "tool_output": None,
                        }
                        raw_for_db = _to_jsonb(raw_item) if isinstance(raw_item, dict) else raw_item

                    rows.append(
                        (
                            thread_id,
                            position,
                            f["item_type"],
                            f["role"],
                            f["content"],
                            f["reasoning_summary"],
                            f["encrypted_content"],
                            f["tool_name"],
                            f["call_id"],
                            _to_jsonb(f["arguments"]),  # JSONB — must be str
                            f["tool_output"],
                            raw_for_db,
                        )
                    )

                await conn.executemany(insert_message, rows)

        logger.debug(
            "Saved thread %s — status=%s new=%d total=%d",
            thread_id,
            state.status,
            len(rows),
            len(state.conversation),
        )

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def load_thread(self, thread_id: str) -> ThreadState | None:
        """Reconstruct a ThreadState from the DB, including the full conversation.

        Conversation items are rebuilt from the `raw` JSONB column so the agent
        receives exactly the same dicts it stored, with no information loss.
        """
        fetch_thread = """
        SELECT
            t.status,
            t.current_session_id,
            t.pending_tool_calls,
            t.detail,
            s.mode,
            s.model,
            s.auto_confirm_tools
        FROM threads t
        LEFT JOIN thread_sessions s ON s.session_id = t.current_session_id
        WHERE t.thread_id = $1;
        """

        fetch_messages = """
        SELECT raw
        FROM messages
        WHERE thread_id = $1
        ORDER BY position ASC;
        """

        async with self.pool.acquire() as conn:
            thread_row = await conn.fetchrow(fetch_thread, thread_id)
            if not thread_row:
                return None
            message_rows = await conn.fetch(fetch_messages, thread_id)

        # asyncpg returns our pre-serialised JSONB values as strings — decode them.
        conversation: list[dict[str, Any]] = [_from_jsonb(row["raw"]) for row in message_rows]

        return ThreadState(
            status=thread_row["status"],
            session_config=_session_config_from_row(thread_row),
            current_session_id=thread_row["current_session_id"],
            pending_tool_calls=_from_jsonb(thread_row["pending_tool_calls"]),
            detail=thread_row["detail"],
            conversation=conversation,
        )

    async def get_thread_status(self, thread_id: str) -> dict[str, Any] | None:
        """Fetch only thread metadata — no conversation rows loaded."""
        query = """
        SELECT
            t.status,
            t.current_session_id,
            t.pending_tool_calls,
            t.detail,
            s.mode,
            s.model,
            s.auto_confirm_tools
        FROM threads t
        LEFT JOIN thread_sessions s ON s.session_id = t.current_session_id
        WHERE t.thread_id = $1;
        """

        row = await self.fetch_row(query, thread_id)
        if not row:
            return None

        result: dict[str, Any] = {
            "status": row["status"],
            "current_session_id": row["current_session_id"],
        }
        session_config = _session_config_dict(row)
        if session_config is not None:
            result["session_config"] = session_config
        if row["pending_tool_calls"] is not None:
            result["pending_tool_calls"] = _from_jsonb(row["pending_tool_calls"])
        if row["detail"] is not None:
            result["detail"] = row["detail"]
        return result

    async def get_thread_owner(self, thread_id: str) -> str | None:
        query = "SELECT user_id FROM threads WHERE thread_id = $1;"
        return await self.fetch_val(query, thread_id)

    async def set_thread_open_state(self, thread_id: str, user_id: str, is_open: bool) -> bool:
        query = """
        UPDATE threads
        SET is_open = $1, updated_at = NOW()
        WHERE thread_id = $2 AND user_id = $3
        RETURNING thread_id;
        """
        row = await self.fetch_row(query, is_open, thread_id, user_id)
        return row is not None

    async def get_thread_id_by_session(self, session_id: str) -> str | None:
        query = """
        SELECT thread_id
        FROM threads
        WHERE current_session_id = $1
        ORDER BY updated_at DESC
        LIMIT 1;
        """
        return await self.fetch_val(query, session_id)

    async def get_all_conversations(
        self,
        user_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Fetch all threads with their full conversation history.

        If user_id is provided, only returns threads belonging to that user.
        Each entry contains thread metadata plus a list of conversation items.
        """
        fetch_threads = """
        SELECT
            t.thread_id, t.user_id, t.is_open, t.status, t.current_session_id,
            t.pending_tool_calls, t.detail, t.created_at, t.updated_at,
            s.mode, s.model, s.auto_confirm_tools
        FROM threads t
        LEFT JOIN thread_sessions s ON s.session_id = t.current_session_id
        {where}
        ORDER BY t.updated_at DESC
        LIMIT $1 OFFSET $2;
        """

        fetch_messages = """
        SELECT thread_id, raw
        FROM messages
        WHERE thread_id = ANY($1)
        ORDER BY thread_id, position ASC;
        """

        if user_id is not None:
            query = fetch_threads.format(where="WHERE t.user_id = $3")
            thread_rows = await self.fetch(query, limit, offset, user_id)
        else:
            query = fetch_threads.format(where="")
            thread_rows = await self.fetch(query, limit, offset)

        if not thread_rows:
            return []

        thread_ids = [row["thread_id"] for row in thread_rows]
        message_rows = await self.fetch(fetch_messages, thread_ids)

        # Group messages by thread_id
        messages_by_thread: dict[str, list[Any]] = {tid: [] for tid in thread_ids}
        for row in message_rows:
            messages_by_thread[row["thread_id"]].append(_from_jsonb(row["raw"]))

        return [
            {
                "thread_id": row["thread_id"],
                "user_id": row["user_id"],
                "is_open": bool(row["is_open"]),
                "status": row["status"],
                "current_session_id": row["current_session_id"],
                "pending_tool_calls": _from_jsonb(row["pending_tool_calls"]),
                "detail": row["detail"],
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
                "conversation": messages_by_thread[row["thread_id"]],
                "session_config": _session_config_dict(row),
            }
            for row in thread_rows
        ]
