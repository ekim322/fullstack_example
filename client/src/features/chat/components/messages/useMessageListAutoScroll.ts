import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { ChatMessage, SessionStatus } from "../../types";

type UseMessageListAutoScrollArgs = {
  messages: ChatMessage[];
  showThinking: boolean;
  status: SessionStatus;
};

type UseMessageListAutoScrollResult = {
  bottomRef: RefObject<HTMLDivElement>;
  scrollContainerRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
};

export function useMessageListAutoScroll({
  messages,
  showThinking,
  status,
}: UseMessageListAutoScrollArgs): UseMessageListAutoScrollResult {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isAutoScrollEnabled = useRef(true);
  const lastScrollTopRef = useRef<number>(0);

  const onScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const isScrollingUp = scrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;

    const distanceToBottom = container.scrollHeight - scrollTop - container.clientHeight;
    if (distanceToBottom < 30) {
      isAutoScrollEnabled.current = true;
    } else if (isScrollingUp) {
      isAutoScrollEnabled.current = false;
    }
  }, []);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const isLastMessageUser = lastMessage?.role === "user";
    const shouldUseSmoothScroll = isLastMessageUser && status !== "running";
    const behavior: ScrollBehavior = shouldUseSmoothScroll ? "smooth" : "auto";

    if (isAutoScrollEnabled.current || isLastMessageUser) {
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    }
  }, [messages, showThinking, status]);

  return {
    bottomRef,
    scrollContainerRef,
    onScroll,
  };
}
