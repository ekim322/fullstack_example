import { requestJson as requestHttpJson } from "@shared/api/httpClient";
import type {
  AgentMode,
  ChatModel,
  ChatResponse,
  ThreadHistoryResponse,
  ThreadStatusResponse,
} from "../types";

type MessageRequest = {
  user_id: string;
  thread_id?: string;
  message: string;
  mode: AgentMode;
  model: ChatModel;
  auto_confirm_tools: boolean;
};

type ConfirmationRequest = {
  user_id: string;
  thread_id: string;
  confirmations: Record<string, boolean>;
};

type ThreadOpenStateRequest = {
  is_open: boolean;
};

type ThreadOpenStateResponse = {
  thread_id: string;
  is_open: boolean;
};

async function requestJson<T>(path: string, authToken: string, init?: RequestInit): Promise<T> {
  return requestHttpJson<T>({
    path,
    authToken,
    init,
    fallbackErrorMessage: "Request failed",
  });
}

export async function startChatSession(payload: MessageRequest, authToken: string): Promise<ChatResponse> {
  return requestJson<ChatResponse>("/api/chat", authToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function continueChatSession(payload: ConfirmationRequest, authToken: string): Promise<ChatResponse> {
  return requestJson<ChatResponse>("/api/chat", authToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getThreadStatus(threadId: string, authToken: string): Promise<ThreadStatusResponse> {
  return requestJson<ThreadStatusResponse>(`/api/chat/${encodeURIComponent(threadId)}/status`, authToken);
}

export async function stopChatSession(threadId: string, authToken: string): Promise<{ status: string }> {
  return requestJson<{ status: string }>(`/api/chat/${encodeURIComponent(threadId)}/stop`, authToken, {
    method: "POST",
  });
}

export async function getUserThreads(authToken: string): Promise<ThreadHistoryResponse> {
  return requestJson<ThreadHistoryResponse>("/api/chat/threads", authToken);
}

export async function setThreadOpenState(
  threadId: string,
  isOpen: boolean,
  authToken: string,
): Promise<ThreadOpenStateResponse> {
  return requestJson<ThreadOpenStateResponse>(`/api/chat/${encodeURIComponent(threadId)}/open-state`, authToken, {
    method: "PATCH",
    body: JSON.stringify({ is_open: isOpen } satisfies ThreadOpenStateRequest),
  });
}
