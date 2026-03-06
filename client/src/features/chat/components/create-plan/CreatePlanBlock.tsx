import { useCollapsibleBlock } from "../../hooks/useCollapsibleBlock";
import { CollapsibleBlockHeader } from "../shared/CollapsibleBlockHeader";
import { OpenWorkspaceButton } from "../tool-block/OpenWorkspaceButton";
import { ToolBlockHeaderRight } from "../tool-block/ToolBlockHeaderRight";
import styles from "./CreatePlanBlock.module.css";

export type PlanStep = {
  step: number;
  description: string;
  sub_steps: string[];
};

type CreatePlanBlockProps = {
  toolCallId: string;
  plan: PlanStep[];
  savedPath: string | null;
  workspaceOpenPath: string | null;
  onOpenWorkspacePath?: (path: string) => void;
  isPending: boolean;
  hasResult: boolean;
  isDeclined: boolean;
  allowConfirmation: boolean;
  decisions: Record<string, boolean>;
  onDecisionChange: (callId: string, approved: boolean) => void;
};

export function CreatePlanBlock({
  toolCallId,
  plan,
  savedPath,
  workspaceOpenPath,
  onOpenWorkspacePath,
  isPending,
  hasResult,
  isDeclined,
  allowConfirmation,
  decisions,
  onDecisionChange,
}: CreatePlanBlockProps) {
  const { isExpanded, onHeaderKeyDown, toggleExpanded } = useCollapsibleBlock(true); // default expanded

  // Utility to strip leading "1. " or "1.1 " from the description since we render our own numbers/bullets
  const stripPrefix = (text: string) => {
    return text.replace(/^[\d.]+\s*/, "");
  };

  return (
    <div className={`${styles.messageBubble} ${styles.toolBlock} ${styles.planBlock}`}>
      <CollapsibleBlockHeader
        isExpanded={isExpanded}
        onToggle={toggleExpanded}
        onHeaderKeyDown={onHeaderKeyDown}
        headerClassName={styles.planHeader}
        expandedHeaderClassName={styles.planHeaderExpanded}
        caretClassName={`${styles.caret} ${styles.planCaret}`}
        expandedCaretClassName={styles.caretExpanded}
      >
        <div className={styles.planTitle}>
          <span className={styles.planIcon}>
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M2.5 4h11M2.5 8h11M2.5 12h11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className={styles.planTitleText}>Proposed Plan</p>
          {workspaceOpenPath && onOpenWorkspacePath ? (
            <span className={styles.planTitleAction}>
              <OpenWorkspaceButton
                path={workspaceOpenPath}
                onOpenPath={onOpenWorkspacePath}
              />
            </span>
          ) : null}
        </div>
        <ToolBlockHeaderRight
          toolCallId={toolCallId}
          isPending={isPending}
          hasResult={hasResult}
          isDeclined={isDeclined}
          allowConfirmation={allowConfirmation}
          decisions={decisions}
          onDecisionChange={onDecisionChange}
        />
      </CollapsibleBlockHeader>

      {isExpanded ? (
        <div className={styles.planContent}>
          {savedPath ? <p className={styles.savedPathText}>Saved to: {savedPath}</p> : null}
          {plan.map((step) => (
            <div key={step.step} className={styles.planStep}>
              <div className={styles.planStepHeader}>
                <span className={styles.planStepNumber}>{step.step}</span>
                <p className={styles.planStepDescription}>{stripPrefix(step.description)}</p>
              </div>
              {step.sub_steps && step.sub_steps.length > 0 ? (
                <div className={styles.planSubSteps}>
                  {step.sub_steps.map((subStep, i) => (
                    <div key={i} className={styles.planSubStep}>
                      <span className={styles.planSubStepBullet}>•</span>
                      <p className={styles.planSubStepText}>{stripPrefix(subStep)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
