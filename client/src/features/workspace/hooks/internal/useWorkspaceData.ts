import { useCallback, useRef, type Dispatch, type MutableRefObject } from "react";

import { getFile, getTree } from "../../api/workspaceApi";
import type { WorkspaceAction } from "../../state/workspaceReducer";
import { WorkspaceApiError, type WorkspaceRefreshReason, type WorkspaceState } from "../../types/workspace";
import { toErrorMessage } from "../../utils/errorMessage";

type UseWorkspaceDataArgs = {
  authToken: string;
  dispatch: Dispatch<WorkspaceAction>;
  stateRef: MutableRefObject<WorkspaceState>;
};

type UseWorkspaceDataResult = {
  loadTree: (reason: WorkspaceRefreshReason) => Promise<void>;
  loadFile: (path: string) => Promise<void>;
  reloadOpenFile: () => Promise<void>;
};

export function useWorkspaceData({ authToken, dispatch, stateRef }: UseWorkspaceDataArgs): UseWorkspaceDataResult {
  const latestFileLoadRequestIdRef = useRef(0);

  const loadTree = useCallback(
    async (reason: WorkspaceRefreshReason) => {
      dispatch({ type: "treeLoadStarted", reason });

      try {
        const snapshot = await getTree(authToken);
        dispatch({ type: "treeLoadSucceeded", root: snapshot.root });
      } catch (error) {
        dispatch({
          type: "treeLoadFailed",
          error: toErrorMessage(error, "Unable to load workspace tree."),
        });
      }
    },
    [authToken, dispatch],
  );

  const loadFile = useCallback(
    async (path: string) => {
      const requestId = latestFileLoadRequestIdRef.current + 1;
      latestFileLoadRequestIdRef.current = requestId;
      dispatch({ type: "fileLoadStarted", path });

      try {
        const file = await getFile(path, authToken);
        if (requestId !== latestFileLoadRequestIdRef.current) {
          return;
        }
        dispatch({ type: "fileLoadSucceeded", file });
      } catch (error) {
        if (requestId !== latestFileLoadRequestIdRef.current) {
          return;
        }
        dispatch({
          type: "fileLoadFailed",
          path,
          error: toErrorMessage(error, `Unable to load file: ${path}`),
          notFound: error instanceof WorkspaceApiError && error.status === 404,
        });
      }
    },
    [authToken, dispatch],
  );

  const reloadOpenFile = useCallback(async (path?: string) => {
    const openPath = path || stateRef.current.activeFilePath;
    if (!openPath) {
      return;
    }

    await loadFile(openPath);
  }, [loadFile, stateRef]);

  return {
    loadTree,
    loadFile,
    reloadOpenFile,
  };
}
