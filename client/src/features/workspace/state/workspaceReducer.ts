import type {
  WorkspaceFile,
  WorkspaceOpenFile,
  WorkspaceRefreshReason,
  WorkspaceState,
  WorkspaceToast,
  WorkspaceTreeNode,
  WorkspaceWriteResult,
} from "../types/workspace";

function collectTreePaths(node: WorkspaceTreeNode, sink: Set<string>): void {
  sink.add(node.path);
  node.children.forEach((child) => collectTreePaths(child, sink));
}

function pruneExpandedPaths(
  expandedPaths: Record<string, boolean>,
  validPaths: Set<string>,
  rootPath: string,
): Record<string, boolean> {
  const nextExpanded: Record<string, boolean> = { [rootPath]: true };

  Object.entries(expandedPaths).forEach(([path, expanded]) => {
    if (!expanded || !validPaths.has(path)) {
      return;
    }
    nextExpanded[path] = true;
  });

  return nextExpanded;
}

function expandParents(
  expandedPaths: Record<string, boolean>,
  path: string | null,
): Record<string, boolean> {
  if (!path) return expandedPaths;

  let changed = false;
  const nextExpanded = { ...expandedPaths };

  let current = path;
  while (current !== "/") {
    const lastSlash = current.lastIndexOf("/");
    if (lastSlash <= 0) {
      if (!nextExpanded["/"]) {
        nextExpanded["/"] = true;
        changed = true;
      }
      break;
    }
    current = current.slice(0, lastSlash);
    if (!nextExpanded[current]) {
      nextExpanded[current] = true;
      changed = true;
    }
  }

  return changed ? nextExpanded : expandedPaths;
}

function toOpenFile(file: WorkspaceFile): WorkspaceOpenFile {
  return {
    path: file.path,
    content: file.content,
    version: file.version,
    sizeBytes: file.size_bytes,
    updatedAt: file.updated_at,
    draft: file.content,
    isDirty: false,
    conflictMessage: null,
  };
}

export function initialWorkspaceState(): WorkspaceState {
  return {
    tree: null,
    expandedPaths: { "/": true },
    selectedPath: null,
    openFiles: [],
    activeFilePath: null,
    isSaving: false,
    isLoadingTree: false,
    isLoadingFile: false,
    isUploading: false,
    lastMutationAt: null,
    pendingRefreshReason: null,
    error: null,
    toasts: [],
  };
}

type WorkspaceAction =
  | { type: "treeLoadStarted"; reason: WorkspaceRefreshReason }
  | { type: "treeLoadSucceeded"; root: WorkspaceTreeNode }
  | { type: "treeLoadFailed"; error: string }
  | { type: "toggleExpanded"; path: string }
  | { type: "setExpanded"; path: string; expanded: boolean }
  | { type: "selectPath"; path: string | null }
  | { type: "fileLoadStarted"; path: string }
  | { type: "fileLoadSucceeded"; file: WorkspaceFile }
  | { type: "fileLoadFailed"; path: string; error: string; notFound: boolean }
  | { type: "setDraft"; path: string; value: string }
  | { type: "closeFile"; path: string }
  | { type: "switchTab"; path: string }
  | { type: "saveStarted" }
  | { type: "saveSucceeded"; result: WorkspaceWriteResult; content: string; path: string }
  | { type: "saveFailed"; error: string; conflict: boolean; path: string }
  | { type: "setUploading"; uploading: boolean }
  | { type: "mutationApplied"; reason: WorkspaceRefreshReason }
  | { type: "toastEnqueued"; toast: WorkspaceToast }
  | { type: "toastDismissed"; id: string }
  | { type: "setError"; error: string | null };

