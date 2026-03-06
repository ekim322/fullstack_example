import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

import { canStopSession } from "../../state/chatSelectors";
import type { AgentMode, ChatModel, SessionStatus } from "../../types";
import { ChatControls } from "./ChatControls";
import styles from "./ChatComposer.module.css";

type ChatComposerProps = {
  draft: string;
  mode: AgentMode;
  model: ChatModel;
  autoConfirmTools: boolean;
  disabled: boolean;
  sendDisabled: boolean;
  status: SessionStatus;
  onDraftChange: (value: string) => void;
  onModeChange: (mode: AgentMode) => void;
  onModelChange: (model: ChatModel) => void;
  onAutoConfirmChange: (value: boolean) => void;
  onSend: () => void;
  onStop: () => void;
};

export function ChatComposer({
  draft,
  mode,
  model,
  autoConfirmTools,
  disabled,
  sendDisabled,
  status,
  onDraftChange,
  onModeChange,
  onModelChange,
  onAutoConfirmChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [draft]);

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    if (canStopSession(status)) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (!sendDisabled) {
      onSend();
    }
  };

  return (
    <section className={styles.composerSection}>
      <div className={styles.inputContainer}>
        <label className={styles.inputLabel} htmlFor="chat-draft">
          Message
        </label>
        <textarea
          ref={textareaRef}
          id="chat-draft"
          className={styles.input}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleDraftKeyDown}
          placeholder="Ask the agent... (Enter to send, Cmd+Enter for new line)"
        />

        <ChatControls
          mode={mode}
          model={model}
          autoConfirmTools={autoConfirmTools}
          disabled={disabled}
          sendDisabled={sendDisabled}
          status={status}
          onModeChange={onModeChange}
          onModelChange={onModelChange}
          onAutoConfirmChange={onAutoConfirmChange}
          onSend={onSend}
          onStop={onStop}
        />
      </div>
    </section>
  );
}
