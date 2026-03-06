import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { getUserThreads } from "../../api/chatApi";
import { initialChatState, type ChatAction } from "../../state/chatReducer";
import {
  mergeServerThreadsIntoStore,
  type PersistedStore,
} from "../../state/chatPersistence";

type UseChatThreadsBootstrapArgs = {
  authToken: string;
  dispatch: Dispatch<ChatAction>;
  sessionStoreRef: MutableRefObject<PersistedStore>;
  setSessionStore: Dispatch<SetStateAction<PersistedStore>>;
  syncAndReconnectSession: (candidate: PersistedStore["sessions"][string]["state"]) => Promise<void>;
};

export function useChatThreadsBootstrap({
  authToken,
  dispatch,
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
          dispatch({ type: "hydrate", state: active.state });
          await syncAndReconnectSession(active.state);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        const detail = error instanceof Error ? error.message : "Unable to load chat history";
        dispatch({ type: "setError", error: detail });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken, dispatch, sessionStoreRef, setSessionStore, syncAndReconnectSession]);
}
