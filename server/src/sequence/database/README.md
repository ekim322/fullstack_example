# Database

## Overview

PostgreSQL for durable chat history and workspace file storage, with Redis as a caching/streaming layer. The chat database uses three tables (`threads`, `thread_sessions`, `messages`) and stores both structured columns for querying and raw JSONB for lossless round-trip reconstruction. The files database uses a single `workspace_nodes` table for a virtual filesystem scoped per user.


## Schema

```
┌───────────────────────────┐     ┌──────────────────────────┐
│ threads                   │     │ thread_sessions          │
├───────────────────────────┤     ├──────────────────────────┤
│ thread_id      TEXT  PK   │◀──┐ │ session_id    TEXT  PK   │
│ user_id        TEXT       │   └─│ thread_id     TEXT  FK   │
│ is_open        BOOLEAN    │     │ mode          TEXT       │
│ status         TEXT       │     │ model         TEXT       │
│ current_session_id TEXT   │     │ auto_confirm_tools BOOL  │
│ pending_tool_calls JSONB  │     │ created_at    TIMESTAMPTZ│
│ detail         TEXT       │     │ updated_at    TIMESTAMPTZ│
│ created_at     TIMESTAMPTZ│     └──────────────────────────┘
│ updated_at     TIMESTAMPTZ│
└────────────┬──────────────┘
             │
             │ 1:N
             ▼
┌──────────────────────────────┐
│ messages                     │
├──────────────────────────────┤
│ id               BIGSERIAL   │
│ thread_id        TEXT    FK  │
│ position         INTEGER     │  ◀── UNIQUE(thread_id, position)
│ item_type        TEXT        │
│ role             TEXT        │  ── user_message / assistant_message
│ content          TEXT        │
│ reasoning_summary TEXT       │  ── reasoning
│ encrypted_content TEXT       │
│ tool_name        TEXT        │  ── function_call
│ call_id          TEXT        │
│ arguments        JSONB       │
│ tool_output      TEXT        │  ── function_call_output
│ raw              JSONB       │  ◀── full original item
│ created_at       TIMESTAMPTZ │
└──────────────────────────────┘
```

## Threads & Sessions

A **thread** is a full conversation. A **session** is one request-response cycle within it (created each time the user sends a message or submits tool confirmations).

- `thread_id` — UUID hex, never changes, scoped to a `user_id`
- `session_id` — UUID hex, one per agent execution, references a thread
- `threads.current_session_id` — points to the active session (null when idle)
- `threads.is_open` — whether the user has the thread open or closed in the UI. Toggled via `set_thread_open_state`, scoped to the owning `user_id`
- `thread_sessions` — records every session's config (mode, model, auto_confirm_tools)

## Thread Status

| Status | Meaning |
|---|---|
| `running` | Agent is actively processing |
| `complete` | Session finished successfully |
| `awaiting_confirmation` | Waiting for user to approve/deny tool calls |
| `stopped` | User cancelled the session |
| `error` | Agent encountered an error (`detail` has the message) |

## Message Types (`item_type`)

All messages store the full original dict in `raw` (JSONB) for perfect reconstruction. Structured columns are extracted for queryability.

| `item_type` | Structured columns used | Source model |
|---|---|---|
| `user_message` | `role`, `content` | `UserMessage` |
| `assistant_message` | `role`, `content` | `AssistantMessage` (content joined from text blocks) |
| `reasoning` | `reasoning_summary`, `encrypted_content` | `ReasoningItem` |
| `function_call` | `tool_name`, `call_id`, `arguments` | `FunctionCallItem` |
| `function_call_output` | `call_id`, `tool_output` | `FunctionCallOutputItem` |
| `unknown` | *(none)* | Unrecognized items — `raw` still preserved |

Models defined in `models/chat_messages.py`. Parsing via `parse_conversation_item(raw)` which dispatches on `role` (for user messages) vs `type` (for everything else).

## Save & Load

**Saving** (`save_thread`):
1. Upsert thread metadata + session config in a transaction
2. Query `max(position)` to find what's already persisted
3. Insert only new messages (position-based partial save)
4. Each message stores structured fields + full `raw` JSONB

**Loading** (`load_thread`):
1. JOIN `threads` + `thread_sessions` for metadata
2. Query messages ordered by `position ASC`
3. Reconstruct conversation from `raw` column — structured columns are never used for loading

This means the structured columns are write-only from the app's perspective — they exist for direct SQL queries, debugging, and future analytics.

## Redis Caching

Thread state is cached in Redis (TTL 3600s) as a fast-path before hitting PostgreSQL. Pattern:

```
Redis miss → load from PostgreSQL → warm Redis cache
```

Session-to-thread mappings and event streams also live in Redis. See `services/chat_service.py` for caching logic.

## Workspace Files (`files_db.py`)

`FilesDB` provides a virtual filesystem stored in the `workspace_nodes` table, scoped per `user_id`.

```
┌──────────────────────────────────┐
│ workspace_nodes                  │
├──────────────────────────────────┤
│ id               BIGSERIAL  PK   │
│ user_id          TEXT            │
│ path             TEXT            │  ◀── UNIQUE(user_id, path)
│ parent_path      TEXT            │
│ name             TEXT            │
│ node_type        TEXT            │  ── 'file' | 'folder'
│ content_text     TEXT            │  ── file content (NULL for folders)
│ size_bytes       BIGINT          │
│ version          INTEGER         │  ── optimistic concurrency
│ created_at       TIMESTAMPTZ     │
│ updated_at       TIMESTAMPTZ     │
└──────────────────────────────────┘
```

- Nodes are either files or folders, enforced by CHECK constraints (folders must have NULL content and 0 size)
- Path validation ensures well-formed POSIX-style paths (no root node stored, `/` is implicit)
- `version` enables optimistic concurrency — `upsert_text_file` accepts an `expected_version` parameter and raises `ValueError` on conflict
- `create_folder` is idempotent (returns existing folder if already present)
- `delete_folder` supports recursive and non-recursive modes

## Source Files

| File | Purpose |
|---|---|
| `pg_base.py` | Async `asyncpg` pool wrapper with query helpers (`fetch`, `execute`, `transaction`, etc.) |
| `chat_db.py` | Chat schema, CRUD operations, structured field extraction |
| `files_db.py` | Workspace virtual filesystem — per-user file and folder CRUD with versioning |