export type { WorkspaceAction };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "treeLoadStarted":
      return {
        ...state,
        isLoadingTree: true,
        pendingRefreshReason: action.reason,
        error: null,
      };

    case "treeLoadSucceeded": {
      const validPaths = new Set<string>();
      collectTreePaths(action.root, validPaths);
      const selectedPathStillExists = state.selectedPath ? validPaths.has(state.selectedPath) : false;
      const newOpenFiles = state.openFiles.filter((f) => validPaths.has(f.path));
      const activeFileStillExists = state.activeFilePath ? validPaths.has(state.activeFilePath) : false;

      let nextActiveFile = state.activeFilePath;
      if (!activeFileStillExists) {
        nextActiveFile = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].path : null;
      }

      const nextSelectedPath = selectedPathStillExists ? state.selectedPath : nextActiveFile;
      const prunedExpandedPaths = pruneExpandedPaths(state.expandedPaths, validPaths, action.root.path);

      return {
        ...state,
        tree: action.root,
        isLoadingTree: false,
        pendingRefreshReason: null,
        expandedPaths: nextSelectedPath ? expandParents(prunedExpandedPaths, nextSelectedPath) : prunedExpandedPaths,
        selectedPath: nextSelectedPath,
        openFiles: newOpenFiles,
        activeFilePath: nextActiveFile,
      };
    }

    case "treeLoadFailed":
      return {
        ...state,
        isLoadingTree: false,
        pendingRefreshReason: null,
        error: action.error,
        toasts: [
          ...state.toasts,
          { id: Math.random().toString(), kind: "error", message: action.error }
        ]
      };

    case "toggleExpanded": {
      const currentlyExpanded = Boolean(state.expandedPaths[action.path]);
      return {
        ...state,
        expandedPaths: {
          ...state.expandedPaths,
          [action.path]: !currentlyExpanded,
        },
      };
    }

    case "setExpanded":
      return {
        ...state,
        expandedPaths: {
          ...state.expandedPaths,
          [action.path]: action.expanded,
        },
      };

    case "selectPath":
      return {
        ...state,
        selectedPath: action.path,
        expandedPaths: expandParents(state.expandedPaths, action.path),
      };

    case "fileLoadStarted":
      return {
        ...state,
        isLoadingFile: true,
        selectedPath: action.path,
        error: null,
      };

    case "fileLoadSucceeded": {
      const existingIndex = state.openFiles.findIndex((f) => f.path === action.file.path);
      const newOpenFile = toOpenFile(action.file);
      
      let nextOpenFiles;
      if (existingIndex >= 0) {
        // Update existing but preserve dirty state/draft if it was dirty? 
        // Typically a fresh load overrides draft unless we want to keep it.
        // Let's just override it since this is a server reload or first load.
        nextOpenFiles = [...state.openFiles];
        nextOpenFiles[existingIndex] = newOpenFile;
      } else {
        nextOpenFiles = [...state.openFiles, newOpenFile];
      }

      return {
        ...state,
        isLoadingFile: false,
        openFiles: nextOpenFiles,
        activeFilePath: action.file.path,
        selectedPath: action.file.path,
        expandedPaths: expandParents(state.expandedPaths, action.file.path),
        error: null,
      };
    }

    case "fileLoadFailed":
      {
        const shouldClearPath = action.notFound && state.selectedPath === action.path;
        const nextOpenFiles = action.notFound
          ? state.openFiles.filter((file) => file.path !== action.path)
          : state.openFiles;
        const nextActiveFile =
          action.notFound && state.activeFilePath === action.path
            ? nextOpenFiles.length > 0
              ? nextOpenFiles[nextOpenFiles.length - 1].path
              : null
            : state.activeFilePath;

        const nextSelectedPath = shouldClearPath ? nextActiveFile : state.selectedPath;

        return {
          ...state,
          isLoadingFile: false,
          selectedPath: nextSelectedPath,
          expandedPaths: nextSelectedPath ? expandParents(state.expandedPaths, nextSelectedPath) : state.expandedPaths,
          activeFilePath: nextActiveFile,
          openFiles: nextOpenFiles,
          error: action.error,
          toasts: [
            ...state.toasts,
            { id: Math.random().toString(), kind: "error", message: action.error }
          ]
        };
      }

    case "setDraft":
      return {
        ...state,
        openFiles: state.openFiles.map((f) =>
          f.path === action.path
            ? { ...f, draft: action.value, isDirty: action.value !== f.content }
            : f
        ),
      };

    case "closeFile": {
      const newOpenFiles = state.openFiles.filter((f) => f.path !== action.path);
      let nextActiveFile = state.activeFilePath;
      if (state.activeFilePath === action.path) {
        nextActiveFile = newOpenFiles.length > 0 ? newOpenFiles[newOpenFiles.length - 1].path : null;
      }
      
      let nextSelectedPath = state.selectedPath;
      if (state.selectedPath === action.path) {
        nextSelectedPath = nextActiveFile;
      }

      return {
        ...state,
        openFiles: newOpenFiles,
        activeFilePath: nextActiveFile,
        selectedPath: nextSelectedPath,
        expandedPaths: nextSelectedPath ? expandParents(state.expandedPaths, nextSelectedPath) : state.expandedPaths,
        isLoadingFile: false,
      };
    }

    case "switchTab":
      return {
        ...state,
        activeFilePath: action.path,
        selectedPath: action.path,
        expandedPaths: expandParents(state.expandedPaths, action.path),
      };

    case "saveStarted":
      return {
        ...state,
        isSaving: true,
        error: null,
      };

    case "saveSucceeded":
      return {
        ...state,
        isSaving: false,
        openFiles: state.openFiles.map((f) =>
          f.path === action.path
            ? {
                ...f,
                content: action.content,
                draft: action.content,
                isDirty: false,
                version: action.result.version,
                sizeBytes: action.result.size_bytes,
                updatedAt: action.result.updated_at,
                conflictMessage: null,
              }
            : f
        ),
        lastMutationAt: Date.now(),
        pendingRefreshReason: "save",
      };

    case "saveFailed":
      return {
        ...state,
        isSaving: false,
        openFiles: state.openFiles.map((f) =>
          f.path === action.path
            ? {
                ...f,
                conflictMessage: action.conflict ? action.error : f.conflictMessage,
              }
            : f
        ),
        error: action.conflict ? null : action.error,
        toasts: !action.conflict && action.error ? [
          ...state.toasts,
          { id: Math.random().toString(), kind: "error", message: action.error }
        ] : state.toasts,
      };

    case "setUploading":
      return {
        ...state,
        isUploading: action.uploading,
      };

    case "mutationApplied":
      return {
        ...state,
        lastMutationAt: Date.now(),
        pendingRefreshReason: action.reason,
      };

    case "toastEnqueued":
      return {
        ...state,
        toasts: [...state.toasts, action.toast],
      };

    case "toastDismissed":
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.id),
      };

    case "setError":
      return {
        ...state,
        error: action.error,
        toasts: action.error ? [
          ...state.toasts,
          { id: Math.random().toString(), kind: "error", message: action.error }
        ] : state.toasts,
      };

    default:
      return state;
  }
}
