import { CHAT_MODEL_VALUES, CHAT_MODE_VALUES, type AgentMode, type ChatModel } from "../types";

export function isAgentMode(value: unknown): value is AgentMode {
  return typeof value === "string" && CHAT_MODE_VALUES.includes(value as AgentMode);
}

export function isChatModel(value: unknown): value is ChatModel {
  return typeof value === "string" && CHAT_MODEL_VALUES.includes(value as ChatModel);
}
