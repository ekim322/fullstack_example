import { DEFAULT_CHAT_CONTROLS } from "../config";
import { parseAssistantText, parseReasoningSummary } from "./contentParsers";
import {
  type ChatControls,
  type ChatMessage,
  type ChatSessionSummary,
  type ChatState,
  type ServerThreadHistory,
  type ToolCall,
} from "../types";
import { isAgentMode, isChatModel } from "../utils/chatControlGuards";
import {
  isRunningSessionStatus,
  isSessionActiveStatus,
  normalizeSessionStatus,
} from "./sessionStatus";

export type LocalSessionRecord = {
  id: string;
  label: string;
  updatedAt: number;
  isOpen: boolean;
  state: ChatState;
};

export type PersistedStore = {
  version: 1;
  activeSessionId: string;
  order: string[];
  sessions: Record<string, LocalSessionRecord>;
};

function normalizeControls(rawControls: unknown): ChatControls {
  if (!rawControls || typeof rawControls !== "object") {
    return { ...DEFAULT_CHAT_CONTROLS };
  }

  const candidate = rawControls as Partial<ChatControls>;
  return {
    mode: isAgentMode(candidate.mode) ? candidate.mode : DEFAULT_CHAT_CONTROLS.mode,
    model: isChatModel(candidate.model) ? candidate.model : DEFAULT_CHAT_CONTROLS.model,
    autoConfirmTools:
      typeof candidate.autoConfirmTools === "boolean"
        ? candidate.autoConfirmTools
        : DEFAULT_CHAT_CONTROLS.autoConfirmTools,
  };
}

function normalizeState(rawState: unknown, createInitialState: () => ChatState): ChatState {
  const initial = createInitialState();

  if (!rawState || typeof rawState !== "object") {
    return initial;
  }

  const candidate = rawState as Partial<ChatState>;

  const threadId = typeof candidate.threadId === "string" || candidate.threadId === null
    ? candidate.threadId
    : null;

  const sessionId = typeof candidate.sessionId === "string" || candidate.sessionId === null
    ? candidate.sessionId
    : null;

  const status = normalizeSessionStatus(
    typeof candidate.status === "string" ? candidate.status : initial.status,
  );

  return {
    ...initial,
    ...candidate,
    status,
    threadId,
    sessionId,
    messages: Array.isArray(candidate.messages) ? candidate.messages : initial.messages,
    pendingToolCalls: Array.isArray(candidate.pendingToolCalls) ? candidate.pendingToolCalls : initial.pendingToolCalls,
    decisionByCallId:
      candidate.decisionByCallId && typeof candidate.decisionByCallId === "object"
        ? (candidate.decisionByCallId as Record<string, boolean>)
        : initial.decisionByCallId,
    toolCalls: Array.isArray(candidate.toolCalls) ? candidate.toolCalls : initial.toolCalls,
    streamLog: Array.isArray(candidate.streamLog) ? candidate.streamLog : initial.streamLog,
    controls: normalizeControls(candidate.controls),
    activeConfig:
      isSessionActiveStatus(status)
        ? (candidate.activeConfig ? normalizeControls(candidate.activeConfig) : null)
        : null,
    error:
      status === "error" && (typeof candidate.error === "string" || candidate.error === null)
        ? candidate.error
        : null,
  };
}

function isPersistedStoreShape(value: unknown): value is Partial<PersistedStore> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PersistedStore>;
  return candidate.version === 1 && typeof candidate.activeSessionId === "string";
}

