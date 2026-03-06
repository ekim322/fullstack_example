import { CHAT_MODEL_LABELS, CHAT_MODE_LABELS } from "../../config";
import { canStopSession } from "../../state/chatSelectors";
import {
  CHAT_MODEL_VALUES,
  CHAT_MODE_VALUES,
  type AgentMode,
  type ChatModel,
  type SessionStatus,
} from "../../types";
import { isAgentMode, isChatModel } from "../../utils/chatControlGuards";
import styles from "./ChatControls.module.css";

type ChatControlsProps = {
  mode: AgentMode;
  model: ChatModel;
  autoConfirmTools: boolean;
  disabled: boolean;
  sendDisabled: boolean;
  status: SessionStatus;
  onModeChange: (mode: AgentMode) => void;
  onModelChange: (model: ChatModel) => void;
  onAutoConfirmChange: (value: boolean) => void;
  onSend: () => void;
  onStop: () => void;
};

export function ChatControls({
  mode,
  model,
  autoConfirmTools,
  disabled,
  sendDisabled,
  status,
  onModeChange,
  onModelChange,
  onAutoConfirmChange,
  onSend,
  onStop,
}: ChatControlsProps) {
  const awaitingConfirmation = status === "awaiting_confirmation";

  return (
    <div className={styles.controls}>
      <div className={styles.leftControls}>
        <label className={styles.field}>
          Mode
          <select
            className={styles.select}
            value={mode}
            onChange={(event) => {
              if (isAgentMode(event.target.value)) {
                onModeChange(event.target.value);
              }
            }}
            disabled={disabled}
          >
            {CHAT_MODE_VALUES.map((modeValue) => (
              <option key={modeValue} value={modeValue}>
                {CHAT_MODE_LABELS[modeValue]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          Model
          <select
            className={styles.select}
            value={model}
            onChange={(event) => {
              if (isChatModel(event.target.value)) {
                onModelChange(event.target.value);
              }
            }}
            disabled={disabled}
          >
            {CHAT_MODEL_VALUES.map((modelValue) => (
              <option key={modelValue} value={modelValue}>
                {CHAT_MODEL_LABELS[modelValue]}
              </option>
            ))}
          </select>
        </label>

        <label className={`${styles.field} ${styles.checkboxField}`}>
          Auto Confirm
          <input
            type="checkbox"
            checked={autoConfirmTools}
            onChange={(event) => onAutoConfirmChange(event.target.checked)}
            disabled={disabled}
          />
        </label>
      </div>

      {canStopSession(status) ? (
        <button
          type="button"
          className={`${styles.sendButton} ${styles.stopButton}`}
          onClick={onStop}
          aria-label="Stop Session"
          title="Stop Session"
        >
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4.5" y="4.5" width="7" height="7" rx="0.5" fill="currentColor" />
            <circle
              className={styles.stopSpinner}
              cx="8"
              cy="8"
              r="7.25"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="30 15"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className={styles.sendButton}
          onClick={onSend}
          disabled={sendDisabled || awaitingConfirmation}
          aria-label="Send Message"
          title={
            awaitingConfirmation
              ? "Approve or decline pending tools before sending a new message"
              : "Send Message (Enter)"
          }
        >
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M1.724 1.053a.5.5 0 0 0-.714.545l1.403 4.85a.5.5 0 0 0 .397.354l5.69.953c.268.053.268.437 0 .49l-5.69.953a.5.5 0 0 0-.397.354l-1.403 4.85a.5.5 0 0 0 .714.545l13-6.5a.5.5 0 0 0 0-.894l-13-6.5Z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
