import { DEFAULT_CHAT_CONTROLS } from "../config";
import type {
  AgentMode,
  ChatMessage,
  ChatModel,
  ChatState,
  StreamEvent,
  StreamLogEntry,
  ThreadStatusResponse,
  ToolCall,
} from "../types";
import { normalizeSessionStatus } from "./sessionStatus";

type StreamBatchEntry = {
  sessionId: string;
  entryId: string;
  event: StreamEvent;
};

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function initialChatState(): ChatState {
  return {
    threadId: null,
    sessionId: null,
    lastEventId: "0-0",
    status: "idle",
    draft: "",
    messages: [],
    pendingToolCalls: [],
    decisionByCallId: {},
    toolCalls: [],
    streamLog: [],
    controls: { ...DEFAULT_CHAT_CONTROLS },
    activeConfig: null,
    error: null,
  };
}

function appendAssistantDelta(messages: ChatMessage[], delta: string): ChatMessage[] {
  const last = messages[messages.length - 1];
  const canAppendToLastAssistant =
    last &&
    last.role === "assistant" &&
    (last.kind === undefined || last.kind === "response");

  if (!canAppendToLastAssistant) {
    return [...messages, { id: makeId(), role: "assistant", kind: "response", content: delta }];
  }

  const next = { ...last, content: `${last.content}${delta}` };
  return [...messages.slice(0, -1), next];
}

function appendReasoningDelta(messages: ChatMessage[], delta: string): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || last.kind !== "reasoning") {
    return [...messages, { id: makeId(), role: "assistant", kind: "reasoning", content: delta }];
  }

  const next = { ...last, content: `${last.content}${delta}` };
  return [...messages.slice(0, -1), next];
}

function appendToolResultMessage(
  messages: ChatMessage[],
  callId: string,
  name: string,
  output: string,
  declined: boolean,
): ChatMessage[] {
  return [
    ...messages,
    {
      id: makeId(),
      role: "assistant",
      kind: "tool_result",
      toolCallId: callId,
      name,
      content: output,
      declined,
    },
  ];
}

function appendToolCallMessage(
  messages: ChatMessage[],
  callId: string,
  name: string,
  rawArgs: string,
): ChatMessage[] {
  let argsBlock = rawArgs;
  try {
    const parsed = JSON.parse(rawArgs);
    argsBlock = JSON.stringify(parsed, null, 2);
  } catch {
    // Keep original string when arguments are not valid JSON.
  }

  return [
    ...messages,
    {
      id: makeId(),
      role: "assistant",
      kind: "tool_call",
      toolCallId: callId,
      name,
      content: argsBlock,
    },
  ];
}

function appendMissingPendingToolCalls(
  messages: ChatMessage[],
  pendingCalls: ToolCall[],
  knownCalls: ToolCall[],
): ChatMessage[] {
  const knownIds = new Set(knownCalls.map((call) => call.call_id));
  let next = messages;

  pendingCalls.forEach((call) => {
    if (knownIds.has(call.call_id)) {
      return;
    }

    next = appendToolCallMessage(next, call.call_id, call.name, call.arguments);
  });

  return next;
}

function summarizeEvent(event: StreamEvent): string {
  if (event.type === "text_delta" || event.type === "reasoning_delta") {
    return event.data.delta ?? "";
  }

  if (event.type === "tool_call") {
    const name = event.data.name ?? "unknown_tool";
    const callId = event.data.call_id ?? "unknown_call";
    const args = event.data.arguments ?? "{}";
    return `event=tool_call name=${name} call_id=${callId}\narguments: ${args}`;
  }

  if (event.type === "tool_result") {
    const name = event.data.name ?? "unknown_tool";
    const callId = event.data.call_id ?? "unknown_call";
    const declined = event.data.declined ?? false;
    const output = event.data.output ?? "";
    const status = declined ? "declined" : "completed";
    return `event=tool_result name=${name} call_id=${callId} status=${status}\noutput: ${output}`;
  }

  const reason = event.data.reason ?? "unknown";
  const detail = event.data.detail ?? "";
  return detail ? `event=done reason=${reason}\ndetail: ${detail}` : `event=done reason=${reason}`;
}

