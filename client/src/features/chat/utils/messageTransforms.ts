import type { ChatMessage } from "../types";

export type ToolGroup = {
  kind: "tool_group";
  callId: string;
  callMessage?: ChatMessage;
  resultMessage?: ChatMessage;
};

export type MessageListItem = ChatMessage | ToolGroup;

function isToolKind(kind: ChatMessage["kind"]): kind is "tool_call" | "tool_result" {
  return kind === "tool_call" || kind === "tool_result";
}

export function normalizeVisibleMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(
      (message) =>
        message.role === "user" ||
        isToolKind(message.kind) ||
        message.content.trim().length > 0,
    );
}

export function groupMessagesByToolCall(messages: ChatMessage[]): MessageListItem[] {
  const grouped: MessageListItem[] = [];
  const groupsByCallId = new Map<string, ToolGroup>();
  let currentFallbackGroup: ToolGroup | null = null;

  messages.forEach((message) => {
    if (!isToolKind(message.kind)) {
      grouped.push(message);
      currentFallbackGroup = null;
      return;
    }

    if (message.toolCallId) {
      const existing = groupsByCallId.get(message.toolCallId);
      if (existing) {
        if (message.kind === "tool_call") {
          existing.callMessage = message;
        } else {
          existing.resultMessage = message;
        }
        return;
      }

      const nextGroup: ToolGroup = {
        kind: "tool_group",
        callId: message.toolCallId,
        callMessage: message.kind === "tool_call" ? message : undefined,
        resultMessage: message.kind === "tool_result" ? message : undefined,
      };

      groupsByCallId.set(nextGroup.callId, nextGroup);
      grouped.push(nextGroup);
      return;
    }

    if (message.kind === "tool_call") {
      const nextGroup: ToolGroup = {
        kind: "tool_group",
        callId: message.id,
        callMessage: message,
      };

      currentFallbackGroup = nextGroup;
      grouped.push(nextGroup);
      return;
    }

    if (currentFallbackGroup && !currentFallbackGroup.resultMessage) {
      currentFallbackGroup.resultMessage = message;
      currentFallbackGroup = null;
      return;
    }

    grouped.push({
      kind: "tool_group",
      callId: message.id,
      resultMessage: message,
    });
  });

  return grouped;
}

export function isToolGroup(item: MessageListItem): item is ToolGroup {
  return "kind" in item && item.kind === "tool_group";
}
