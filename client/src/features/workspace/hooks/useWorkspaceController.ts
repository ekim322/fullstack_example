import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { useWorkspaceData } from "./internal/useWorkspaceData";
import { findTreeNodeByPath, getSelectedBaseFolderPath, toAbsoluteWorkspacePath } from "./internal/treeUtils";
import { useWorkspaceMutations } from "./internal/useWorkspaceMutations";
import { useWorkspaceToolRefresh } from "./internal/useWorkspaceToolRefresh";
import { useWorkspaceSaveShortcut } from "./internal/useWorkspaceUiEffects";
import { initialWorkspaceState, workspaceReducer } from "../state/workspaceReducer";
import type {
  WorkspaceDialogs,
  WorkspaceNodeType,
  WorkspaceState,
  WorkspaceToolStreamEvent,
} from "../types/workspace";

const MAX_UPLOAD_BYTES = 1_048_576;

type UseWorkspaceControllerArgs = {
  authToken: string;
  latestToolEvent: WorkspaceToolStreamEvent | null;
  dialogs: WorkspaceDialogs;
};

type UseWorkspaceControllerResult = {
  state: WorkspaceState;
  selectedNodeType: WorkspaceNodeType | null;
  refreshTree: () => Promise<void>;
  toggleExpanded: (path: string) => void;
  selectNode: (path: string, nodeType: WorkspaceNodeType) => Promise<void>;
  setDraft: (path: string, value: string) => void;
  saveFile: (path?: string) => Promise<boolean>;
  reloadOpenFile: (path?: string) => Promise<void>;
  overwriteAfterConflict: (path?: string) => Promise<boolean>;
  closeFile: (path: string) => void;
  switchTab: (path: string) => void;
  createFile: () => Promise<void>;
  createFolder: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  uploadFromPicker: (fileList: FileList | null, mode: "files" | "folder") => Promise<void>;
  dismissToast: (id: string) => void;
};

type FileWithRelativePath = File & {
  webkitRelativePath?: string;
};

function buildTooLargeMessage(files: File[]): string {
  const names = files.slice(0, 3).map((file) => file.name);
  const suffix = files.length > 3 ? ` and ${files.length - 3} more` : "";
  return `Upload limit is 1 MiB per file. Too large: ${names.join(", ")}${suffix}.`;
}

