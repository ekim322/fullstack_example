import { useCallback, type Dispatch, type MutableRefObject } from "react";

import {
  createFolder,
  deleteFile,
  deleteFolder,
  getFile,
  uploadFiles,
  writeFile,
} from "../../api/workspaceApi";
import type { WorkspaceAction } from "../../state/workspaceReducer";
import {
  WorkspaceApiError,
  type WorkspaceDialogs,
  type WorkspaceNodeType,
  type WorkspaceRefreshReason,
  type WorkspaceState,
  type WorkspaceToast,
} from "../../types/workspace";
import { toErrorMessage } from "../../utils/errorMessage";

type UseWorkspaceMutationsArgs = {
  authToken: string;
  dialogs: WorkspaceDialogs;
  dispatch: Dispatch<WorkspaceAction>;
  stateRef: MutableRefObject<WorkspaceState>;
  loadTree: (reason: WorkspaceRefreshReason) => Promise<void>;
  loadFile: (path: string) => Promise<void>;
};

type UploadRequest = {
  files: File[];
  paths?: string[];
  basePath?: string;
};

type UseWorkspaceMutationsResult = {
  saveOpenFile: (path?: string) => Promise<boolean>;
  overwriteOpenFile: (path?: string) => Promise<boolean>;
  createFileAtPath: (path: string) => Promise<boolean>;
  createFolderAtPath: (path: string) => Promise<boolean>;
  deleteNodeAtPath: (path: string, nodeType: WorkspaceNodeType) => Promise<boolean>;
  uploadWorkspaceFiles: (request: UploadRequest) => Promise<boolean>;
};

function makeToast(kind: WorkspaceToast["kind"], message: string): WorkspaceToast {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    message,
  };
}

function isVersionConflictError(error: unknown): boolean {
  if (error instanceof WorkspaceApiError) {
    if (error.status === 409) {
      return true;
    }
    if (error.status === 422 && /version conflict/i.test(error.message)) {
      return true;
    }
  }

  return error instanceof Error && /version conflict/i.test(error.message);
}

function isFolderNotEmptyError(error: unknown): boolean {
  return error instanceof Error && /folder is not empty/i.test(error.message);
}