function toUnixMs(raw: string): number {
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeToolArguments(argumentsValue: unknown): string {
  if (typeof argumentsValue === "string") {
    try {
      const parsed = JSON.parse(argumentsValue);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return argumentsValue;
    }
  }

  if (argumentsValue && typeof argumentsValue === "object") {
    try {
      return JSON.stringify(argumentsValue, null, 2);
    } catch {
      return "{}";
    }
  }

  return "{}";
}

function deriveControls(sessionConfig: unknown): ChatControls {
  const config = asRecord(sessionConfig);
  const mode = config?.mode;
  const model = config?.model;
  const autoConfirmTools = config?.auto_confirm_tools;

  return {
    mode: isAgentMode(mode) ? mode : DEFAULT_CHAT_CONTROLS.mode,
    model: isChatModel(model) ? model : DEFAULT_CHAT_CONTROLS.model,
    autoConfirmTools: typeof autoConfirmTools === "boolean" ? autoConfirmTools : DEFAULT_CHAT_CONTROLS.autoConfirmTools,
  };
}

function convertConversation(
  threadId: string,
  conversation: Record<string, unknown>[],
): {
  messages: ChatMessage[];
  toolCalls: ToolCall[];
} {
  const messages: ChatMessage[] = [];
  const toolCalls: ToolCall[] = [];
  const toolNameByCallId = new Map<string, string>();

  conversation.forEach((item, index) => {
    const role = asString(item.role);
    const itemType = asString(item.type);
    const messageId = `${threadId}-${index}`;

    if (role === "user") {
      messages.push({
        id: messageId,
        role: "user",
        content: asString(item.content) ?? "",
      });
      return;
    }

    if (itemType === "message") {
      const text = parseAssistantText(item.content);
      if (text) {
        messages.push({
          id: messageId,
          role: "assistant",
          kind: "response",
          content: text,
        });
      }
      return;
    }

    if (itemType === "reasoning") {
      const summary = parseReasoningSummary(item.summary);
      if (summary) {
        messages.push({
          id: messageId,
          role: "assistant",
          kind: "reasoning",
          content: summary,
        });
      }
      return;
    }

    if (itemType === "function_call") {
      const callId = asString(item.call_id) ?? `call-${index}`;
      const name = asString(item.name) ?? "tool";
      const argumentsText = normalizeToolArguments(item.arguments);

      toolCalls.push({ call_id: callId, name, arguments: argumentsText });
      toolNameByCallId.set(callId, name);

      messages.push({
        id: messageId,
        role: "assistant",
        kind: "tool_call",
        toolCallId: callId,
        name,
        content: argumentsText,
      });
      return;
    }

    if (itemType === "function_call_output") {
      const callId = asString(item.call_id) ?? `call-${index}`;
      messages.push({
        id: messageId,
        role: "assistant",
        kind: "tool_result",
        toolCallId: callId,
        name: toolNameByCallId.get(callId) ?? "tool",
        content: asString(item.output) ?? "",
      });
    }
  });

  return { messages, toolCalls };
}

function stateFromServerThread(thread: ServerThreadHistory, createInitialState: () => ChatState): ChatState {
  const initial = createInitialState();
  const controls = deriveControls(thread.session_config);
  const status = normalizeSessionStatus(thread.status);
  const { messages, toolCalls } = convertConversation(thread.thread_id, thread.conversation ?? []);

  return {
    ...initial,
    threadId: thread.thread_id,
    sessionId: thread.current_session_id,
    status,
    messages,
    toolCalls,
    pendingToolCalls: Array.isArray(thread.pending_tool_calls) ? thread.pending_tool_calls : [],
    decisionByCallId: {},
    controls,
    activeConfig: isSessionActiveStatus(status) ? controls : null,
    error: status === "error" ? thread.detail ?? "The session failed." : null,
    draft: "",
    streamLog: [],
    lastEventId: "0-0",
  };
}

function shouldPreserveLocalRunningState(localState: ChatState | undefined, thread: ServerThreadHistory): boolean {
  if (!localState) {
    return false;
  }

  if (normalizeSessionStatus(thread.status) !== "running" || !thread.current_session_id) {
    return false;
  }

  return (
    isRunningSessionStatus(localState.status) &&
    localState.threadId === thread.thread_id &&
    localState.sessionId === thread.current_session_id
  );
}

function mergeRunningSessionState(localState: ChatState, remoteState: ChatState): ChatState {
  return {
    ...remoteState,
    // Preserve locally streamed deltas and cursor so refresh can resume seamlessly.
    messages: localState.messages,
    toolCalls: localState.toolCalls,
    streamLog: localState.streamLog,
    lastEventId: localState.lastEventId,
    draft: localState.draft,
    pendingToolCalls: [],
    decisionByCallId: {},
    error: null,
  };
}

function makeThreadSessionId(threadId: string): string {
  return `thread-${threadId}`;
}

export function makeLocalSessionId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSessionRecord(
  id: string,
  createInitialState: () => ChatState,
): LocalSessionRecord {
  return {
    id,
    label: "New Session",
    updatedAt: Date.now(),
    isOpen: true,
    state: createInitialState(),
  };
}

export function defaultStore(createInitialState: () => ChatState): PersistedStore {
  const id = makeLocalSessionId();
  const session = createSessionRecord(id, createInitialState);

  return {
    version: 1,
    activeSessionId: id,
    order: [id],
    sessions: {
      [id]: session,
    },
  };
}

export function loadPersistedStore(createInitialState: () => ChatState, storageKey: string): PersistedStore {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return defaultStore(createInitialState);
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!isPersistedStoreShape(parsed) || !parsed.sessions || !Array.isArray(parsed.order)) {
      return defaultStore(createInitialState);
    }

    const normalizedSessions: Record<string, LocalSessionRecord> = {};

    Object.entries(parsed.sessions).forEach(([id, rawRecord]) => {
      if (!rawRecord || typeof rawRecord !== "object") {
        return;
      }

      const record = rawRecord as Partial<LocalSessionRecord>;
      const label = typeof record.label === "string" && record.label.trim().length > 0 ? record.label : "New Session";

      normalizedSessions[id] = {
        id,
        label,
        updatedAt: Number.isFinite(record.updatedAt) ? Number(record.updatedAt) : Date.now(),
        isOpen: typeof record.isOpen === "boolean" ? record.isOpen : true,
        state: normalizeState(record.state, createInitialState),
      };
    });

    const order = parsed.order.filter((id) => typeof id === "string" && Boolean(normalizedSessions[id]));
    const firstOpenId = order.find((id) => normalizedSessions[id]?.isOpen);
    const fallbackId = firstOpenId ?? order[0];
    const requestedActiveId = parsed.activeSessionId;
    const activeSessionId =
      requestedActiveId && normalizedSessions[requestedActiveId]?.isOpen ? requestedActiveId : fallbackId;

    if (!activeSessionId) {
      return defaultStore(createInitialState);
    }

    return {
      version: 1,
      activeSessionId,
      order,
      sessions: normalizedSessions,
    };
  } catch {
    return defaultStore(createInitialState);
  }
}

