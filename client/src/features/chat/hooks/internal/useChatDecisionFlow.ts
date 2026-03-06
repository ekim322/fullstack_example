import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject } from "react";

import { continueChatSession } from "../../api/chatApi";
import type { ChatAction } from "../../state/chatReducer";
import type { ChatState } from "../../types";

type UseChatDecisionFlowArgs = {
  authToken: string;
  userId: string;
  state: ChatState;
  stateRef: MutableRefObject<ChatState>;
  dispatch: Dispatch<ChatAction>;
  connectToSession: (sessionId: string, lastId: string) => void;
};

type UseChatDecisionFlowResult = {
  continuePendingDecisions: (snapshot: ChatState) => Promise<void>;
  submitPendingDecisions: () => Promise<void>;
  setDecision: (callId: string, approved: boolean) => void;
};

export function useChatDecisionFlow({
  authToken,
  userId,
  state,
  stateRef,
  dispatch,
  connectToSession,
}: UseChatDecisionFlowArgs): UseChatDecisionFlowResult {
  const decisionInteractionRef = useRef(false);

  const continuePendingDecisions = useCallback(async (snapshot: ChatState) => {
    if (!snapshot.threadId || snapshot.status !== "awaiting_confirmation") {
      return;
    }

    decisionInteractionRef.current = false;
    dispatch({ type: "confirmStarted" });

    try {
      const response = await continueChatSession({
        user_id: userId,
        thread_id: snapshot.threadId,
        confirmations: snapshot.decisionByCallId,
      }, authToken);

      dispatch({ type: "sessionStarted", threadId: response.thread_id, sessionId: response.session_id });
      connectToSession(response.session_id, "0-0");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to continue session";
      dispatch({ type: "setError", error: detail });
      throw error;
    }
  }, [authToken, connectToSession, dispatch, userId]);

  const submitPendingDecisions = useCallback(async () => {
    const snapshot = stateRef.current;
    if (!snapshot.threadId || snapshot.status !== "awaiting_confirmation") {
      return;
    }

    try {
      await continuePendingDecisions(snapshot);
    } catch {
      // continuePendingDecisions already updates the session error state.
    }
  }, [continuePendingDecisions, stateRef]);

  useEffect(() => {
    if (state.status !== "awaiting_confirmation") {
      decisionInteractionRef.current = false;
      return;
    }

    if (!decisionInteractionRef.current || state.pendingToolCalls.length === 0) {
      return;
    }

    const allChosen = state.pendingToolCalls.every((call) =>
      Object.prototype.hasOwnProperty.call(state.decisionByCallId, call.call_id),
    );
    if (!allChosen) {
      return;
    }

    void submitPendingDecisions();
  }, [state.status, state.pendingToolCalls, state.decisionByCallId, submitPendingDecisions]);

  const setDecision = useCallback((callId: string, approved: boolean) => {
    decisionInteractionRef.current = true;
    dispatch({ type: "setDecision", callId, approved });
  }, [dispatch]);

  return {
    continuePendingDecisions,
    submitPendingDecisions,
    setDecision,
  };
}

