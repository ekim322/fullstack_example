import {
  getWorkspaceToolPolicy,
  type WorkspaceOpenFileRefreshAction,
} from "../../../../shared/workspaceTools";

export type { WorkspaceOpenFileRefreshAction } from "../../../../shared/workspaceTools";

export type WorkspaceToolRefreshPolicy = {
  refreshTreeOnSuccess: boolean;
  openFileAction: WorkspaceOpenFileRefreshAction;
  pathArgKey: string;
  outputPathKey: string;
};

export function getWorkspaceToolRefreshPolicy(toolName: string): WorkspaceToolRefreshPolicy | null {
  const policy = getWorkspaceToolPolicy(toolName);
  if (!policy) {
    return null;
  }

  return {
    refreshTreeOnSuccess: policy.refreshTreeOnSuccess,
    openFileAction: policy.openFileAction,
    pathArgKey: policy.refreshPathArgKey,
    outputPathKey: policy.refreshOutputPathKey,
  };
}
