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
  shouldApply?: () => boolean;
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
  shouldApply,
}: SyncSessionStatusArgs): Promise<void> {
  try {
    const response = await getThreadStatus(threadId, authToken);

    if (shouldApply && !shouldApply()) {
      return;
    }

    dispatch({ type: "syncStatus", status: response });

    if (response.status === "running") {
      const resumeSessionId = response.current_session_id ?? fallbackSessionId;
      if (resumeSessionId) {
        const resumeFromId = resumeSessionId === fallbackSessionId ? (lastEventId || "0-0") : "0-0";

        if (shouldApply && !shouldApply()) {
          return;
        }

        connectToSession(resumeSessionId, resumeFromId);
      }
    }
  } catch (error) {
    if (isInvalidSessionError(error)) {
      onInvalidSession();
      return;
    }

    if (isRunningSessionStatus(status) && fallbackSessionId) {
      if (shouldApply && !shouldApply()) {
        return;
      }
      connectToSession(fallbackSessionId, lastEventId || "0-0");
    }
  }
}