export function useWorkspaceMutations({
  authToken,
  dialogs,
  dispatch,
  stateRef,
  loadTree,
  loadFile,
}: UseWorkspaceMutationsArgs): UseWorkspaceMutationsResult {
  const saveOpenFile = useCallback(async (path?: string) => {
    const snapshot = stateRef.current;
    const targetPath = path || snapshot.activeFilePath;
    const openFile = snapshot.openFiles.find((f) => f.path === targetPath);
    if (!openFile) {
      return false;
    }

    dispatch({ type: "saveStarted" });

    try {
      const result = await writeFile(
        {
          path: openFile.path,
          content: openFile.draft,
          expected_version: openFile.version,
          overwrite: true,
        },
        authToken,
      );
      dispatch({ type: "saveSucceeded", result, content: openFile.draft, path: openFile.path });
      dispatch({ type: "toastEnqueued", toast: makeToast("success", `Saved ${openFile.path}`) });

      await loadTree("save");
      return true;
    } catch (error) {
      const detail = toErrorMessage(error, `Unable to save ${openFile.path}`);
      dispatch({
        type: "saveFailed",
        error: detail,
        conflict: isVersionConflictError(error),
        path: openFile.path
      });
      dispatch({ type: "toastEnqueued", toast: makeToast("error", detail) });
      return false;
    }
  }, [authToken, dispatch, loadTree, stateRef]);

  const overwriteOpenFile = useCallback(async (path?: string) => {
    const snapshot = stateRef.current;
    const targetPath = path || snapshot.activeFilePath;
    const openFile = snapshot.openFiles.find((f) => f.path === targetPath);
    if (!openFile) {
      return false;
    }

    dispatch({ type: "saveStarted" });

    try {
      const latest = await getFile(openFile.path, authToken);
      const result = await writeFile(
        {
          path: openFile.path,
          content: openFile.draft,
          expected_version: latest.version,
          overwrite: true,
        },
        authToken,
      );

      dispatch({ type: "saveSucceeded", result, content: openFile.draft, path: openFile.path });
      dispatch({ type: "toastEnqueued", toast: makeToast("success", `Overwrote ${openFile.path}`) });

      await loadTree("save");
      return true;
    } catch (error) {
      const detail = toErrorMessage(error, `Unable to overwrite ${openFile.path}`);
      dispatch({
        type: "saveFailed",
        error: detail,
        conflict: isVersionConflictError(error),
        path: openFile.path
      });
      dispatch({ type: "toastEnqueued", toast: makeToast("error", detail) });
      return false;
    }
  }, [authToken, dispatch, loadTree, stateRef]);

  const createFileAtPath = useCallback(
    async (path: string) => {
      try {
        await writeFile(
          {
            path,
            content: "",
            overwrite: false,
          },
          authToken,
        );

        dispatch({ type: "mutationApplied", reason: "create" });
        dispatch({ type: "toastEnqueued", toast: makeToast("success", `Created ${path}`) });

        await loadTree("create");
        await loadFile(path);
        return true;
      } catch (error) {
        const detail = toErrorMessage(error, `Unable to create file: ${path}`);
        dispatch({ type: "setError", error: detail });
        dispatch({ type: "toastEnqueued", toast: makeToast("error", detail) });
        return false;
      }
    },
    [authToken, dispatch, loadFile, loadTree],
  );

  const createFolderAtPath = useCallback(
    async (path: string) => {
      try {
        await createFolder(
          {
            path,
            recursive: true,
          },
          authToken,
        );

        dispatch({ type: "mutationApplied", reason: "create" });
        dispatch({ type: "toastEnqueued", toast: makeToast("success", `Created ${path}`) });

        await loadTree("create");
        dispatch({ type: "selectPath", path });
        dispatch({ type: "setExpanded", path, expanded: true });
        return true;
      } catch (error) {
        const detail = toErrorMessage(error, `Unable to create folder: ${path}`);
        dispatch({ type: "setError", error: detail });
        dispatch({ type: "toastEnqueued", toast: makeToast("error", detail) });
        return false;
      }
    },
    [authToken, dispatch, loadTree],
  );

  const deleteNodeAtPath = useCallback(
    async (path: string, nodeType: WorkspaceNodeType) => {
      try {
        if (nodeType === "file") {
          await deleteFile(path, authToken);
        } else {
          try {
            await deleteFolder(path, false, authToken);
          } catch (error) {
            if (!isFolderNotEmptyError(error)) {
              throw error;
            }

            const shouldDeleteRecursively = dialogs.confirmRecursiveDelete(path);
            if (!shouldDeleteRecursively) {
              return false;
            }
            await deleteFolder(path, true, authToken);
          }
        }

        dispatch({ type: "mutationApplied", reason: "delete" });
        dispatch({ type: "toastEnqueued", toast: makeToast("success", `Deleted ${path}`) });

        await loadTree("delete");
        const isOpen = stateRef.current.openFiles.some((f) => f.path === path);
        if (isOpen) {
          dispatch({ type: "closeFile", path });
        }

        const selectedPath = stateRef.current.selectedPath;
        if (selectedPath === path) {
          dispatch({ type: "selectPath", path: null });
        }

        return true;
      } catch (error) {
        const detail = toErrorMessage(error, `Unable to delete ${path}`);
        dispatch({ type: "setError", error: detail });
        dispatch({ type: "toastEnqueued", toast: makeToast("error", detail) });
        return false;
      }
    },
    [authToken, dialogs, dispatch, loadTree, stateRef],
  );

  const uploadWorkspaceFiles = useCallback(
    async ({ files, paths, basePath }: UploadRequest) => {
      if (files.length === 0) {
        return false;
      }

      dispatch({ type: "setUploading", uploading: true });

      try {
        const response = await uploadFiles(
          {
            files,
            paths,
            base_path: basePath,
          },
          authToken,
        );

        dispatch({ type: "mutationApplied", reason: "upload" });
        dispatch({
          type: "toastEnqueued",
          toast: makeToast("success", `Uploaded ${response.files.length} file${response.files.length === 1 ? "" : "s"}`),
        });

        await loadTree("upload");
        return true;
      } catch (error) {
        const detail = toErrorMessage(error, "Upload failed. Some files might have uploaded before the error.");
        dispatch({ type: "setError", error: detail });
        dispatch({ type: "toastEnqueued", toast: makeToast("error", detail) });

        // Upload writes sequentially on the backend, so refresh even on failure.
        await loadTree("upload");
        return false;
      } finally {
        dispatch({ type: "setUploading", uploading: false });
      }
    },
    [authToken, dispatch, loadTree],
  );

  return {
    saveOpenFile,
    overwriteOpenFile,
    createFileAtPath,
    createFolderAtPath,
    deleteNodeAtPath,
    uploadWorkspaceFiles,
  };
}
