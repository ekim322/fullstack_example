import type { AskUserQuestionPayload, AskUserQuestionSubmission } from "../types";

export function toAskUserQuestionPayload(parsed: Record<string, unknown> | null): AskUserQuestionPayload | null {
  if (!parsed) {
    return null;
  }

  const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
  if (!question) {
    return null;
  }

  const options = Array.isArray(parsed.options)
    ? parsed.options.filter((option): option is string => typeof option === "string")
    : [];
  const descriptions = Array.isArray(parsed.option_descriptions)
    ? parsed.option_descriptions.map((description) => (typeof description === "string" ? description : ""))
    : [];
  const optionDescriptions = options.map((_, index) => descriptions[index] ?? "");
  const allowCustomResponse = parsed.allow_custom_response !== false;

  return {
    question,
    options,
    optionDescriptions,
    multiSelect: parsed.multi_select === true,
    allowCustomResponse,
  };
}

export function extractAskUserQuestionSubmission(
  nextUserMessageContent: string | undefined,
  payload: AskUserQuestionPayload,
): AskUserQuestionSubmission | null {
  if (!nextUserMessageContent) {
    return null;
  }

  const lines = nextUserMessageContent.split("\n");
  const normalizedQuestion = payload.question.trim();

  const parseSubmissionFromLineIndex = (
    questionLineIndex: number,
    options: { expectAnswerLabel: boolean; stopAtQuestionLabel: boolean },
  ): AskUserQuestionSubmission => {
    let index = questionLineIndex + 1;
    if (options.expectAnswerLabel) {
      while (index < lines.length && lines[index].trim() === "") {
        index += 1;
      }
      if (index < lines.length && /^A:\s*$/i.test(lines[index].trim())) {
        index += 1;
      }
    }

    const selectedOptions: string[] = [];
    const customLines: string[] = [];
    let foundAnyResponseLines = false;

    for (; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmedLine = line.trim();

      if (trimmedLine === "") {
        if (!foundAnyResponseLines) {
          continue;
        }
        break;
      }

      if (options.stopAtQuestionLabel && /^Q:\s*/i.test(trimmedLine)) {
        break;
      }

      const bulletMatch = line.match(/^\s*-\s+(.*)$/);
      if (bulletMatch) {
        foundAnyResponseLines = true;
        const value = bulletMatch[1].trim();
        if (value !== "(no response)") {
          if (payload.options.includes(value)) {
            selectedOptions.push(value);
          } else {
            customLines.push(value);
          }
        }
        continue;
      }

      if (foundAnyResponseLines) {
        customLines.push(line);
        continue;
      }

      break;
    }

    return {
      question: payload.question,
      selectedOptions,
      customResponse: customLines.join("\n"),
    };
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!/^Q:\s*/i.test(line)) {
      continue;
    }

    const questionPart = line.replace(/^Q:\s*/i, "").trim();
    if (questionPart !== normalizedQuestion) {
      continue;
    }

    return parseSubmissionFromLineIndex(index, { expectAnswerLabel: true, stopAtQuestionLabel: true });
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== normalizedQuestion) {
      continue;
    }

    return parseSubmissionFromLineIndex(index, { expectAnswerLabel: false, stopAtQuestionLabel: false });
  }

  return null;
}