export function savePersistedStore(store: PersistedStore, storageKey: string): void {
  try {
    const persistedOrder = store.order.filter((sessionId) => {
      const record = store.sessions[sessionId];
      if (!record) {
        return false;
      }

      if (record.state.threadId) {
        return true;
      }

      return record.state.messages.some((message) => message.role === "user" && message.content.trim().length > 0);
    });

    if (persistedOrder.length === 0) {
      localStorage.removeItem(storageKey);
      return;
    }

    const sessions: Record<string, LocalSessionRecord> = {};
    persistedOrder.forEach((sessionId) => {
      const record = store.sessions[sessionId];
      if (record) {
        sessions[sessionId] = record;
      }
    });

    const activeSessionId = sessions[store.activeSessionId]
      ? store.activeSessionId
      : persistedOrder.find((sessionId) => sessions[sessionId]?.isOpen) ?? persistedOrder[0];

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1 as const,
        activeSessionId,
        order: persistedOrder,
        sessions,
      }),
    );
  } catch {
    // Ignore persistence failures (quota/private mode) and keep in-memory UX functional.
  }
}

export function deriveSessionLabel(state: ChatState, fallback: string): string {
  const firstUserMessage = state.messages.find((message) => message.role === "user" && message.content.trim().length > 0);
  if (!firstUserMessage) {
    return fallback;
  }

  const text = firstUserMessage.content.trim().replace(/\s+/g, " ");
  return text.length > 64 ? `${text.slice(0, 64)}...` : text;
}

