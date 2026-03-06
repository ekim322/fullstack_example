import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import {
  savePersistedStore,
  updateActiveSessionState,
  type PersistedStore,
} from "../../state/chatPersistence";
import type { ChatState } from "../../types";
import { isRunningSessionStatus } from "../../state/sessionStatus";

const RUNNING_STATE_SYNC_MS = 350;
const PERSIST_DEBOUNCE_MS = 300;

type UseChatStoreStateSyncArgs = {
  state: ChatState;
  sessionStore: PersistedStore;
  storageKey: string;
  setSessionStore: Dispatch<SetStateAction<PersistedStore>>;
};

export function useChatStoreStateSync({
  state,
  sessionStore,
  storageKey,
  setSessionStore,
}: UseChatStoreStateSyncArgs): void {
  const stateSyncTimerRef = useRef<number | null>(null);
  const latestStateRef = useRef<ChatState>(state);
  const latestSessionIdRef = useRef<string>(sessionStore.activeSessionId);

  const flushLatestStateToStore = useCallback(() => {
    if (stateSyncTimerRef.current !== null) {
      window.clearTimeout(stateSyncTimerRef.current);
      stateSyncTimerRef.current = null;
    }

    const latestState = latestStateRef.current;
    const latestSessionId = latestSessionIdRef.current;
    setSessionStore((current) => updateActiveSessionState(current, latestState, latestSessionId));
  }, [setSessionStore]);

  useEffect(() => {
    if (isRunningSessionStatus(state.status)) {
      return;
    }

    const timer = window.setTimeout(() => {
      savePersistedStore(sessionStore, storageKey);
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sessionStore, state.status, storageKey]);

  useEffect(() => {
    latestStateRef.current = state;
    latestSessionIdRef.current = sessionStore.activeSessionId;

    if (isRunningSessionStatus(state.status)) {
      if (stateSyncTimerRef.current === null) {
        stateSyncTimerRef.current = window.setTimeout(() => {
          flushLatestStateToStore();
        }, RUNNING_STATE_SYNC_MS);
      }
      return;
    }

    flushLatestStateToStore();
  }, [flushLatestStateToStore, state]);

  useEffect(() => {
    return () => {
      if (stateSyncTimerRef.current !== null) {
        window.clearTimeout(stateSyncTimerRef.current);
      }
    };
  }, []);
}
