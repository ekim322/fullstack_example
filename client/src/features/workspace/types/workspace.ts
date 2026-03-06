export type WorkspaceNodeType = "file" | "folder";

export interface WorkspaceNode {
  path: string;
  parent_path: string;
  name: string;
  node_type: WorkspaceNodeType;
  size_bytes: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceFile extends WorkspaceNode {
  content: string;
}

export interface WorkspaceDirectoryListing {
  path: string;
  children: WorkspaceNode[];
}

export interface WorkspaceTreeNode {
  path: string;
  name: string;
  node_type: WorkspaceNodeType;
  size_bytes: number;
  version: number;
  children: WorkspaceTreeNode[];
}

export interface WorkspaceTreeSnapshot {
  root: WorkspaceTreeNode;
}

export interface WorkspaceWriteResult {
  path: string;
  parent_path: string;
  name: string;
  node_type: "file";
  size_bytes: number;
  version: number;
  created: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceFolderCreateResult {
  path: string;
  parent_path: string;
  name: string;
  node_type: "folder";
  size_bytes: number;
  version: number;
  created: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceDeleteResult {
  path: string;
  deleted: boolean;
  deleted_count: number;
}

export interface WorkspaceUploadResult {
  base_path: string;
  files: WorkspaceWriteResult[];
}

export interface WorkspaceApiErrorPayload {
  status: number;
  message: string;
  path?: string;
}

export class WorkspaceApiError extends Error {
  readonly status: number;
  readonly path?: string;

  constructor(payload: WorkspaceApiErrorPayload) {
    super(payload.message);
    this.name = "WorkspaceApiError";
    this.status = payload.status;
    this.path = payload.path;
  }
}

export type WorkspaceRefreshReason =
  | "initial"
  | "manual"
  | "upload"
  | "tool_result"
  | "save"
  | "delete"
  | "create";

export type WorkspaceToastKind = "info" | "success" | "error";

export interface WorkspaceToast {
  id: string;
  kind: WorkspaceToastKind;
  message: string;
}

export interface WorkspaceOpenFile {
  path: string;
  content: string;
  version: number;
  sizeBytes: number;
  updatedAt: string;
  draft: string;
  isDirty: boolean;
  conflictMessage: string | null;
}

export interface WorkspaceState {
  tree: WorkspaceTreeNode | null;
  expandedPaths: Record<string, boolean>;
  selectedPath: string | null;
  openFiles: WorkspaceOpenFile[];
  activeFilePath: string | null;
  isSaving: boolean;
  isLoadingTree: boolean;
  isLoadingFile: boolean;
  isUploading: boolean;
  lastMutationAt: number | null;
  pendingRefreshReason: WorkspaceRefreshReason | null;
  error: string | null;
  toasts: WorkspaceToast[];
}

export interface WorkspaceToolStreamEvent {
  id: number;
  event: WorkspaceToolCallEvent | WorkspaceToolResultEvent;
}

export interface WorkspaceOpenFileRequest {
  id: number;
  path: string;
}

export interface WorkspaceDialogs {
  confirmDiscardDirtyFile: (path: string) => boolean;
  promptForNewFilePath: (defaultPath: string) => string | null;
  promptForNewFolderPath: (defaultPath: string) => string | null;
  confirmDeleteNode: (path: string, nodeType: WorkspaceNodeType) => boolean;
  confirmRecursiveDelete: (path: string) => boolean;
}

export interface WorkspaceToolCallEvent {
  type: "tool_call";
  data: {
    name?: string;
    call_id?: string;
    arguments?: string;
  };
  ts: number;
}

export interface WorkspaceToolResultEvent {
  type: "tool_result";
  data: {
    name?: string;
    call_id?: string;
    output?: string;
    declined?: boolean;
  };
  ts: number;
}
