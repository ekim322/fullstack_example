# LLM Streaming & Tool Execution

How the LLM integration works, trade-offs around tool confirmation batching, and latency considerations.

---

## Streaming architecture

```
┌────────┐ POST /api/chat ┌────────┐ spawn task  ┌────────────┐
│        │───────────────▶│ Server │────────────▶│ Agent Loop │──▶ PostgreSQL
│        │◀─{session_id}──│        │             │ (LLM+tools)│
│        │                └────────┘             └─────┬──────┘
│ Client │                                       XADD  │
│        │  GET /events   ┌────────┐  XREAD    ┌───────▼──────┐
│        │───────────────▶│ Server │◀──────────│ Redis Stream │
│        │◀───── SSE ─────│  (SSE) │           │ (persistent) │
└────────┘                └────────┘           └──────────────┘
```

- Frontend connects via SSE, reads from the Redis Stream with `last_id` for resume support
- If the client disconnects and reconnects, it picks up exactly where it left off since events persist in Redis

Why Redis Stream in the middle instead of streaming directly from the agent?
- Agent and SSE reader are decoupled. If the client disconnects, the agent keeps running and pushing events to Redis.
- Reconnect is deterministic. Client resumes from `last_id` with no lost events.
- Stream state is out-of-process. On reconnect, a different worker can still serve the same session stream.

---

## Streaming smoothness (naive vs robust)

Naive streaming implementations often do one full UI update per incoming token event, plus frequent persistence writes. That works at low volume, but as token rate and transcript size grow, tiny costs stack up and the stream can feel choppy.

Why the naive approach feels rough:
- One reducer dispatch per token/delta creates repeated render and state-copy work.
- Writing full session payloads to `localStorage` during streaming blocks the browser main thread (`localStorage` is synchronous).
- Larger Redis `XREAD` catch-up batches (`count=50`) make resumed delivery look bursty when the consumer falls behind.

What was changed to keep streaming smooth:
- Batch SSE events before reducer application (`requestAnimationFrame` + short timeout fallback) instead of one action per event.
- Apply stream events in reducer batches, and collapse consecutive delta log entries to reduce churn.
- Throttle active-session store sync during `running`, and defer `localStorage` persistence until not running.
- Tune Redis stream reads for SSE to smaller chunks (`count=10`) with shorter block intervals.

Result: same semantics, smoother token rendering, and less visible jitter under load.

---

## Tool confirmation batching

When the LLM returns multiple tool calls in one turn (parallel tool calls), the current flow is:
- Auto-execute tools (like `ask_user_question`) run immediately
- Manual tools pause the agent and wait for the user to approve/decline each one
- User has to submit decisions for **all** pending tool calls before any of them execute
- Once all decisions are in, approved tools run sequentially, declined ones return a "declined by user" message to the LLM

This is a simplicity trade-off. Ideally each tool should execute as soon as the user approves it, not wait for the full batch. Right now if there are 3 pending tools and you approve the first one, nothing happens until you've decided on all 3. Would need to rework the confirmation flow to support partial submissions — agent resumes with whatever's been decided, re-pauses if there are still pending calls.

---

## Conversation history

Full conversation history is sent to the LLM on every call. No sliding window, no summarization, no truncation. See [Database README](../server/src/sequence/database/README.md) for how conversations are saved and reconstructed.

---

## Time to first token / latency

TTFT is inconsistent and there's room to improve.

**OpenAI store param** — currently set to `store: False` because I wanted to manage conversation state myself. OpenAI can store conversations on their end and that might improve prompt caching / latency, but I haven't experimented with it. Unclear how long they keep it, and I wanted my own copies of everything in Postgres/Redis so I'm not dependent on their retention policy.

**Prompt caching** — OpenAI's prompt caching is automatic (1024+ token prompts, exact prefix match), so it's already happening to some degree. But I haven't optimized for cache hit rate. Things that would help: making sure the tools array order is deterministic across requests, keeping the system prompt free of anything dynamic, and potentially adding `prompt_cache_key` for per-conversation routing so requests hit the same GPU.

**Other latency factors:**
- Every event goes through Redis before reaching the client (necessary for reconnect support, but adds a hop)
- Tool execution is sequential, not parallel — if the LLM returns 3 tool calls, they run one at a time
- No conversation summarization means later turns process a lot of tokens

---

## Reasoning

When reasoning is enabled, the LLM returns `encrypted_content` that gets passed back verbatim on the next turn. This lets the model reference its own reasoning without re-computing it. Reasoning effort is configurable (low/medium/high).
