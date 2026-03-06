import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject } from "react";

import { stopChatSession } from "../../api/chatApi";
import { openSessionEventStream } from "../../api/sse";
import type { ChatAction } from "../../state/chatReducer";
import { isRunningSessionStatus, isSessionActiveStatus } from "../../state/sessionStatus";
import type { ChatState, StreamEvent, ToolCallStreamEvent, ToolResultStreamEvent } from "../../types";
import { subscribeToInvalidSession } from "../../../../shared/sessionInvalidation";
import { syncSessionStatus } from "./syncSessionStatus";

type StreamBatchEntry = {
  sessionId: string;
  entryId: string;
  event: StreamEvent;
};

type UseChatStreamLifecycleArgs = {
  authToken: string;
  stateRef: MutableRefObject<ChatState>;
  dispatch: Dispatch<ChatAction>;
  onToolEvent?: (event: ToolCallStreamEvent | ToolResultStreamEvent) => void;
};

type UseChatStreamLifecycleResult = {
  closeStream: () => void;
  connectToSession: (sessionId: string, lastId: string) => void;
  syncAndReconnectSession: (candidate: ChatState) => Promise<void>;
  resetReconnectAttempts: () => void;
  stopSession: () => Promise<void>;
};

export function useChatStreamLifecycle({
  authToken,
  stateRef,
  dispatch,
  onToolEvent,
}: UseChatStreamLifecycleArgs): UseChatStreamLifecycleResult {
  const closeStreamRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // Monotonic token to ignore callbacks from superseded stream connections.
  const streamGenerationRef = useRef(0);
  const didBootRef = useRef(false);
  const pendingStreamEntriesRef = useRef<StreamBatchEntry[]>([]);
  const flushRafRef = useRef<number | null>(null);
  const flushTimeoutRef = useRef<number | null>(null);

  const clearFlushSchedulers = useCallback(() => {
    if (flushRafRef.current !== null) {
      window.cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }

    if (flushTimeoutRef.current !== null) {
      window.clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }
  }, []);

  const flushPendingEntries = useCallback(() => {
    clearFlushSchedulers();

    if (pendingStreamEntriesRef.current.length === 0) {
      return;
    }

    const entries = pendingStreamEntriesRef.current;
    pendingStreamEntriesRef.current = [];
    dispatch({ type: "streamEventsBatch", entries });
  }, [clearFlushSchedulers, dispatch]);

  const scheduleFlush = useCallback(() => {
    if (flushRafRef.current !== null || flushTimeoutRef.current !== null) {
      return;
    }

    flushRafRef.current = window.requestAnimationFrame(() => {
      flushRafRef.current = null;
      flushPendingEntries();
    });

    // requestAnimationFrame is throttled in background tabs.
    flushTimeoutRef.current = window.setTimeout(() => {
      flushTimeoutRef.current = null;
      flushPendingEntries();
    }, 50);
  }, [flushPendingEntries]);

  const closeStream = useCallback(() => {
    streamGenerationRef.current += 1;

    if (closeStreamRef.current) {
      closeStreamRef.current();
      closeStreamRef.current = null;
    }

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    clearFlushSchedulers();
    pendingStreamEntriesRef.current = [];
  }, [clearFlushSchedulers]);

  const handleInvalidSession = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    closeStream();
  }, [closeStream]);

  const connectToSession = useCallback(
    (sessionId: string, lastId: string) => {
      closeStream();
      const generation = streamGenerationRef.current;

      closeStreamRef.current = openSessionEventStream(sessionId, lastId, authToken, {
        onEvent: (entryId, event) => {
          if (streamGenerationRef.current !== generation) {
            return;
          }

          reconnectAttemptsRef.current = 0;
          pendingStreamEntriesRef.current.push({ sessionId, entryId, event });
          scheduleFlush();

          if (onToolEvent && (event.type === "tool_call" || event.type === "tool_result")) {
            onToolEvent(event);
          }

          if (event.type === "done") {
            flushPendingEntries();
            closeStream();
          }
        },
        onError: () => {
          if (streamGenerationRef.current !== generation) {
            return;
          }

          flushPendingEntries();
          closeStream();
          // closeStream() increments the generation token. Reconnect work must
          // be tied to the new token, otherwise every retry self-cancels.
          const reconnectGeneration = streamGenerationRef.current;

          if (!isRunningSessionStatus(stateRef.current.status)) {
            return;
          }

          const nextAttempt = reconnectAttemptsRef.current + 1;
          reconnectAttemptsRef.current = nextAttempt;

          const delayMs = Math.min(2_000, 250 * 2 ** Math.min(nextAttempt - 1, 3));
          reconnectTimerRef.current = window.setTimeout(() => {
            if (streamGenerationRef.current !== reconnectGeneration) {
              return;
            }

            const current = stateRef.current;
            if (!isRunningSessionStatus(current.status)) {
              return;
            }

            if (!current.threadId) {
              if (current.sessionId) {
                connectToSession(current.sessionId, current.lastEventId);
              }
              return;
            }

            void syncSessionStatus({
              threadId: current.threadId,
              authToken,
              status: current.status,
              fallbackSessionId: current.sessionId,
              lastEventId: current.lastEventId,
              dispatch,
              connectToSession,
              onInvalidSession: handleInvalidSession,
            });
          }, delayMs);
        },
      });
    },
    [authToken, closeStream, dispatch, flushPendingEntries, handleInvalidSession, onToolEvent, scheduleFlush, stateRef],
  );

  const syncAndReconnectSession = useCallback(
    async (candidate: ChatState) => {
      if (!candidate.threadId) {
        return;
      }

      await syncSessionStatus({
        threadId: candidate.threadId,
        authToken,
        status: candidate.status,
        fallbackSessionId: candidate.sessionId,
        lastEventId: candidate.lastEventId,
        dispatch,
        connectToSession,
        onInvalidSession: handleInvalidSession,
      });
    },
    [authToken, connectToSession, dispatch, handleInvalidSession],
  );

  useEffect(() => {
    return subscribeToInvalidSession(() => {
      handleInvalidSession();
    });
  }, [handleInvalidSession]);

  useEffect(() => {
    return () => {
      flushPendingEntries();
      closeStream();
    };
  }, [closeStream, flushPendingEntries]);

  useEffect(() => {
    if (didBootRef.current) {
      return;
    }
    didBootRef.current = true;

    const snapshot = stateRef.current;
    if (!snapshot.threadId) {
      return;
    }
    const threadId = snapshot.threadId;
    void (async () => {
      await syncSessionStatus({
        threadId,
        authToken,
        status: snapshot.status,
        fallbackSessionId: snapshot.sessionId,
        lastEventId: snapshot.lastEventId,
        dispatch,
        connectToSession,
        onInvalidSession: handleInvalidSession,
      });
    })();
  }, [authToken, connectToSession, dispatch, handleInvalidSession, stateRef]);

  const resetReconnectAttempts = useCallback(() => {
    reconnectAttemptsRef.current = 0;
  }, []);

  const stopSession = useCallback(async () => {
    const snapshot = stateRef.current;
    if (!snapshot.threadId || !isSessionActiveStatus(snapshot.status)) {
      return;
    }

    try {
      await stopChatSession(snapshot.threadId, authToken);
      flushPendingEntries();
      closeStream();
      dispatch({ type: "sessionStopped" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to stop session";
      dispatch({ type: "setError", error: detail });
    }
  }, [authToken, closeStream, dispatch, flushPendingEntries, stateRef]);

  return {
    closeStream,
    connectToSession,
    syncAndReconnectSession,
    resetReconnectAttempts,
    stopSession,
  };
}
