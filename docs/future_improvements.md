# Improvements

Things I'd change to make given more time.

---

## Security

Auth works but it's minimal. Single shared password, client picks their own `user_id` at login — anyone with the password can be anyone. The fix is per-user credentials with bcrypt so identity is server-asserted. Ideally `user_id` shouldn't appear in request bodies at all, just come from the token.

The SSE endpoint takes the token as a query param (`?auth_token=`) because EventSource can't set headers. That means tokens end up in server logs, browser history, proxy logs. Better approach: client exchanges its bearer token for a one-time short-lived ticket, passes the ticket in the URL instead. Ticket expires in seconds, single use.

No token refresh or revocation — once issued, a token is valid for 12 hours with no way to kill it early. Needs a refresh flow and a Redis-backed revocation list.

CORS is wide open — `allow_origins=["*"]` with `allow_credentials=True` in `main.py`. That's a known bad combo. Lock to actual frontend origin.

Other missing pieces: rate limiting (nothing on any endpoint — login with a shared password and no lockout is especially bad), HSTS/CSP headers, audit logging for file mutations and login attempts.

---

## Scalability & Resilience

There is Postgres and Redis connection pools, semaphores on OpenAI calls, Redis-based session locking, SSE heartbeats, frontend reconnect with backoff. But a lot of the standard resilience patterns are missing:

**Timeouts** — no timeout on OpenAI calls, DB queries, or Redis ops. If upstream hangs, the worker hangs. Needs `asyncio.wait_for()` wrappers.

**Retries** — no retry on transient failures anywhere. Connection reset from Postgres or a 5xx from OpenAI just fails immediately. Add `tenacity` with backoff + jitter on idempotent operations.

**Circuit breaker** — if OpenAI is down, we keep sending requests. Should track failure rate and stop calling after a threshold, probe periodically to recover.

**Rate limiting** — nothing. Need Redis sliding window, different limits per endpoint class.

**Redis reconnect** — if Redis drops, the system is dead until restart. Need auto-reconnect with backoff.

**Frontend gaps:**
- No request dedup — rapid tab switches can fire duplicate fetches. Track in-flight requests by key, return the existing promise.
- No debouncing
- No React Error Boundaries — a render crash in one component takes down the whole app.
- No fetch timeouts — `AbortController` should be standard on all API calls.

**DB** — pool sizes are hardcoded (min=2, max=10). Should be configurable. No `statement_timeout` set. At scale, PgBouncer for connection multiplexing.

---

## Versioning & Deployment

Right now no Docker, no CI, no versioning.

**Docker** — needs a Dockerfile per service and a `docker-compose.yml` with Postgres + Redis so anyone can `docker compose up` and have a working environment.

**CI/CD** — no pipeline at all. GitHub Actions with lint, type check, tests on PR. Build verification. Deploy on merge.

**API versioning** — endpoints are under `/api/` with no version prefix. Should be `/api/v1/` so breaking changes can live under `/api/v2/`.

---

## Unified Data Models

Backend has Pydantic models, frontend has TypeScript interfaces, and they're manually kept in sync. When a backend field changes, the frontend doesn't know until something breaks at runtime. The `as T` casts in the frontend API layer mean there's zero validation — a mismatched response just silently propagates.

FastAPI generates an OpenAPI spec from Pydantic for free. The move is to export that spec and run `openapi-typescript` to auto-generate the frontend types. One source of truth, types always in sync, run it in CI.

Some backend models also need tightening — things like `pending_tool_calls: list[dict[str, Any]]` and `data: dict[str, Any]` in `StreamEvent` should be proper typed models so the OpenAPI spec actually describes what gets sent.

---

## Testing

There are no tests. No files, no config, nothing on either side.

What I'd set up:
- **Backend** — pytest + httpx. Unit tests for the pure stuff (path normalization, token signing, event construction). Integration tests hitting actual routes with test-scoped Postgres/Redis — auth flows, chat lifecycle, workspace CRUD, user isolation. Agent loop tests with mocked OpenAI.
- **Frontend** — Vitest + Testing Library. Component tests for the main panels, hook tests for the reducer logic in `useChatController` / `useWorkspaceController` (most complex code, most likely to regress), API client tests with mocked fetch.
- **E2E** — Playwright. Login through chat through workspace, happy path.

---

## Observability

Right now there's minimal logging — `logging.basicConfig()` with scattered info/error calls, and not great error catching across the codebase. A lot of failures can happen silently or with generic messages that don't help you figure out what went wrong + logs are currently inconsistent.

**Centralized logger** — wrap logging behind my own class so every service imports that instead of `logging` directly. Swapping the underlying library (plain text → structured JSON, switching providers) is a one-file change instead of touching every module. Wrapper also handles attaching context (request ID, user ID) automatically.

**Request correlation** — middleware generates a unique ID per request, stashes it in the logger context, returns it in `X-Request-Id`. One ID traces a request through API → service → DB → Redis → agent.

**Error alerting** — need alerts on errors/spikes. Could be a logging handler that fires a webhook on ERROR, or a metrics-based alert rule.

**Metrics** — Prometheus-compatible: request latency by endpoint, error rates, active SSE connections, agent loop duration, pool utilization, OpenAI token usage.

**Health checks** — `/health` returns a static OK without checking anything. Split into `/health/live` (am I running) and `/health/ready` (can I reach Postgres and Redis).
