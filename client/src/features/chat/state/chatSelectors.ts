import type { ChatState, SessionStatus, StreamLogEntry } from "../types";

export function isSessionActive(status: SessionStatus): boolean {
  return status === "running" || status === "awaiting_confirmation";
}

export function canStopSession(status: SessionStatus): boolean {
  return isSessionActive(status);
}

export function hasActiveAssistantStream(entries: StreamLogEntry[]): boolean {
  const lastEntry = entries[entries.length - 1];
  if (!lastEntry) {
    return false;
  }

  return lastEntry.type === "text_delta" || lastEntry.type === "reasoning_delta";
}

export function shouldShowThinking(state: Pick<ChatState, "status" | "streamLog">): boolean {
  return state.status === "running" && !hasActiveAssistantStream(state.streamLog);
}