function appendStreamLog(log: StreamLogEntry[], entryId: string, event: StreamEvent): StreamLogEntry[] {
  const text = summarizeEvent(event);
  const last = log[log.length - 1];
  const isDelta = event.type === "text_delta" || event.type === "reasoning_delta";

  // Collapse consecutive deltas into a single rolling log entry.
  if (isDelta && last && last.type === event.type) {
    return [
      ...log.slice(0, -1),
      {
        ...last,
        entryId,
        text,
        ts: event.ts,
      },
    ];
  }

  const next = [
    ...log,
    {
      id: makeId(),
      entryId,
      type: event.type,
      text,
      ts: event.ts,
    },
  ];

  return next.length > 500 ? next.slice(next.length - 500) : next;
}

type Action =
  | { type: "setDraft"; value: string }
  | { type: "setMode"; value: AgentMode }
  | { type: "setModel"; value: ChatModel }
  | { type: "setAutoConfirm"; value: boolean }
  | { type: "sendStarted"; message: string }
  | { type: "sessionStarted"; threadId: string; sessionId: string }
  | { type: "sessionStopped" }
  | { type: "streamEvent"; sessionId: string; entryId: string; event: StreamEvent }
  | { type: "streamEventsBatch"; entries: StreamBatchEntry[] }
  | { type: "setDecision"; callId: string; approved: boolean }
  | { type: "confirmStarted" }
  | { type: "setError"; error: string }
  | { type: "syncStatus"; status: ThreadStatusResponse }
  | { type: "hydrate"; state: ChatState };

export type ChatAction = Action;

function applyStreamEvent(state: ChatState, entryId: string, event: StreamEvent): ChatState {
  const nextState: ChatState = {
    ...state,
    lastEventId: entryId,
    streamLog: appendStreamLog(state.streamLog, entryId, event),
  };

  if (event.type === "text_delta") {
    const delta = event.data.delta ?? "";
    return {
      ...nextState,
      messages: appendAssistantDelta(state.messages, delta),
    };
  }

  if (event.type === "reasoning_delta") {
    const delta = event.data.delta ?? "";
    return {
      ...nextState,
      messages: appendReasoningDelta(state.messages, delta),
    };
  }

  if (event.type === "tool_call") {
    const name = event.data.name ?? "";
    const callId = event.data.call_id ?? "";
    const rawArgs = event.data.arguments ?? "{}";
    const call: ToolCall = {
      name,
      call_id: callId,
      arguments: rawArgs,
    };

    return {
      ...nextState,
      messages: appendToolCallMessage(state.messages, callId, name, rawArgs),
      toolCalls: [...state.toolCalls, call],
    };
  }

  if (event.type === "tool_result") {
    const name = event.data.name ?? "";
    const callId = event.data.call_id ?? "";
    const output = event.data.output ?? "";
    const declined = event.data.declined ?? false;

    return {
      ...nextState,
      messages: appendToolResultMessage(state.messages, callId, name, output, declined),
    };
  }

  if (event.type === "done") {
    const reason = event.data.reason;

    if (reason === "awaiting_confirmation") {
      const pending = event.data.pending_tool_calls ?? [];
      return {
        ...nextState,
        status: "awaiting_confirmation",
        pendingToolCalls: pending,
        decisionByCallId: {},
      };
    }

    if (reason === "error") {
      return {
        ...nextState,
        status: "error",
        activeConfig: null,
        pendingToolCalls: [],
        decisionByCallId: {},
        error: event.data.detail ?? "The session failed.",
      };
    }

    return {
      ...nextState,
      status: "complete",
      activeConfig: null,
      pendingToolCalls: [],
      decisionByCallId: {},
      error: null,
    };
  }

  return state;
}

