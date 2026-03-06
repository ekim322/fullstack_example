import {
  useCallback,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { setThreadOpenState } from "../../api/chatApi";
import { initialChatState } from "../../state/chatReducer";
import {
  createSessionRecord,
  makeLocalSessionId,
  toSessionHistory,
  type PersistedStore,
} from "../../state/chatPersistence";
import type { ChatState } from "../../types";
import { useChatThreadsBootstrap } from "./useChatThreadsBootstrap";

type UseChatSessionStoreOperationsArgs = {
  authToken: string;
  sessionStore: PersistedStore;
  setSessionStore: Dispatch<SetStateAction<PersistedStore>>;
  sessionStoreRef: MutableRefObject<PersistedStore>;
  closeStream: () => void;
  resetReconnectAttempts: () => void;
  resetAskUserQuestionFlow: () => void;
  syncAndReconnectSession: (candidate: ChatState) => Promise<void>;
};

type UseChatSessionStoreOperationsResult = {
  activeLocalSessionId: string;
  sessionHistory: ReturnType<typeof toSessionHistory>;
  switchSession: (sessionId: string) => void;
  openSessionTab: (sessionId: string) => void;
  closeSessionTab: (sessionId: string) => void;
  startNewSession: () => void;
};

export function useChatSessionStoreOperations({
  authToken,
  sessionStore,
  setSessionStore,
  sessionStoreRef,
  closeStream,
  resetReconnectAttempts,
  resetAskUserQuestionFlow,
  syncAndReconnectSession,
}: UseChatSessionStoreOperationsArgs): UseChatSessionStoreOperationsResult {
  const resetSessionInteractionState = useCallback(() => {
    closeStream();
    resetReconnectAttempts();
    resetAskUserQuestionFlow();
  }, [closeStream, resetAskUserQuestionFlow, resetReconnectAttempts]);

  useChatThreadsBootstrap({
    authToken,
    sessionStoreRef,
    setSessionStore,
    syncAndReconnectSession,
  });

  const persistThreadOpenState = useCallback(
    (threadId: string | null, isOpen: boolean) => {
      if (!threadId) {
        return;
      }

      void setThreadOpenState(threadId, isOpen, authToken).catch(() => {
        // Keep tab interactions responsive even if persistence fails.
      });
    },
    [authToken],
  );

  const switchSession = useCallback(
    (sessionId: string) => {
      const target = sessionStoreRef.current.sessions[sessionId];
      if (!target) {
        return;
      }

      resetSessionInteractionState();

      setSessionStore((current) => {
        if (current.activeSessionId === sessionId) {
          return current;
        }

        return {
          ...current,
          activeSessionId: sessionId,
        };
      });

      void syncAndReconnectSession(target.state);
    },
    [resetSessionInteractionState, sessionStoreRef, setSessionStore, syncAndReconnectSession],
  );

  const startNewSession = useCallback(() => {
    resetSessionInteractionState();

    const id = makeLocalSessionId();
    const session = createSessionRecord(id, initialChatState);

    setSessionStore((current) => ({
      ...current,
      activeSessionId: id,
      order: [...current.order, id],
      sessions: {
        ...current.sessions,
        [id]: session,
      },
    }));
  }, [resetSessionInteractionState, setSessionStore]);

  const openSessionTab = useCallback(
    (sessionId: string) => {
      const target = sessionStoreRef.current.sessions[sessionId];
      if (!target) {
        return;
      }

      if (!target.isOpen) {
        setSessionStore((current) => {
          const record = current.sessions[sessionId];
          if (!record || record.isOpen) {
            return current;
          }

          const nextOrder = current.order.filter((id) => id !== sessionId);
          nextOrder.push(sessionId);

          return {
            ...current,
            order: nextOrder,
            sessions: {
              ...current.sessions,
              [sessionId]: {
                ...record,
                isOpen: true,
              },
            },
          };
        });
        persistThreadOpenState(target.state.threadId, true);
      }

      switchSession(sessionId);
    },
    [persistThreadOpenState, sessionStoreRef, setSessionStore, switchSession],
  );

  const closeSessionTab = useCallback(
    (sessionId: string) => {
      const snapshot = sessionStoreRef.current;
      const target = snapshot.sessions[sessionId];
      if (!target?.isOpen) {
        return;
      }

      const openSessionIds = snapshot.order.filter((id) => snapshot.sessions[id]?.isOpen);
      if (!openSessionIds.includes(sessionId)) {
        return;
      }

      const remainingOpenIds = openSessionIds.filter((id) => id !== sessionId);
      setSessionStore((current) => {
        const record = current.sessions[sessionId];
        if (!record || !record.isOpen) {
          return current;
        }

        return {
          ...current,
          sessions: {
            ...current.sessions,
            [sessionId]: {
              ...record,
              isOpen: false,
            },
          },
        };
      });

      if (remainingOpenIds.length === 0) {
        startNewSession();
      } else if (snapshot.activeSessionId === sessionId) {
        const index = openSessionIds.indexOf(sessionId);
        const fallbackId = remainingOpenIds[index] ?? remainingOpenIds[index - 1] ?? remainingOpenIds[0];
        if (fallbackId) {
          switchSession(fallbackId);
        }
      }

      persistThreadOpenState(target.state.threadId, false);
    },
    [persistThreadOpenState, sessionStoreRef, setSessionStore, startNewSession, switchSession],
  );

  const sessionHistory = useMemo(() => toSessionHistory(sessionStore), [sessionStore]);

  return {
    activeLocalSessionId: sessionStore.activeSessionId,
    sessionHistory,
    switchSession,
    openSessionTab,
    closeSessionTab,
    startNewSession,
  };
}
