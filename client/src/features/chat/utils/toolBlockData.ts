import { ASK_USER_QUESTION_TOOL_NAME, CREATE_PLAN_TOOL_NAME } from "../constants";
import { getWorkspaceToolPolicy } from "../../../shared/workspaceTools";
import type { AskUserQuestionPayload, AskUserQuestionSubmission } from "../types";
import { normalizeWorkspacePathForTool } from "../../../shared/workspacePaths";
import type { ToolGroup } from "./messageTransforms";
import {
  parseJsonObject,
} from "./toolParsing";
import {
  extractAskUserQuestionSubmission,
  toAskUserQuestionPayload,
} from "./askUserQuestionToolParsing";

function firstStringValue(
  record: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function getWorkspaceOpenPath(
  toolName: string,
  parsedArgs: Record<string, unknown> | null,
  parsedResult: Record<string, unknown> | null,
  resultContent: string,
): string | null {
  const policy = getWorkspaceToolPolicy(toolName);
  if (!policy) {
    return null;
  }

  const preferredPath =
    firstStringValue(parsedResult, policy.openPathResultKeys) ??
    firstStringValue(parsedArgs, policy.openPathArgKeys) ??
    (policy.openPathUseRawResultFallback ? resultContent.trim() : null);

  if (!preferredPath) {
    return null;
  }

  return normalizeWorkspacePathForTool(preferredPath, policy.openPathDefaultParent);
}

export type ParsedToolBlockData = {
  name: string;
  callContent: string;
  resultContent: string;
  parsedArgs: Record<string, unknown> | null;
  askUserQuestionPayload: AskUserQuestionPayload | null;
  askUserQuestionSubmission: AskUserQuestionSubmission | null;
  createPlanPayload: { step: number; description: string; sub_steps: string[] }[] | null;
  createPlanSavedPath: string | null;
  workspaceOpenPath: string | null;
  isDeclined: boolean;
};

export function parseToolBlockData(item: ToolGroup, nextUserMessageContent?: string): ParsedToolBlockData {
  const callMsg = item.callMessage;
  const resultMsg = item.resultMessage;

  const name = callMsg?.name || resultMsg?.name || "tool";
  const callContent = callMsg?.content || "";
  const resultContent = resultMsg?.content || "";

  const parsedArgs = parseJsonObject(callContent);
  const parsedResult = parseJsonObject(resultContent);

  let askUserQuestionPayload: AskUserQuestionPayload | null = null;
  let askUserQuestionSubmission: AskUserQuestionSubmission | null = null;
  let createPlanPayload: { step: number; description: string; sub_steps: string[] }[] | null = null;
  let createPlanSavedPath: string | null = null;
  const workspaceOpenPath = getWorkspaceOpenPath(name, parsedArgs, parsedResult, resultContent);

  if (name === ASK_USER_QUESTION_TOOL_NAME) {
    askUserQuestionPayload =
      toAskUserQuestionPayload(parsedArgs) ??
      toAskUserQuestionPayload(parsedResult);

    if (askUserQuestionPayload) {
      askUserQuestionSubmission = extractAskUserQuestionSubmission(
        nextUserMessageContent,
        askUserQuestionPayload,
      );
    }
  } else if (name === CREATE_PLAN_TOOL_NAME) {
    if (parsedResult && Array.isArray(parsedResult.plan)) {
      createPlanPayload = parsedResult.plan as { step: number; description: string; sub_steps: string[] }[];
    } else if (parsedArgs && Array.isArray(parsedArgs.steps)) {
      createPlanPayload = parsedArgs.steps.map((step: unknown, i: number) => {
        const stepNum = String(i + 1);
        const sub_steps = Array.isArray(parsedArgs.sub_steps)
          ? (parsedArgs.sub_steps as string[]).filter((s: string) => s.startsWith(`${stepNum}.`))
          : [];
        return { step: i + 1, description: String(step), sub_steps };
      });
    }

    if (workspaceOpenPath) {
      createPlanSavedPath = workspaceOpenPath;
    } else if (parsedResult && typeof parsedResult.path === "string") {
      createPlanSavedPath = parsedResult.path;
    } else if (parsedResult && typeof parsedResult.file_path === "string") {
      createPlanSavedPath = parsedResult.file_path;
    } else if (!parsedResult && resultContent.trim()) {
      createPlanSavedPath = resultContent.trim();
    }
  }

  const isDeclined =
    resultMsg?.declined === true ||
    (resultMsg?.name?.toLowerCase().includes("declined") ?? false);

  return {
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
  };
}
