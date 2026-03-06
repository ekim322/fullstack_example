import { useCallback, useMemo, useReducer, useRef, useState } from "react";

import { startChatSession } from "../api/chatApi";
import { chatReducer, initialChatState } from "../state/chatReducer";
import { loadPersistedStore, toSessionHistory, type PersistedStore } from "../state/chatPersistence";
import { isSessionActiveStatus } from "../state/sessionStatus";
import type {
  AgentMode,
  AskUserQuestionSubmission,
  ChatModel,
  ChatState,
  ToolCallStreamEvent,
  ToolResultStreamEvent,
} from "../types";
import { chatStorageKeyForUser } from "@shared/config";
import { useAskUserQuestionBatching } from "./internal/useAskUserQuestionBatching";
import { useChatDecisionFlow } from "./internal/useChatDecisionFlow";
import { useChatSessionStoreOperations } from "./internal/useChatSessionStoreOperations";
import { useChatStreamLifecycle } from "./internal/useChatStreamLifecycle";

type UseChatControllerResult = {
  state: ChatState;
  activeLocalSessionId: string;
  sessionHistory: ReturnType<typeof toSessionHistory>;
  switchSession: (sessionId: string) => void;
  openSessionTab: (sessionId: string) => void;
  closeSessionTab: (sessionId: string) => void;
  startNewSession: () => void;
  setDraft: (value: string) => void;
  setMode: (value: AgentMode) => void;
  setModel: (value: ChatModel) => void;
  setAutoConfirm: (value: boolean) => void;
  setDecision: (callId: string, approved: boolean) => void;
  sendMessage: () => Promise<void>;
  submitPendingDecisions: () => Promise<void>;
  submitAskUserQuestionResponse: (callId: string, response: AskUserQuestionSubmission) => Promise<void>;
  stopSession: () => Promise<void>;
};

type UseChatControllerArgs = {
  userId: string;
  authToken: string;
  onToolEvent?: (event: ToolCallStreamEvent | ToolResultStreamEvent) => void;
};

export function useChatController({ userId, authToken, onToolEvent }: UseChatControllerArgs): UseChatControllerResult {
  const storageKey = useMemo(() => chatStorageKeyForUser(userId), [userId]);
  const [sessionStore, setSessionStore] = useState<PersistedStore>(() => loadPersistedStore(initialChatState, storageKey));
  const activeSession = sessionStore.sessions[sessionStore.activeSessionId];

  const [state, dispatch] = useReducer(
    chatReducer,
    activeSession?.state ?? initialChatState(),
    (initialState) => initialState,
  );

  const stateRef = useRef(state);
  const sessionStoreRef = useRef(sessionStore);

  stateRef.current = state;
  sessionStoreRef.current = sessionStore;

  const {
    closeStream,
    connectToSession,
    syncAndReconnectSession,
    resetReconnectAttempts,
    stopSession,
  } = useChatStreamLifecycle({
    authToken,
    stateRef,
    dispatch,
    onToolEvent,
  });

  const {
    continuePendingDecisions,
    submitPendingDecisions,
    setDecision,
  } = useChatDecisionFlow({
    authToken,
    userId,
    state,
    stateRef,
    dispatch,
    connectToSession,
  });

  const sendRawMessage = useCallback(async (
    message: string,
    options?: { allowActiveStatus?: boolean },
  ) => {
    const snapshot = stateRef.current;
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    if (!options?.allowActiveStatus && isSessionActiveStatus(snapshot.status)) {
      throw new Error("Wait for the current tool execution to finish before sending a message.");
    }

    dispatch({ type: "sendStarted", message: trimmed });

    try {
      const response = await startChatSession({
        user_id: userId,
        thread_id: snapshot.threadId ?? undefined,
        message: trimmed,
        mode: snapshot.controls.mode,
        model: snapshot.controls.model,
        auto_confirm_tools: snapshot.controls.autoConfirmTools,
      }, authToken);

      dispatch({ type: "sessionStarted", threadId: response.thread_id, sessionId: response.session_id });
      connectToSession(response.session_id, "0-0");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to start session";
      dispatch({ type: "setError", error: detail });
      throw error;
    }
  }, [authToken, connectToSession, userId]);

  const { resetAskUserQuestionFlow, submitAskUserQuestionResponse } = useAskUserQuestionBatching({
    state,
    stateRef,
    continuePendingDecisions,
    sendRawMessage,
  });

  const {
    activeLocalSessionId,
    sessionHistory,
    switchSession,
    openSessionTab,
    closeSessionTab,
    startNewSession,
  } = useChatSessionStoreOperations({
    authToken,
    storageKey,
    state,
    dispatch,
    sessionStore,
    setSessionStore,
    sessionStoreRef,
    closeStream,
    resetReconnectAttempts,
    resetAskUserQuestionFlow,
    syncAndReconnectSession,
  });

  const sendMessage = useCallback(async () => {
    const snapshot = stateRef.current;
    if (isSessionActiveStatus(snapshot.status)) {
      await stopSession();
    }

    const message = snapshot.draft.trim();
    if (!message) {
      return;
    }

    resetAskUserQuestionFlow();
    try {
      await sendRawMessage(message, { allowActiveStatus: true });
    } catch {
      // sendRawMessage already updates the session error state.
    }
  }, [resetAskUserQuestionFlow, sendRawMessage, stopSession]);

  return {
    state,
    activeLocalSessionId,
    sessionHistory,
    switchSession,
    openSessionTab,
    closeSessionTab,
    startNewSession,
    setDraft: (value: string) => dispatch({ type: "setDraft", value }),
    setMode: (value: AgentMode) => dispatch({ type: "setMode", value }),
    setModel: (value: ChatModel) => dispatch({ type: "setModel", value }),
    setAutoConfirm: (value: boolean) => dispatch({ type: "setAutoConfirm", value }),
    setDecision,
    sendMessage,
    submitPendingDecisions,
    submitAskUserQuestionResponse,
    stopSession,
  };
}