export function useWorkspaceController({
  authToken,
  latestToolEvent,
  dialogs,
}: UseWorkspaceControllerArgs): UseWorkspaceControllerResult {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, initialWorkspaceState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const { loadTree, loadFile, reloadOpenFile } = useWorkspaceData({
    authToken,
    dispatch,
    stateRef,
  });

  const {
    saveOpenFile,
    overwriteOpenFile,
    createFileAtPath,
    createFolderAtPath,
    deleteNodeAtPath,
    uploadWorkspaceFiles,
  } = useWorkspaceMutations({
    authToken,
    dialogs,
    dispatch,
    stateRef,
    loadTree,
    loadFile,
  });

  useWorkspaceToolRefresh({
    latestToolEvent,
    dispatch,
    stateRef,
    loadTree,
    loadFile,
  });

  useEffect(() => {
    void loadTree("initial");
  }, [loadTree]);

  useWorkspaceSaveShortcut({ stateRef, saveOpenFile });

  const selectedNodeType = useMemo(() => {
    if (!state.selectedPath) {
      return null;
    }
    return findTreeNodeByPath(state.tree, state.selectedPath)?.node_type ?? null;
  }, [state.selectedPath, state.tree]);

  const selectNode = useCallback(
    async (path: string, nodeType: WorkspaceNodeType) => {
      dispatch({ type: "selectPath", path });

      if (nodeType === "folder") {
        return;
      }

      const isOpen = stateRef.current.openFiles.some((f) => f.path === path);
      if (isOpen) {
        dispatch({ type: "switchTab", path });
        return;
      }

      await loadFile(path);
    },
    [loadFile, stateRef],
  );

  const refreshTree = useCallback(async () => {
    await loadTree("manual");
  }, [loadTree]);

  const closeFile = useCallback(
    (path: string) => {
      const file = stateRef.current.openFiles.find((f) => f.path === path);
      if (file && file.isDirty) {
        if (!dialogs.confirmDiscardDirtyFile(file.path)) {
          return;
        }
      }
      dispatch({ type: "closeFile", path });
    },
    [dialogs, stateRef],
  );

  const createFile = useCallback(async () => {
    const defaultPath = "new-file.txt";

    const input = dialogs.promptForNewFilePath(defaultPath);
    if (input === null) {
      return;
    }

    try {
      const absolutePath = toAbsoluteWorkspacePath(input, "/");
      if (absolutePath === "/") {
        throw new Error("File path cannot be '/'");
      }
      await createFileAtPath(absolutePath);
    } catch (error) {
      dispatch({
        type: "setError",
        error: error instanceof Error ? error.message : "Invalid file path",
      });
    }
  }, [createFileAtPath, dialogs]);

  const createFolder = useCallback(async () => {
    const defaultPath = "new-folder";

    const input = dialogs.promptForNewFolderPath(defaultPath);
    if (input === null) {
      return;
    }

    try {
      const absolutePath = toAbsoluteWorkspacePath(input, "/");
      if (absolutePath === "/") {
        return;
      }
      await createFolderAtPath(absolutePath);
    } catch (error) {
      dispatch({
        type: "setError",
        error: error instanceof Error ? error.message : "Invalid folder path",
      });
    }
  }, [createFolderAtPath, dialogs]);

  const deleteSelected = useCallback(async () => {
    const snapshot = stateRef.current;
    if (!snapshot.selectedPath) {
      return;
    }

    if (snapshot.selectedPath === "/") {
      dispatch({ type: "setError", error: "Deleting the workspace root is not supported from the UI." });
      return;
    }

    const nodeType = findTreeNodeByPath(snapshot.tree, snapshot.selectedPath)?.node_type;
    if (!nodeType) {
      return;
    }

    const confirmed = dialogs.confirmDeleteNode(snapshot.selectedPath, nodeType);
    if (!confirmed) {
      return;
    }

    await deleteNodeAtPath(snapshot.selectedPath, nodeType);
  }, [deleteNodeAtPath, dialogs]);

  const uploadFromPicker = useCallback(
    async (fileList: FileList | null, mode: "files" | "folder") => {
      if (!fileList || fileList.length === 0) {
        return;
      }

      const snapshot = stateRef.current;
      const baseFolderPath = getSelectedBaseFolderPath(snapshot.selectedPath, selectedNodeType);

      const allFiles = Array.from(fileList);
      const tooLargeFiles = allFiles.filter((file) => file.size > MAX_UPLOAD_BYTES);
      if (tooLargeFiles.length > 0) {
        dispatch({ type: "setError", error: buildTooLargeMessage(tooLargeFiles) });
        return;
      }

      const relativePaths =
        mode === "folder"
          ? allFiles.map((file) => {
              const relativePath = (file as FileWithRelativePath).webkitRelativePath;
              return relativePath && relativePath.trim().length > 0 ? relativePath : file.name;
            })
          : undefined;

      await uploadWorkspaceFiles({
        files: allFiles,
        paths: relativePaths,
        basePath: baseFolderPath,
      });
    },
    [selectedNodeType, uploadWorkspaceFiles],
  );

  return {
    state,
    selectedNodeType,
    refreshTree,
    toggleExpanded: (path: string) => dispatch({ type: "toggleExpanded", path }),
    selectNode,
    setDraft: (path: string, value: string) => dispatch({ type: "setDraft", path, value }),
    saveFile: saveOpenFile,
    reloadOpenFile,
    overwriteAfterConflict: overwriteOpenFile,
    closeFile,
    switchTab: (path: string) => dispatch({ type: "switchTab", path }),
    createFile,
    createFolder,
    deleteSelected,
    uploadFromPicker,
    dismissToast: (id: string) => dispatch({ type: "toastDismissed", id }),
  };
}
