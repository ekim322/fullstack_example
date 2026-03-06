import ReactMarkdown from "react-markdown";

import type { ChatMessage } from "../../types";
import { messageMarkdownComponents } from "../shared/messageMarkdownComponents";
import styles from "./MessageThread.module.css";

type ChatConversationBubbleProps = {
  message: ChatMessage;
};

export function ChatConversationBubble({ message }: ChatConversationBubbleProps) {
  const roleClassName = message.role === "user" ? styles.userMessage : styles.assistantMessage;
  const roleLabel = message.role === "user" ? "You" : "Agent";
  const roleLabelClassName =
    message.role === "user"
      ? `${styles.messageRole} ${styles.messageRoleUser}`
      : `${styles.messageRole} ${styles.messageRoleAssistant}`;

  return (
    <div className={`${styles.messageBubble} ${roleClassName}`}>
      {message.role !== "user" ? <span className={roleLabelClassName}>{roleLabel}</span> : null}
      {message.role === "user" ? (
        <p className={styles.messageText}>{message.content || " "}</p>
      ) : (
        <div className={styles.markdownContent}>
          <ReactMarkdown components={messageMarkdownComponents}>{message.content || " "}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
