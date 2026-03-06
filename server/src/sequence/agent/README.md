# Agent System

## Threads & Sessions

A **thread** (`thread_id`) is a full conversation with persistent message history. A **session** (`session_id`) is a single request-response cycle within a thread — created each time the user sends a message or submits tool confirmations. Each session has its own Redis event stream consumed by the frontend via SSE.

## Agent Routing

The `AgentRouter` dispatches to the correct `LLMAgent` subclass (`PlanAgent` or `ChatAgent`) based on the `AgentMode` sent with each request. Both are thin subclasses that pull their system prompt, tool directories, and auto-execute list from `AgentRuntimeConfig` in `core/config.py`.

## Tools

### Writing a tool

Tools are plain functions in modules named `*_tools.py` inside the configured `tool_dirs`. The registry auto-discovers them at startup.

```python
# sequence/agent/tools/example_tools.py

async def my_tool(
    query: str,
    limit: int = 5,
    tool_helper: ToolHelper = None,  # injected at runtime, hidden from LLM
) -> str:
    """
    Short description shown to the LLM.

    Args:
        query: What to search for.
        limit: Max results (1-20).
    """
    return json.dumps(await tool_helper.vector_db.search(query, k=limit))
```

- Type annotations generate the JSON schema automatically.
- Docstring first paragraph = tool description, `Args:` = parameter descriptions.
- Parameters matching `dependencies` keys (e.g. `tool_helper`) are injected at call time and excluded from the schema.

### Tool approval

When `auto_confirm_tools` is `false` (default), the agent pauses on tool calls and returns them as `pending_tool_calls` with status `AWAITING_CONFIRMATION`. The frontend must collect approve/deny decisions for **all** pending calls, then send them as a `confirmations` map (`{ call_id: true/false }`) which starts a new session.

Some tools skip approval and execute immediately — configured per mode via `auto_execute_tools` in `core/config.py`:

```python
AgentMode.PLAN:  auto_execute_tools=("create_plan", "ask_user_question")
AgentMode.CHAT:  auto_execute_tools=("ask_user_question",)
```

These are tools that don't perform irreversible actions (they just structure output for the frontend).

If the LLM calls auto-execute tools alongside approval-required tools in the same turn, the auto-execute tools run immediately and the rest pause for confirmation.

