import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { getUserThreads } from "../../api/chatApi";
import { initialChatState } from "../../state/chatReducer";
import {
  mergeServerThreadsIntoStore,
  updateActiveSessionState,
  type PersistedStore,
} from "../../state/chatPersistence";

type UseChatThreadsBootstrapArgs = {
  authToken: string;
  sessionStoreRef: MutableRefObject<PersistedStore>;
  setSessionStore: Dispatch<SetStateAction<PersistedStore>>;
  syncAndReconnectSession: (candidate: PersistedStore["sessions"][string]["state"]) => Promise<void>;
};

export function useChatThreadsBootstrap({
  authToken,
  sessionStoreRef,
  setSessionStore,
  syncAndReconnectSession,
}: UseChatThreadsBootstrapArgs): void {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await getUserThreads(authToken);
        if (cancelled) {
          return;
        }

        const nextStore = mergeServerThreadsIntoStore(
          sessionStoreRef.current,
          response.threads,
          initialChatState,
        );

        setSessionStore(nextStore);
        const active = nextStore.sessions[nextStore.activeSessionId];
        if (active) {
          await syncAndReconnectSession(active.state);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        const detail = error instanceof Error ? error.message : "Unable to load chat history";
        setSessionStore((current) => {
          const activeSession = current.sessions[current.activeSessionId];
          if (!activeSession) {
            return current;
          }

          return updateActiveSessionState(
            current,
            {
              ...activeSession.state,
              status: "error",
              activeConfig: null,
              error: detail,
            },
            current.activeSessionId,
          );
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken, sessionStoreRef, setSessionStore, syncAndReconnectSession]);
}
