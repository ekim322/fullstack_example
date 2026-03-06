import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { startChatSession } from "../api/chatApi";
import { chatReducer, initialChatState, type ChatAction } from "../state/chatReducer";
import {
  loadPersistedStore,
  savePersistedStore,
  toSessionHistory,
  updateActiveSessionState,
  type PersistedStore,
} from "../state/chatPersistence";
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
  stopSession: () => Promise<boolean>;
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
  const state = activeSession?.state ?? initialChatState();

  const stateRef = useRef(state);
  const sessionStoreRef = useRef(sessionStore);

  stateRef.current = state;
  sessionStoreRef.current = sessionStore;

  const dispatch = useCallback((action: ChatAction) => {
    setSessionStore((current) => {
      const active = current.sessions[current.activeSessionId];
      if (!active) {
        return current;
      }

      const nextState = chatReducer(active.state, action);
      if (nextState === active.state) {
        return current;
      }

      return updateActiveSessionState(current, nextState, current.activeSessionId);
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      savePersistedStore(sessionStore, storageKey);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sessionStore, storageKey]);

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

  const applySessionStartedToLocalSession = useCallback(
    (localSessionId: string, threadId: string, sessionId: string) => {
      const activeLocalSessionId = sessionStoreRef.current.activeSessionId;
      if (activeLocalSessionId === localSessionId) {
        const snapshot = stateRef.current;
        if (snapshot.status !== "running") {
          return;
        }

        dispatch({ type: "sessionStarted", threadId, sessionId });
        connectToSession(sessionId, "0-0");
        return;
      }

      setSessionStore((current) => {
        const target = current.sessions[localSessionId];
        if (!target) {
          return current;
        }

        if (target.state.threadId && target.state.threadId !== threadId) {
          return current;
        }

        const nextState: ChatState = {
          ...target.state,
          threadId,
          sessionId,
          status: "running",
          activeConfig: target.state.activeConfig ?? { ...target.state.controls },
          error: null,
          lastEventId: "0-0",
        };
        return updateActiveSessionState(current, nextState, localSessionId);
      });
    },
    [connectToSession, dispatch, setSessionStore],
  );

  const applySessionErrorToLocalSession = useCallback(
    (localSessionId: string, error: string) => {
      const activeLocalSessionId = sessionStoreRef.current.activeSessionId;
      if (activeLocalSessionId === localSessionId) {
        if (stateRef.current.status !== "running") {
          return;
        }

        dispatch({ type: "setError", error });
        return;
      }

      setSessionStore((current) => {
        const target = current.sessions[localSessionId];
        if (!target) {
          return current;
        }

        const nextState: ChatState = {
          ...target.state,
          status: "error",
          activeConfig: null,
          error,
        };
        return updateActiveSessionState(current, nextState, localSessionId);
      });
    },
    [dispatch, setSessionStore],
  );

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
    getActiveLocalSessionId: () => sessionStoreRef.current.activeSessionId,
    onSessionStarted: applySessionStartedToLocalSession,
    onSessionError: applySessionErrorToLocalSession,
  });

  const sendRawMessage = useCallback(async (
    message: string,
    options?: { allowActiveStatus?: boolean },
  ) => {
    const snapshot = stateRef.current;
    const originLocalSessionId = sessionStoreRef.current.activeSessionId;
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

      applySessionStartedToLocalSession(
        originLocalSessionId,
        response.thread_id,
        response.session_id,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to start session";
      applySessionErrorToLocalSession(originLocalSessionId, detail);
      throw error;
    }
  }, [
    applySessionErrorToLocalSession,
    applySessionStartedToLocalSession,
    authToken,
    sessionStoreRef,
    stateRef,
    userId,
  ]);

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
    sessionStore,
    setSessionStore,
    sessionStoreRef,
    closeStream,
    resetReconnectAttempts,
    resetAskUserQuestionFlow,
    syncAndReconnectSession,
  });

  const sendMessage = useCallback(async () => {
    let snapshot = stateRef.current;
    if (snapshot.status === "awaiting_confirmation") {
      dispatch({
        type: "setError",
        error: "This session is awaiting tool confirmation. Approve or decline pending tools before sending a message.",
      });
      return;
    }

    if (snapshot.status === "running") {
      const stopped = await stopSession();
      if (!stopped) {
        return;
      }
      snapshot = stateRef.current;
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
  }, [dispatch, resetAskUserQuestionFlow, sendRawMessage, stopSession]);

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
