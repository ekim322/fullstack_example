import type { SessionStatus } from "../types";

export function normalizeSessionStatus(status: string): SessionStatus {
  if (status === "running" || status === "awaiting_confirmation" || status === "complete" || status === "error") {
    return status;
  }

  // Backend can emit "stopped"; map it to a completed session for UI semantics.
  return "complete";
}

export function isSessionActiveStatus(status: SessionStatus): boolean {
  return status === "running" || status === "awaiting_confirmation";
}

export function isRunningSessionStatus(status: SessionStatus): boolean {
  return status === "running";
}
