import { ToolStatusIcon } from "./ToolStatusIcon";
import styles from "./ToolBlockHeaderRight.module.css";

type ToolBlockHeaderRightProps = {
  toolCallId: string;
  isPending: boolean;
  hasResult: boolean;
  isDeclined: boolean;
  allowConfirmation: boolean;
  decisions: Record<string, boolean>;
  onDecisionChange: (callId: string, approved: boolean) => void;
};

export function ToolBlockHeaderRight({
  toolCallId,
  isPending,
  hasResult,
  isDeclined,
  allowConfirmation,
  decisions,
  onDecisionChange,
}: ToolBlockHeaderRightProps) {
  return (
    <div className={styles.toolHeaderRight} onClick={(event) => event.stopPropagation()}>
      {isPending ? (
        <div className={styles.toolDecisionOptions}>
          <button
            type="button"
            className={`${styles.decisionButton} ${
              decisions[toolCallId] === true ? styles.decisionButtonActive : ""
            }`}
            onClick={() => onDecisionChange(toolCallId, true)}
            disabled={!allowConfirmation}
            aria-pressed={decisions[toolCallId] === true}
          >
            Approve
          </button>
          <button
            type="button"
            className={`${styles.decisionButton} ${
              decisions[toolCallId] === false ? styles.decisionButtonActiveDecline : ""
            }`}
            onClick={() => onDecisionChange(toolCallId, false)}
            disabled={!allowConfirmation}
            aria-pressed={decisions[toolCallId] === false}
          >
            Decline
          </button>
        </div>
      ) : hasResult ? (
        isDeclined ? (
          <ToolStatusIcon status="error" className={styles.statusError} />
        ) : (
          <ToolStatusIcon status="done" className={styles.statusDone} />
        )
      ) : (
        <span className={styles.statusRunning}>
          <svg className={styles.spinner} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="10 16"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
    </div>
  );
}
