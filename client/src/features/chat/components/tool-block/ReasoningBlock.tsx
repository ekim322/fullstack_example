import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "../../types";
import { AnimatedDots } from "../shared/AnimatedDots";
import { messageMarkdownComponents } from "../shared/messageMarkdownComponents";
import { useCollapsibleBlock } from "../../hooks/useCollapsibleBlock";
import { CollapsibleBlockHeader } from "../shared/CollapsibleBlockHeader";
import messageStyles from "../messages/MessageThread.module.css";
import styles from "./ReasoningBlock.module.css";

type ReasoningBlockProps = {
  message: ChatMessage;
  isStreaming: boolean;
};

export function ReasoningBlock({ message, isStreaming }: ReasoningBlockProps) {
  const {
    isExpanded: expanded,
    onHeaderKeyDown,
    toggleExpanded,
  } = useCollapsibleBlock(false);

  return (
    <div className={styles.reasoningBlock}>
      <CollapsibleBlockHeader
        isExpanded={expanded}
        onToggle={toggleExpanded}
        onHeaderKeyDown={onHeaderKeyDown}
        headerClassName={styles.header}
        expandedHeaderClassName={styles.headerExpanded}
        caretClassName={styles.caret}
        expandedCaretClassName={styles.caretExpanded}
      >
        <span className={styles.icon}>
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6 5.5a2 2 0 114 0c0 .74-.43 1.25-.92 1.76l-.08.08c-.46.47-.88.9-.96 1.54H6.8c.06-.32.28-.56.64-.93.53-.54 1.06-1.07 1.06-2.45a2.5 2.5 0 10-5 0h1.5zm2.5 7.5h-1v-1.5h1v1.5z" />
          </svg>
        </span>
        <span className={styles.title}>
          Reasoning{isStreaming ? <AnimatedDots /> : null}
        </span>
      </CollapsibleBlockHeader>

      {expanded ? (
        <div className={styles.content}>
          <div className={`${messageStyles.markdownContent} ${styles.markdownOverride}`}>
            <ReactMarkdown components={messageMarkdownComponents}>{message.content || " "}</ReactMarkdown>
          </div>
        </div>
      ) : null}
    </div>
  );
}
