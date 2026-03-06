export const WORKSPACE_TOOL_NAMES = {
  readFile: "read_file",
  readFolder: "read_folder",
  listDirectory: "list_directory",
  writeFile: "write_file",
  editFile: "edit_file",
  executePythonFile: "execute_python_file",
  createFolder: "create_folder",
  deleteFile: "delete_file",
  deleteFolder: "delete_folder",
  createPlan: "create_plan",
} as const;

export const WORKSPACE_TOOL_NAME_SET = new Set<string>(Object.values(WORKSPACE_TOOL_NAMES));

export type WorkspaceOpenFileRefreshAction = "none" | "reload" | "close";

export type WorkspaceToolPolicy = {
  refreshTreeOnSuccess: boolean;
  openFileAction: WorkspaceOpenFileRefreshAction;
  refreshPathArgKey: string;
  refreshOutputPathKey: string;
  openPathArgKeys: string[];
  openPathResultKeys: string[];
  openPathDefaultParent?: string;
  openPathUseRawResultFallback?: boolean;
};

const DEFAULT_WORKSPACE_TOOL_POLICY: WorkspaceToolPolicy = {
  refreshTreeOnSuccess: false,
  openFileAction: "none",
  refreshPathArgKey: "path",
  refreshOutputPathKey: "path",
  openPathArgKeys: [],
  openPathResultKeys: [],
};

const WORKSPACE_TOOL_POLICY_OVERRIDES: Record<string, Partial<WorkspaceToolPolicy>> = {
  [WORKSPACE_TOOL_NAMES.readFile]: {
    openPathArgKeys: ["path"],
    openPathResultKeys: ["path"],
  },
  [WORKSPACE_TOOL_NAMES.readFolder]: {},
  [WORKSPACE_TOOL_NAMES.listDirectory]: {},
  [WORKSPACE_TOOL_NAMES.writeFile]: {
    refreshTreeOnSuccess: true,
    openFileAction: "reload",
    openPathArgKeys: ["path"],
    openPathResultKeys: ["path"],
  },
  [WORKSPACE_TOOL_NAMES.editFile]: {
    refreshTreeOnSuccess: true,
    openFileAction: "reload",
    openPathArgKeys: ["path"],
    openPathResultKeys: ["path"],
  },
  [WORKSPACE_TOOL_NAMES.executePythonFile]: {
    openPathArgKeys: ["path"],
    openPathResultKeys: ["path"],
  },
  [WORKSPACE_TOOL_NAMES.createFolder]: {
    refreshTreeOnSuccess: true,
  },
  [WORKSPACE_TOOL_NAMES.createPlan]: {
    refreshTreeOnSuccess: true,
    openFileAction: "reload",
    refreshPathArgKey: "file_path",
    openPathArgKeys: ["file_path", "path"],
    openPathResultKeys: ["path", "file_path"],
    openPathDefaultParent: "/PLANS",
    openPathUseRawResultFallback: true,
  },
  [WORKSPACE_TOOL_NAMES.deleteFile]: {
    refreshTreeOnSuccess: true,
    openFileAction: "close",
  },
  // Not currently exposed to the agent, but pre-configured for future use.
  [WORKSPACE_TOOL_NAMES.deleteFolder]: {
    refreshTreeOnSuccess: true,
  },
};

export function getWorkspaceToolPolicy(toolName: string): WorkspaceToolPolicy | null {
  const overrides = WORKSPACE_TOOL_POLICY_OVERRIDES[toolName];
  if (!overrides) {
    return null;
  }

  return {
    ...DEFAULT_WORKSPACE_TOOL_POLICY,
    ...overrides,
  };
}
