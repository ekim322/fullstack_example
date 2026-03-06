# Tools

How the LLM tools work and why they're built this way. For more on the agent system itself (routing, tool registry, approval flow), see the [Agent README](../server/src/sequence/agent/README.md).

---

## ask_user_question

LLM calls `ask_user_question` with a question, options, and optional descriptions. Tool returns a JSON payload streamed to the frontend, which renders interactive buttons (single/multi-select) + optional free-text. User submits, response goes back as a regular user message, LLM continues.

Two ways to do this:
- **Option 1 (chose this):** Tool returns the question, user responds as a new message. Simple — tool just returns and the answer is a normal message in the conversation. This is how other providers handle it too.
- **Option 2:** Tool call blocks until user answers, answer injected into the tool result. More complex — need to handle timeouts, hold state while waiting. Not worth it.

If multiple questions are pending at once, the frontend batches them — waits for all responses, sends one combined message.

---

## create_plan

Plan mode uses `create_plan` to output structured steps and substeps. The tool also saves the plan JSON to the workspace under `/PLANS` and returns the saved file path. After the plan is returned, user can request edits in their next message and the LLM regenerates.

Same trade-off as above — could've had the user confirm/edit before the tool result returns (blocking), but conversational back-and-forth is simpler and works fine.

---

## Why tool calls instead of structured output

Both `ask_user_question` and `create_plan` could've been structured output (force the LLM to respond in a specific JSON schema). But that means injecting the conversation into a separate LLM call with the schema constraint — extra API call, extra latency, context loss. Tool calls get schema-validated arguments anyway, and they happen inline in the same completion. Simpler, cheaper.

---

## Workspace tools

`read_file`, `write_file`, `edit_file`, `list_directory`, `create_folder`, `delete_file`, `delete_folder`, `read_folder` — per-user filesystem for the LLM.

- Files aren't on disk — they're rows in Postgres (`workspace_nodes` table). Mimics a filesystem with paths and folders but it's all DB-backed.
- Reason: wanted to deploy on the cloud where free tiers don't give reliable persistent local storage. Postgres is always there and user isolation is straightforward (`user_id` on every query).
- Trade-off: these aren't real files on the machine. A `.py` file in the workspace is just text in a row.
- Tools get `user_id` and `workspace_service` injected via context vars through `tool_helper`. LLM never sees these params — `ToolRegistry` strips them from the schema.

---

## execute_python_file

Runs a workspace Python file in a subprocess:
- Creates a temp directory, copies sibling files from the same workspace folder (so imports work)
- Runs with 30s timeout, returns stdout on success / stderr on failure, both capped at 20KB

Known limitations:
- Because files live in Postgres, the script can't access files in other workspace folders — only siblings copied into the temp dir
- No return value, just stdout capture. LLM needs to use `print()` to see output
- Switching workspace storage to local disk would fix both, but haven't done it because of the free tier cloud deployment constraint