export function updateActiveSessionState(
  store: PersistedStore,
  state: ChatState,
  sessionId: string | null = null,
): PersistedStore {
  const targetSessionId = sessionId ?? store.activeSessionId;
  const active = store.sessions[targetSessionId];
  if (!active) {
    return store;
  }

  return {
    ...store,
    sessions: {
      ...store.sessions,
      [targetSessionId]: {
        ...active,
        state,
        label: deriveSessionLabel(state, active.label),
        updatedAt: Date.now(),
      },
    },
  };
}

export function mergeServerThreadsIntoStore(
  store: PersistedStore,
  threads: ServerThreadHistory[],
  createInitialState: () => ChatState,
): PersistedStore {
  const nextSessions: Record<string, LocalSessionRecord> = { ...store.sessions };
  const nextOrder: string[] = [];
  const localSessionIdByThreadId = new Map<string, string>();
  const remoteThreadIds = new Set<string>();

  store.order.forEach((sessionId) => {
    const record = store.sessions[sessionId];
    if (!record?.state.threadId) {
      return;
    }
    if (!localSessionIdByThreadId.has(record.state.threadId)) {
      localSessionIdByThreadId.set(record.state.threadId, sessionId);
    }
  });

  const threadsInTabOrder = [...threads].sort((a, b) => {
    const updatedDiff = toUnixMs(a.updated_at) - toUnixMs(b.updated_at);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    const createdDiff = toUnixMs(a.created_at) - toUnixMs(b.created_at);
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return a.thread_id.localeCompare(b.thread_id);
  });

  threadsInTabOrder.forEach((thread) => {
    remoteThreadIds.add(thread.thread_id);
    const sessionId = localSessionIdByThreadId.get(thread.thread_id) ?? makeThreadSessionId(thread.thread_id);
    const previous = nextSessions[sessionId];
    const remoteState = stateFromServerThread(thread, createInitialState);
    const nextState = shouldPreserveLocalRunningState(previous?.state, thread)
      ? mergeRunningSessionState(previous.state, remoteState)
      : remoteState;
    const fallbackLabel = previous?.label ?? `Thread ${thread.thread_id.slice(0, 8)}`;

    nextSessions[sessionId] = {
      id: sessionId,
      label: deriveSessionLabel(nextState, fallbackLabel),
      updatedAt: toUnixMs(thread.updated_at),
      isOpen: thread.is_open ?? true,
      state: nextState,
    };
    nextOrder.push(sessionId);
  });

  const seenSessionIds = new Set(nextOrder);
  const seenThreadIds = new Set(remoteThreadIds);

  store.order.forEach((sessionId) => {
    if (seenSessionIds.has(sessionId)) {
      return;
    }

    const record = store.sessions[sessionId];
    if (!record) {
      return;
    }

    const threadId = record.state.threadId;
    if (threadId) {
      if (seenThreadIds.has(threadId)) {
        return;
      }
      seenThreadIds.add(threadId);
    }

    nextSessions[sessionId] = record;
    nextOrder.push(sessionId);
    seenSessionIds.add(sessionId);
  });

  if (nextOrder.length === 0) {
    return defaultStore(createInitialState);
  }

  const openSessionIds = nextOrder.filter((sessionId) => nextSessions[sessionId]?.isOpen);

  if (openSessionIds.length === 0) {
    const fallbackId = makeLocalSessionId();
    nextSessions[fallbackId] = createSessionRecord(fallbackId, createInitialState);
    nextOrder.unshift(fallbackId);
    openSessionIds.push(fallbackId);
  }

  const activeSessionId =
    nextSessions[store.activeSessionId]?.isOpen && nextOrder.includes(store.activeSessionId)
      ? store.activeSessionId
      : openSessionIds[0];

  return {
    version: 1,
    activeSessionId,
    order: nextOrder,
    sessions: nextSessions,
  };
}

export function toSessionHistory(store: PersistedStore): ChatSessionSummary[] {
  return store.order
    .map((id) => store.sessions[id])
    .filter((record): record is LocalSessionRecord => Boolean(record))
    .map((record) => ({
      id: record.id,
      label: record.label,
      updatedAt: record.updatedAt,
      isOpen: record.isOpen,
    }));
}
