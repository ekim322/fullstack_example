import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import { useCollapsibleBlock } from "../../hooks/useCollapsibleBlock";
import type { AskUserQuestionPayload, AskUserQuestionSubmission } from "../../types";
import {
  hasAskUserQuestionSubmissionInput,
  normalizeAskUserQuestionSubmission,
} from "../../utils/askUserQuestionSubmission";

type UseAskUserQuestionBlockStateArgs = {
  toolCallId: string;
  payload: AskUserQuestionPayload;
  submission: AskUserQuestionSubmission | null;
  isWaitingForToolResult: boolean;
  isActive: boolean;
  onSubmit: (callId: string, response: AskUserQuestionSubmission) => Promise<void>;
};

type UseAskUserQuestionBlockStateResult = {
  selectedOptionIndexes: number[];
  customResponse: string;
  isSubmitting: boolean;
  isSubmitted: boolean;
  error: string | null;
  hasInput: boolean;
  isEditable: boolean;
  isExpanded: boolean;
  onHeaderKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  toggleExpanded: () => void;
  buttonContent: string;
  setCustomResponse: (value: string) => void;
  onToggleOption: (index: number) => void;
  onSubmitResponse: () => Promise<void>;
};

function composeResponse(
  payload: AskUserQuestionPayload,
  selectedOptionIndexes: number[],
  freeform: string,
): AskUserQuestionSubmission {
  const selectedOptions = selectedOptionIndexes
    .slice()
    .sort((a, b) => a - b)
    .map((index) => payload.options[index])
    .filter((label): label is string => typeof label === "string");
  const customResponse = payload.allowCustomResponse ? freeform.trim() : "";

  return {
    question: payload.question,
    selectedOptions,
    customResponse,
  };
}

function getInitialSelectedOptionIndexes(
  payload: AskUserQuestionPayload,
  submission: AskUserQuestionSubmission | null,
): number[] {
  if (!submission) {
    return [];
  }

  const indexes: number[] = [];
  submission.selectedOptions.forEach((selected) => {
    const index = payload.options.indexOf(selected);
    if (index !== -1) {
      indexes.push(index);
    }
  });
  return indexes;
}

export function useAskUserQuestionBlockState({
  toolCallId,
  payload,
  submission,
  isWaitingForToolResult,
  isActive,
  onSubmit,
}: UseAskUserQuestionBlockStateArgs): UseAskUserQuestionBlockStateResult {
  const [selectedOptionIndexes, setSelectedOptionIndexes] = useState<number[]>(() =>
    getInitialSelectedOptionIndexes(payload, submission),
  );
  const [customResponse, setCustomResponse] = useState(submission?.customResponse ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(Boolean(submission));
  const [error, setError] = useState<string | null>(null);

  const hasInput =
    selectedOptionIndexes.length > 0 || (payload.allowCustomResponse && customResponse.trim().length > 0);
  const isEditable = isActive && !isWaitingForToolResult && !isSubmitting && !isSubmitted;

  const {
    isExpanded,
    setIsExpanded,
    onHeaderKeyDown,
    toggleExpanded,
  } = useCollapsibleBlock(isEditable);

  useEffect(() => {
    if (isActive && !isWaitingForToolResult && !isSubmitted) {
      setIsExpanded(true);
    }
  }, [isActive, isWaitingForToolResult, isSubmitted, setIsExpanded]);

  useEffect(() => {
    if (isSubmitted) {
      setIsExpanded(false);
    }
  }, [isSubmitted, setIsExpanded]);

  useEffect(() => {
    if (!submission) {
      return;
    }

    setIsSubmitted(true);
  }, [submission]);

  const buttonContent = useMemo(() => {
    if (isSubmitted) return "✓ Submitted";
    if (isSubmitting) return "Submitting...";
    if (isWaitingForToolResult) return "Running...";
    if (!isActive) return "Unanswered";
    return "Submit";
  }, [isActive, isSubmitted, isSubmitting, isWaitingForToolResult]);

  const onToggleOption = (index: number) => {
    if (!isEditable) {
      return;
    }

    if (payload.multiSelect) {
      setSelectedOptionIndexes((current) =>
        current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
      );
      return;
    }

    setSelectedOptionIndexes((current) => (current[0] === index ? [] : [index]));
  };

  const onSubmitResponse = async () => {
    if (!isEditable) {
      return;
    }

    const response = normalizeAskUserQuestionSubmission(
      composeResponse(payload, selectedOptionIndexes, customResponse),
    );
    if (!hasAskUserQuestionSubmissionInput(response)) {
      setError("Select an option or add a custom response.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(toolCallId, response);
      setIsSubmitted(true);
    } catch (submitError) {
      if (submitError instanceof Error && submitError.message.trim()) {
        setError(submitError.message);
      } else {
        setError("Unable to submit response right now.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    selectedOptionIndexes,
    customResponse,
    isSubmitting,
    isSubmitted,
    error,
    hasInput,
    isEditable,
    isExpanded,
    onHeaderKeyDown,
    toggleExpanded,
    buttonContent,
    setCustomResponse,
    onToggleOption,
    onSubmitResponse,
  };
}
