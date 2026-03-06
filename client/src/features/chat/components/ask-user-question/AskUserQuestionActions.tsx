import styles from "./AskUserQuestionActions.module.css";

type AskUserQuestionActionsProps = {
  optionsCount: number;
  multiSelect: boolean;
  allowCustomResponse: boolean;
  isEditable: boolean;
  hasInput: boolean;
  isSubmitted: boolean;
  buttonContent: string;
  onSubmitResponse: () => void;
};

function getHint(
  optionsCount: number,
  multiSelect: boolean,
  allowCustomResponse: boolean,
): string {
  if (optionsCount === 0) {
    return allowCustomResponse ? "Add a custom response." : "No options provided.";
  }

  if (multiSelect) {
    return allowCustomResponse
      ? "You can choose multiple options or add a custom response."
      : "You can choose multiple options.";
  }

  return allowCustomResponse ? "Choose one option or add a custom response." : "Choose one option.";
}

export function AskUserQuestionActions({
  optionsCount,
  multiSelect,
  allowCustomResponse,
  isEditable,
  hasInput,
  isSubmitted,
  buttonContent,
  onSubmitResponse,
}: AskUserQuestionActionsProps) {
  return (
    <div className={styles.askQuestionActions}>
      <span className={styles.askQuestionHint}>{getHint(optionsCount, multiSelect, allowCustomResponse)}</span>
      <button
        type="button"
        className={`${styles.askQuestionSubmit} ${!isEditable ? styles.askQuestionSubmitDone : ""}`}
        disabled={!isEditable || (!hasInput && !isSubmitted)}
        onClick={onSubmitResponse}
      >
        {buttonContent}
      </button>
    </div>
  );
}
