import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

import type { AskUserQuestionSubmission, ChatState } from "../../types";
import {
  hasAskUserQuestionSubmissionInput,
  normalizeAskUserQuestionSubmission,
} from "../../utils/askUserQuestionSubmission";
import { getActiveAskUserQuestionCallIds } from "../../utils/askUserQuestionCallIds";

type AskUserQuestionBatchItem = {
  question: string;
  selectedOptions: string[];
  customResponse: string;
};

type UseAskUserQuestionBatchingArgs = {
  state: ChatState;
  stateRef: MutableRefObject<ChatState>;
  continuePendingDecisions: (snapshot: ChatState) => Promise<void>;
  sendRawMessage: (message: string, options?: { allowActiveStatus?: boolean }) => Promise<void>;
};

type UseAskUserQuestionBatchingResult = {
  resetAskUserQuestionFlow: () => void;
  submitAskUserQuestionResponse: (callId: string, response: AskUserQuestionSubmission) => Promise<void>;
};

function buildAskUserQuestionBatchMessage(items: AskUserQuestionBatchItem[]): string {
  return items
    .map((item) => {
      const custom = item.customResponse.trim();
      const lines = item.selectedOptions
        .map((option) => option.trim())
        .filter((option) => option.length > 0);

      if (custom) {
        lines.push(custom);
      }

      const bullets = (lines.length > 0 ? lines : ["(no response)"])
        .map((line) => ` - ${line}`)
        .join("\n");

      return `Q: ${item.question}\nA:\n${bullets}`;
    })
    .join("\n\n");
}

export function useAskUserQuestionBatching({
  state,
  stateRef,
  continuePendingDecisions,
  sendRawMessage,
}: UseAskUserQuestionBatchingArgs): UseAskUserQuestionBatchingResult {
  const queuedUserMessageRef = useRef<string | null>(null);
  const askUserQuestionResponsesRef = useRef<Record<string, AskUserQuestionSubmission>>({});

  const resetAskUserQuestionFlow = useCallback(() => {
    queuedUserMessageRef.current = null;
    askUserQuestionResponsesRef.current = {};
  }, []);

  const submitAskUserQuestionResponse = useCallback(async (callId: string, response: AskUserQuestionSubmission) => {
    const normalizedResponse = normalizeAskUserQuestionSubmission(response);
    if (!hasAskUserQuestionSubmissionInput(normalizedResponse)) {
      throw new Error("Enter a response before submitting.");
    }

    const snapshot = stateRef.current;
    askUserQuestionResponsesRef.current[callId] = normalizedResponse;

    const activeCallIds = getActiveAskUserQuestionCallIds(snapshot.messages);
    const batchCallIds = activeCallIds.length > 0 ? activeCallIds : [callId];
    const missingCallIds = batchCallIds.filter((id) => !askUserQuestionResponsesRef.current[id]);
    if (missingCallIds.length > 0) {
      return;
    }

    const batchItems: AskUserQuestionBatchItem[] = batchCallIds
      .map((id) => {
        const submission = askUserQuestionResponsesRef.current[id];
        if (!submission) {
          return null;
        }
        return {
          question: submission.question,
          selectedOptions: submission.selectedOptions,
          customResponse: submission.customResponse,
        };
      })
      .filter((item): item is AskUserQuestionBatchItem => item !== null);

    if (batchItems.length === 0) {
      throw new Error("Enter a response before submitting.");
    }

    const answer = buildAskUserQuestionBatchMessage(batchItems);

    if (snapshot.status === "running") {
      queuedUserMessageRef.current = answer;
      askUserQuestionResponsesRef.current = {};
      return;
    }

    if (snapshot.status === "awaiting_confirmation") {
      const allChosen = snapshot.pendingToolCalls.every((call) =>
        Object.prototype.hasOwnProperty.call(snapshot.decisionByCallId, call.call_id),
      );
      if (!allChosen) {
        throw new Error("Choose Approve or Decline for all pending tool calls before submitting your response.");
      }

      queuedUserMessageRef.current = answer;
      await continuePendingDecisions(snapshot);
      askUserQuestionResponsesRef.current = {};
      return;
    }

    queuedUserMessageRef.current = null;
    await sendRawMessage(answer);
    askUserQuestionResponsesRef.current = {};
  }, [continuePendingDecisions, sendRawMessage, stateRef]);

  useEffect(() => {
    const queuedMessage = queuedUserMessageRef.current;
    if (!queuedMessage) {
      return;
    }

    if (state.status === "running" || state.status === "awaiting_confirmation") {
      return;
    }

    queuedUserMessageRef.current = null;
    void sendRawMessage(queuedMessage).catch(() => {
      // sendRawMessage already updates the session error state.
    });
  }, [sendRawMessage, state.status]);

  useEffect(() => {
    if (getActiveAskUserQuestionCallIds(state.messages).length > 0) {
      return;
    }

    askUserQuestionResponsesRef.current = {};
  }, [state.messages]);

  return {
    resetAskUserQuestionFlow,
    submitAskUserQuestionResponse,
  };
}
