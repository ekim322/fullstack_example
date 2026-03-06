export const CHAT_MODE_VALUES = ["plan", "chat"] as const;
export type AgentMode = (typeof CHAT_MODE_VALUES)[number];

export const CHAT_MODEL_VALUES = ["gpt-5.2-2025-12-11", "gpt-5-mini-2025-08-07"] as const;
export type ChatModel = (typeof CHAT_MODEL_VALUES)[number];

export const SESSION_STATUS_VALUES = ["idle", "running", "awaiting_confirmation", "complete", "error"] as const;
export type SessionStatus = (typeof SESSION_STATUS_VALUES)[number];

export interface ToolCall {
  name: string;
  call_id: string;
  arguments: string;
}

export interface ToolResult {
  name: string;
  call_id: string;
  output: string;
  declined: boolean;
}

export interface AskUserQuestionSubmission {
  question: string;
  selectedOptions: string[];
  customResponse: string;
}

export interface AskUserQuestionPayload {
  question: string;
  options: string[];
  optionDescriptions: string[];
  multiSelect: boolean;
  allowCustomResponse: boolean;
}

export type ChatMessageKind = "response" | "reasoning" | "tool_call" | "tool_result";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind?: ChatMessageKind;
  toolCallId?: string;
  name?: string;
  declined?: boolean;
}

export interface ChatControls {
  mode: AgentMode;
  model: ChatModel;
  autoConfirmTools: boolean;
}

export interface TextDeltaStreamEvent {
  type: "text_delta";
  data: {
    delta?: string;
  };
  ts: number;
}

export interface ReasoningDeltaStreamEvent {
  type: "reasoning_delta";
  data: {
    delta?: string;
  };
  ts: number;
}

export interface ToolCallStreamEvent {
  type: "tool_call";
  data: {
    name?: string;
    call_id?: string;
    arguments?: string;
  };
  ts: number;
}

export interface ToolResultStreamEvent {
  type: "tool_result";
  data: {
    name?: string;
    call_id?: string;
    output?: string;
    declined?: boolean;
  };
  ts: number;
}

export interface DoneStreamEvent {
  type: "done";
  data: {
    reason?: string;
    detail?: string;
    pending_tool_calls?: ToolCall[];
  };
  ts: number;
}

export type StreamEvent =
  | TextDeltaStreamEvent
  | ReasoningDeltaStreamEvent
  | ToolCallStreamEvent
  | ToolResultStreamEvent
  | DoneStreamEvent;

export type StreamEventType = StreamEvent["type"];

export interface StreamLogEntry {
  id: string;
  entryId: string;
  type: StreamEventType;
  text: string;
  ts: number;
}

export interface ChatState {
  threadId: string | null;
  sessionId: string | null;
  lastEventId: string;
  status: SessionStatus;
  draft: string;
  messages: ChatMessage[];
  pendingToolCalls: ToolCall[];
  decisionByCallId: Record<string, boolean>;
  toolCalls: ToolCall[];
  streamLog: StreamLogEntry[];
  controls: ChatControls;
  activeConfig: ChatControls | null;
  error: string | null;
}

export interface ChatSessionSummary {
  id: string;
  label: string;
  updatedAt: number;
  isOpen: boolean;
}

export interface ChatResponse {
  thread_id: string;
  session_id: string;
  status: string;
}

export interface SessionConfig {
  mode: AgentMode;
  model: ChatModel;
  auto_confirm_tools: boolean;
}

export interface ThreadStatusResponse {
  thread_id: string;
  status: Extract<SessionStatus, "running" | "complete" | "awaiting_confirmation" | "error"> | "stopped";
  session_config: SessionConfig | null;
  current_session_id: string | null;
  pending_tool_calls?: ToolCall[];
  detail?: string;
}

export interface ServerThreadHistory {
  thread_id: string;
  is_open?: boolean;
  status: string;
  session_config: SessionConfig | null;
  current_session_id: string | null;
  pending_tool_calls?: ToolCall[];
  detail?: string;
  created_at: string;
  updated_at: string;
  conversation: Record<string, unknown>[];
}

export interface ThreadHistoryResponse {
  threads: ServerThreadHistory[];
}
