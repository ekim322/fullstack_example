import { useCallback, useRef, useState } from "react";

import type { ToolCallStreamEvent, ToolResultStreamEvent } from "../../features/chat/types";
import type {
  WorkspaceOpenFileRequest,
  WorkspaceToolStreamEvent,
} from "../../features/workspace/types/workspace";
import { WORKSPACE_TOOL_NAME_SET } from "../../shared/workspaceTools";

type UseWorkspaceEventBridgeResult = {
  latestWorkspaceToolEvent: WorkspaceToolStreamEvent | null;
  workspaceOpenFileRequest: WorkspaceOpenFileRequest | null;
  handleToolEvent: (event: ToolCallStreamEvent | ToolResultStreamEvent) => void;
  handleOpenWorkspacePath: (path: string) => void;
};

export function useWorkspaceEventBridge(): UseWorkspaceEventBridgeResult {
  const [latestWorkspaceToolEvent, setLatestWorkspaceToolEvent] = useState<WorkspaceToolStreamEvent | null>(null);
  const [workspaceOpenFileRequest, setWorkspaceOpenFileRequest] = useState<WorkspaceOpenFileRequest | null>(null);
  const workspaceEventIdRef = useRef(0);
  const workspaceOpenRequestIdRef = useRef(0);

  const handleToolEvent = useCallback((event: ToolCallStreamEvent | ToolResultStreamEvent) => {
    const toolName = event.data.name ?? "";
    if (!WORKSPACE_TOOL_NAME_SET.has(toolName)) {
      return;
    }

    workspaceEventIdRef.current += 1;
    setLatestWorkspaceToolEvent({
      id: workspaceEventIdRef.current,
      event,
    });
  }, []);

  const handleOpenWorkspacePath = useCallback((path: string) => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      return;
    }

    workspaceOpenRequestIdRef.current += 1;
    setWorkspaceOpenFileRequest({
      id: workspaceOpenRequestIdRef.current,
      path: trimmedPath,
    });
  }, []);

  return {
    latestWorkspaceToolEvent,
    workspaceOpenFileRequest,
    handleToolEvent,
    handleOpenWorkspacePath,
  };
}
