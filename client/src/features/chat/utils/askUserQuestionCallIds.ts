import { ASK_USER_QUESTION_TOOL_NAME } from "../constants";
import type { ChatMessage } from "../types";

export function getActiveAskUserQuestionCallIds(messages: ChatMessage[]): string[] {
  let lastUserMessageIndex = -1;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index].role === "user") {
      lastUserMessageIndex = index;
    }
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = lastUserMessageIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.kind !== "tool_call" || message.name !== ASK_USER_QUESTION_TOOL_NAME || !message.toolCallId) {
      continue;
    }

    if (seen.has(message.toolCallId)) {
      continue;
    }

    seen.add(message.toolCallId);
    ids.push(message.toolCallId);
  }

  return ids;
}
