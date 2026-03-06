import type { AskUserQuestionSubmission } from "../types";

export function normalizeAskUserQuestionSubmission(
  response: AskUserQuestionSubmission,
): AskUserQuestionSubmission {
  const selectedOptions = response.selectedOptions
    .map((option) => option.trim())
    .filter((option) => option.length > 0);

  return {
    question: response.question.trim() || "Question",
    selectedOptions,
    customResponse: response.customResponse.trim(),
  };
}

export function hasAskUserQuestionSubmissionInput(response: AskUserQuestionSubmission): boolean {
  return response.selectedOptions.length > 0 || response.customResponse.length > 0;
}
