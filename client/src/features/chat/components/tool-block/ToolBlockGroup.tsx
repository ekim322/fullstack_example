import { ASK_USER_QUESTION_TOOL_NAME, CREATE_PLAN_TOOL_NAME } from "../../constants";
import type { AskUserQuestionSubmission, ToolCall } from "../../types";
import { parseToolBlockData } from "../../utils/toolBlockData";
import { AskUserQuestionBlock } from "../ask-user-question/AskUserQuestionBlock";
import { CreatePlanBlock } from "../create-plan/CreatePlanBlock";
import { ToolArguments } from "./ToolArguments";
import { CollapsibleToolBlock } from "./CollapsibleToolBlock";
import { OpenWorkspaceButton } from "./OpenWorkspaceButton";
import { ToolBlockHeaderRight } from "./ToolBlockHeaderRight";
import { ToolDataSection } from "./ToolDataSection";
import { ToolOutput } from "./ToolOutput";
import type { ToolGroup } from "../../utils/messageTransforms";

type ToolBlockGroupProps = {
  item: ToolGroup;
  pendingById: Map<string, ToolCall>;
  allowConfirmation: boolean;
  decisions: Record<string, boolean>;
  onDecisionChange: (callId: string, approved: boolean) => void;
  onOpenWorkspacePath?: (path: string) => void;
  isAskUserQuestionActive: boolean;
  onAskUserQuestionSubmit: (callId: string, response: AskUserQuestionSubmission) => Promise<void>;
  nextUserMessageContent?: string;
};

export function ToolBlockGroup({
  item,
  pendingById,
  allowConfirmation,
  decisions,
  onDecisionChange,
  onOpenWorkspacePath,
  isAskUserQuestionActive,
  onAskUserQuestionSubmit,
  nextUserMessageContent,
}: ToolBlockGroupProps) {
  const callMsg = item.callMessage;
  const resultMsg = item.resultMessage;
  const toolCallId = item.callId;
  const hasResult = Boolean(resultMsg);
  const isWaitingForToolResult = Boolean(callMsg) && !resultMsg;
  const isPending = isWaitingForToolResult && pendingById.has(toolCallId);

  const {
    name,
    callContent,
    resultContent,
    parsedArgs,
    askUserQuestionPayload,
    askUserQuestionSubmission,
    createPlanPayload,
    createPlanSavedPath,
    workspaceOpenPath,
    isDeclined,
  } = parseToolBlockData(item, nextUserMessageContent);

  if (name === ASK_USER_QUESTION_TOOL_NAME && askUserQuestionPayload) {
    return (
      <AskUserQuestionBlock
        toolCallId={toolCallId}
        payload={askUserQuestionPayload}
        submission={askUserQuestionSubmission}
        isWaitingForToolResult={isWaitingForToolResult}
        isActive={isAskUserQuestionActive}
        onSubmit={onAskUserQuestionSubmit}
      />
    );
  }

  if (name === CREATE_PLAN_TOOL_NAME && createPlanPayload) {
    return (
      <CreatePlanBlock
        toolCallId={toolCallId}
        plan={createPlanPayload}
        savedPath={createPlanSavedPath}
        workspaceOpenPath={workspaceOpenPath}
        onOpenWorkspacePath={onOpenWorkspacePath}
        isPending={isPending}
        hasResult={hasResult}
        isDeclined={isDeclined}
        allowConfirmation={allowConfirmation}
        decisions={decisions}
        onDecisionChange={onDecisionChange}
      />
    );
  }

  return (
    <CollapsibleToolBlock
      icon={(
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.5 1a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zm-2 11V4l5 4-5 4z" />
        </svg>
      )}
      title={name}
      titleAction={
        workspaceOpenPath && onOpenWorkspacePath ? (
          <OpenWorkspaceButton
            path={workspaceOpenPath}
            onOpenPath={onOpenWorkspacePath}
          />
        ) : undefined
      }
      headerRight={(
        <ToolBlockHeaderRight
          toolCallId={toolCallId}
          isPending={isPending}
          hasResult={hasResult}
          isDeclined={isDeclined}
          allowConfirmation={allowConfirmation}
          decisions={decisions}
          onDecisionChange={onDecisionChange}
        />
      )}
    >
      {callMsg ? (
        <ToolDataSection label="Arguments">
          <ToolArguments parsedArgs={parsedArgs} callContent={callContent} />
        </ToolDataSection>
      ) : null}

      {resultMsg ? (
        <ToolDataSection label="Output">
          <ToolOutput resultContent={resultContent} isError={isDeclined} />
        </ToolDataSection>
      ) : null}
    </CollapsibleToolBlock>
  );
}
