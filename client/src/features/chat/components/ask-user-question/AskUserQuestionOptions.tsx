import styles from "./AskUserQuestionOptions.module.css";

type AskUserQuestionOptionsProps = {
  toolCallId: string;
  options: string[];
  optionDescriptions: string[];
  selectedOptionIndexes: number[];
  isEditable: boolean;
  onToggleOption: (index: number) => void;
};

export function AskUserQuestionOptions({
  toolCallId,
  options,
  optionDescriptions,
  selectedOptionIndexes,
  isEditable,
  onToggleOption,
}: AskUserQuestionOptionsProps) {
  return (
    <div className={styles.askQuestionOptions}>
      {options.map((option, index) => {
        const description = optionDescriptions[index] ?? "";
        const isSelected = selectedOptionIndexes.includes(index);
        const optionClassName = `${styles.askQuestionOption} ${
          isSelected ? styles.askQuestionOptionSelected : ""
        } ${!isEditable ? styles.askQuestionOptionDisabled : ""}`;

        return (
          <button
            key={`${toolCallId}-${option}-${index.toString()}`}
            type="button"
            className={optionClassName}
            onClick={() => onToggleOption(index)}
            disabled={!isEditable}
            aria-pressed={isSelected}
          >
            <span className={styles.askQuestionOptionLabel}>{option}</span>
            {description ? <span className={styles.askQuestionOptionDescription}>{description}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
