# Features

Key capabilities of the app. Not exhaustive — covers the major ones.

## Chat

### Streaming

- Streaming responses with reasoning tokens shown separately
- Ff the client disconnects, reconnecting picks up where it left off (even if it hits a different worker). Events live in Redis, not in-process memory
- Automatic reconnection with exponential backoff, session status sync on reconnect. See [LLM Streaming](llm_stream.md) for architecture details

### Rendering

- Collapsible rendering for reasoning and tool calls
- Interactive `ask_user_question` UI — selectable options (single/multi), descriptions, free-text. Multiple pending questions are batched into one response
- `create_plan` renders structured steps/sub-steps, saved to workspace under `/PLANS`

### Controls

- Tool approval — all tools except `ask_user_question` and `create_plan` require user confirmation by default. Auto-confirm toggle skips approval for all tools
- Two agent modes: **Plan** and **Chat**
- Model selection: GPT 5.2, GPT 5 mini
- Chat thread history — threads persist server-side, restored on reload
- Stop button to cancel a running session

## Workspace

Per-user virtual filesystem backed by Postgres (`workspace_nodes` table) — files are DB rows, not files on disk. See [Database](../server/src/sequence/database/README.md) for schema details.

- File tree with expand/collapse, auto-refreshes after agent tool use
- Text editor with optimistic-concurrency saves and conflict detection
- File/folder create, rename, delete
- Upload files or folders (1 MiB per-file limit, text only)
- File hyperlinks — tool results for workspace tools include clickable paths that open the file in the editor
- Agent file notifications — if the agent writes/edits an open file, the editor reloads it. If the agent deletes an open file, it closes with a notice

## Tools

See [Tool Design](tools.md) for implementation details and [Agent System](../server/src/sequence/agent/README.md) for the tool registry and approval flow.

| Tool | Description |
|------|-------------|
| `read_file` | Read a workspace file |
| `write_file` | Create or overwrite a file |
| `edit_file` | Targeted edits to an existing file |
| `list_directory` | List folder contents |
| `read_folder` | Read all files in a folder |
| `create_folder` | Create a folder |
| `delete_file` | Delete a file |
| `create_plan` | Structured plan with steps/sub-steps, saved to `/PLANS` |
| `ask_user_question` | Interactive question with options and free-text |
| `execute_python_file` | Run a `.py` file (30s timeout, stdout capture, sibling files copied to temp dir) |

## Auth

- Username/password login, JWT token
- Session stored in `sessionStorage`, validated on load
- Global session invalidation on 401/403 — streams close, UI returns to login
