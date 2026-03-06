import type { Dispatch } from "react";

import { getThreadStatus } from "../../api/chatApi";
import type { ChatAction } from "../../state/chatReducer";
import { isRunningSessionStatus } from "../../state/sessionStatus";
import type { SessionStatus } from "../../types";
import { isInvalidSessionError } from "../../../../shared/api/httpClient";

type SyncSessionStatusArgs = {
  threadId: string;
  authToken: string;
  status: SessionStatus;
  fallbackSessionId: string | null;
  lastEventId: string | null;
  dispatch: Dispatch<ChatAction>;
  connectToSession: (sessionId: string, lastId: string) => void;
  onInvalidSession: () => void;
};

export async function syncSessionStatus({
  threadId,
  authToken,
  status,
  fallbackSessionId,
  lastEventId,
  dispatch,
  connectToSession,
  onInvalidSession,
}: SyncSessionStatusArgs): Promise<void> {
  try {
    const response = await getThreadStatus(threadId, authToken);
    dispatch({ type: "syncStatus", status: response });

    if (response.status === "running") {
      const resumeSessionId = response.current_session_id ?? fallbackSessionId;
      if (resumeSessionId) {
        connectToSession(resumeSessionId, lastEventId || "0-0");
      }
    }
  } catch (error) {
    if (isInvalidSessionError(error)) {
      onInvalidSession();
      return;
    }

    if (isRunningSessionStatus(status) && fallbackSessionId) {
      connectToSession(fallbackSessionId, lastEventId || "0-0");
    }
  }
}
