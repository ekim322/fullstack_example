import type { AgentMode, ChatControls, ChatModel } from "./types";

export const DEFAULT_CHAT_CONTROLS: ChatControls = {
  mode: "plan",
  model: "gpt-5-mini-2025-08-07",
  autoConfirmTools: false,
};

export const CHAT_MODE_LABELS: Record<AgentMode, string> = {
  plan: "Plan",
  chat: "Chat",
};

export const CHAT_MODEL_LABELS: Record<ChatModel, string> = {
  "gpt-5.2-2025-12-11": "GPT 5.2",
  "gpt-5-mini-2025-08-07": "GPT 5 mini",
};