export function chatReducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "hydrate":
      return action.state;

    case "setDraft":
      return { ...state, draft: action.value };

    case "setMode":
      if (state.activeConfig) {
        return state;
      }
      return { ...state, controls: { ...state.controls, mode: action.value } };

    case "setModel":
      if (state.activeConfig) {
        return state;
      }
      return { ...state, controls: { ...state.controls, model: action.value } };

    case "setAutoConfirm":
      if (state.activeConfig) {
        return state;
      }
      return {
        ...state,
        controls: { ...state.controls, autoConfirmTools: action.value },
      };

    case "sendStarted":
      return {
        ...state,
        status: "running",
        draft: "",
        error: null,
        lastEventId: "0-0",
        pendingToolCalls: [],
        decisionByCallId: {},
        toolCalls: [],
        activeConfig: { ...state.controls },
        streamLog: [],
        messages: [...state.messages, { id: makeId(), role: "user", content: action.message }],
      };

    case "sessionStarted":
      return {
        ...state,
        threadId: action.threadId,
        sessionId: action.sessionId,
        status: "running",
        error: null,
        lastEventId: "0-0",
      };

    case "sessionStopped":
      return {
        ...state,
        status: "complete",
        activeConfig: null,
        pendingToolCalls: [],
        decisionByCallId: {},
        error: null,
      };

    case "streamEvent":
      if (state.sessionId !== action.sessionId) {
        return state;
      }
      return applyStreamEvent(state, action.entryId, action.event);

    case "streamEventsBatch": {
      if (action.entries.length === 0) {
        return state;
      }

      let nextState = state;
      action.entries.forEach(({ sessionId, entryId, event }) => {
        if (nextState.sessionId !== sessionId) {
          return;
        }
        nextState = applyStreamEvent(nextState, entryId, event);
      });
      return nextState;
    }

    case "setDecision":
      return {
        ...state,
        decisionByCallId: {
          ...state.decisionByCallId,
          [action.callId]: action.approved,
        },
      };

    case "confirmStarted":
      return {
        ...state,
        status: "running",
        error: null,
        streamLog: [],
        pendingToolCalls: [],
        decisionByCallId: {},
        messages: appendMissingPendingToolCalls(
          state.messages,
          state.pendingToolCalls,
          state.toolCalls,
        ),
        toolCalls: [
          ...state.toolCalls,
          ...state.pendingToolCalls.filter(
            (call) => !state.toolCalls.some((existing) => existing.call_id === call.call_id),
          ),
        ],
      };

    case "syncStatus": {
      const normalizedStatus = normalizeSessionStatus(action.status.status);
      const serverControls = action.status.session_config
        ? {
            mode: action.status.session_config.mode,
            model: action.status.session_config.model,
            autoConfirmTools: action.status.session_config.auto_confirm_tools,
          }
        : state.controls;

      if (normalizedStatus === "awaiting_confirmation") {
        return {
          ...state,
          threadId: action.status.thread_id,
          status: "awaiting_confirmation",
          sessionId: action.status.current_session_id,
          controls: serverControls,
          activeConfig: serverControls,
          pendingToolCalls: action.status.pending_tool_calls ?? [],
          decisionByCallId: {},
          error: null,
        };
      }

      if (normalizedStatus === "running") {
        return {
          ...state,
          threadId: action.status.thread_id,
          status: "running",
          sessionId: action.status.current_session_id,
          controls: serverControls,
          activeConfig: serverControls,
          pendingToolCalls: [],
          decisionByCallId: {},
          error: null,
        };
      }

      return {
        ...state,
        threadId: action.status.thread_id,
        status: normalizedStatus,
        controls: serverControls,
        activeConfig: null,
        sessionId: action.status.current_session_id,
        pendingToolCalls: [],
        decisionByCallId: {},
        error:
          normalizedStatus === "error"
            ? (action.status.detail ?? state.error ?? "The session failed.")
            : null,
      };
    }

    case "setError":
      return {
        ...state,
        status: "error",
        activeConfig: null,
        error: action.error,
      };

    default:
      return state;
  }
}
