import { useMemo } from "react";

import { getActiveAskUserQuestionCallIds } from "../../utils/askUserQuestionCallIds";
import type { AskUserQuestionSubmission, ChatMessage, SessionStatus, ToolCall } from "../../types";
import { useMessageListAutoScroll } from "./useMessageListAutoScroll";
import { ChatConversationBubble } from "./ChatConversationBubble";
import { ToolBlockGroup } from "../tool-block/ToolBlockGroup";
import { ReasoningBlock } from "../tool-block/ReasoningBlock";
import { AnimatedDots } from "../shared/AnimatedDots";
import {
  groupMessagesByToolCall,
  isToolGroup,
  normalizeVisibleMessages,
} from "../../utils/messageTransforms";
import styles from "./MessageThread.module.css";

type ChatMessageListProps = {
  messages: ChatMessage[];
  showThinking: boolean;
  status: SessionStatus;
  pendingToolCalls: ToolCall[];
  decisions: Record<string, boolean>;
  onDecisionChange: (callId: string, approved: boolean) => void;
  onOpenWorkspacePath?: (path: string) => void;
  onAskUserQuestionSubmit: (callId: string, response: AskUserQuestionSubmission) => Promise<void>;
};

export function ChatMessageList({
  messages,
  showThinking,
  status,
  pendingToolCalls,
  decisions,
  onDecisionChange,
  onOpenWorkspacePath,
  onAskUserQuestionSubmit,
}: ChatMessageListProps) {
  const { bottomRef, scrollContainerRef, onScroll } = useMessageListAutoScroll({
    messages,
    showThinking,
    status,
  });

  const visibleMessages = useMemo(() => normalizeVisibleMessages(messages), [messages]);
  const groupedItems = useMemo(() => groupMessagesByToolCall(visibleMessages), [visibleMessages]);
  const pendingById = useMemo(
    () => new Map(pendingToolCalls.map((call) => [call.call_id, call])),
    [pendingToolCalls],
  );
  const allowConfirmation = status === "awaiting_confirmation";
  const activeAskUserQuestionCallIds = useMemo(
    () => new Set(getActiveAskUserQuestionCallIds(visibleMessages)),
    [visibleMessages],
  );
  const nextUserMessageByIndex = useMemo(() => {
    const nextMessages: Array<string | undefined> = new Array(groupedItems.length);
    let nextUserMessage: string | undefined;

    for (let index = groupedItems.length - 1; index >= 0; index -= 1) {
      const item = groupedItems[index];
      nextMessages[index] = nextUserMessage;

      if (!isToolGroup(item) && item.role === "user") {
        nextUserMessage = item.content;
      }
    }

    return nextMessages;
  }, [groupedItems]);

  return (
    <div className={styles.messages} ref={scrollContainerRef} onScroll={onScroll}>
      {groupedItems.map((item, index) => {
        if (isToolGroup(item)) {
          return (
            <ToolBlockGroup
              key={item.callId}
              item={item}
              pendingById={pendingById}
              allowConfirmation={allowConfirmation}
              decisions={decisions}
              onDecisionChange={onDecisionChange}
              onOpenWorkspacePath={onOpenWorkspacePath}
              isAskUserQuestionActive={activeAskUserQuestionCallIds.has(item.callId)}
              onAskUserQuestionSubmit={onAskUserQuestionSubmit}
              nextUserMessageContent={nextUserMessageByIndex[index]}
            />
          );
        }

        if (item.kind === "reasoning") {
          const isStreaming = index === groupedItems.length - 1 && status === "running";
          return <ReasoningBlock key={item.id} message={item} isStreaming={isStreaming} />;
        }

        return <ChatConversationBubble key={item.id} message={item} />;
      })}

      {showThinking ? (
        <div
          className={`${styles.messageBubble} ${styles.assistantMessage}`}
          aria-live={status === "running" ? "polite" : undefined}
        >
          <p className={styles.thinkingText}>Thinking<AnimatedDots /></p>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
