import styles from "./AskUserQuestionHeaderStatus.module.css";
import { ToolStatusIcon } from "../tool-block/ToolStatusIcon";

type AskUserQuestionHeaderStatusProps = {
  isExpanded: boolean;
  isActive: boolean;
  isSubmitted: boolean;
};

export function AskUserQuestionHeaderStatus({
  isExpanded,
  isActive,
  isSubmitted,
}: AskUserQuestionHeaderStatusProps) {
  if (isExpanded || (isActive && !isSubmitted)) {
    return null;
  }

  return (
    <div className={styles.toolHeaderRight}>
      {isSubmitted ? (
        <ToolStatusIcon status="done" className={styles.statusDone} />
      ) : (
        <ToolStatusIcon status="error" className={styles.statusError} />
      )}
    </div>
  );
}
