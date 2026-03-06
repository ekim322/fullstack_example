import type { AskUserQuestionPayload, AskUserQuestionSubmission } from "../../types";
import { AskUserQuestionActions } from "./AskUserQuestionActions";
import { AskUserQuestionHeaderStatus } from "./AskUserQuestionHeaderStatus";
import { AskUserQuestionOptions } from "./AskUserQuestionOptions";
import { CollapsibleBlockHeader } from "../shared/CollapsibleBlockHeader";
import { useAskUserQuestionBlockState } from "./useAskUserQuestionBlockState";
import askStyles from "./AskUserQuestionBlock.module.css";

type AskUserQuestionBlockProps = {
  toolCallId: string;
  payload: AskUserQuestionPayload;
  submission: AskUserQuestionSubmission | null;
  isWaitingForToolResult: boolean;
  isActive: boolean;
  onSubmit: (callId: string, response: AskUserQuestionSubmission) => Promise<void>;
};

export function AskUserQuestionBlock({
  toolCallId,
  payload,
  submission,
  isWaitingForToolResult,
  isActive,
  onSubmit,
}: AskUserQuestionBlockProps) {
  const {
    isExpanded,
    onHeaderKeyDown,
    toggleExpanded,
    selectedOptionIndexes,
    customResponse,
    isSubmitted,
    error,
    hasInput,
    isEditable,
    buttonContent,
    setCustomResponse,
    onToggleOption,
    onSubmitResponse,
  } = useAskUserQuestionBlockState({
    toolCallId,
    payload,
    submission,
    isWaitingForToolResult,
    isActive,
    onSubmit,
  });

  return (
    <div className={`${askStyles.messageBubble} ${askStyles.toolBlock} ${askStyles.askQuestionBlock}`}>
      <CollapsibleBlockHeader
        isExpanded={isExpanded}
        onToggle={toggleExpanded}
        onHeaderKeyDown={onHeaderKeyDown}
        headerClassName={askStyles.askQuestionHeader}
        expandedHeaderClassName={askStyles.askQuestionHeaderExpanded}
        caretClassName={`${askStyles.caret} ${askStyles.askQuestionCaret}`}
        expandedCaretClassName={askStyles.caretExpanded}
      >
        <div className={askStyles.askQuestionTitle}>
          <p className={askStyles.askQuestionPrompt}>{payload.question}</p>
        </div>
        <AskUserQuestionHeaderStatus isExpanded={isExpanded} isActive={isActive} isSubmitted={isSubmitted} />
      </CollapsibleBlockHeader>

      {isExpanded ? (
        <>
          <AskUserQuestionOptions
            toolCallId={toolCallId}
            options={payload.options}
            optionDescriptions={payload.optionDescriptions}
            selectedOptionIndexes={selectedOptionIndexes}
            isEditable={isEditable}
            onToggleOption={onToggleOption}
          />

          {payload.allowCustomResponse ? (
            <label className={askStyles.askQuestionInputLabel}>
              Additional context (optional)
              <textarea
                className={askStyles.askQuestionInput}
                value={customResponse}
                onChange={(event) => setCustomResponse(event.target.value)}
                placeholder="Type a custom response..."
                disabled={!isEditable}
              />
            </label>
          ) : null}

          {error ? <p className={askStyles.askQuestionError}>{error}</p> : null}

          <AskUserQuestionActions
            optionsCount={payload.options.length}
            multiSelect={payload.multiSelect}
            allowCustomResponse={payload.allowCustomResponse}
            isEditable={isEditable}
            hasInput={hasInput}
            isSubmitted={isSubmitted}
            buttonContent={buttonContent}
            onSubmitResponse={onSubmitResponse}
          />
        </>
      ) : null}
    </div>
  );
}
