import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject } from "react";

import type { WorkspaceAction } from "../../state/workspaceReducer";
import type {
  WorkspaceRefreshReason,
  WorkspaceState,
  WorkspaceToolStreamEvent,
} from "../../types/workspace";
import {
  getWorkspaceToolRefreshPolicy,
  type WorkspaceOpenFileRefreshAction,
  type WorkspaceToolRefreshPolicy,
} from "./workspaceToolRefreshPolicy";

type UseWorkspaceToolRefreshArgs = {
  latestToolEvent: WorkspaceToolStreamEvent | null;
  dispatch: Dispatch<WorkspaceAction>;
  stateRef: MutableRefObject<WorkspaceState>;
  loadTree: (reason: WorkspaceRefreshReason) => Promise<void>;
  loadFile: (path: string) => Promise<void>;
};

type ToolCallContext = {
  path?: string;
};

function parseJsonRecord(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore parse failures.
  }

  return null;
}

function asPath(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") ? value : undefined;
}

function extractPath(record: Record<string, unknown> | null, key: string): string | undefined {
  if (!record) {
    return undefined;
  }
  return asPath(record[key]);
}

function mergeOpenFileAction(
  current: WorkspaceOpenFileRefreshAction,
  next: WorkspaceOpenFileRefreshAction,
): WorkspaceOpenFileRefreshAction {
  if (current === "close" || next === "close") {
    return "close";
  }

  if (current === "reload" || next === "reload") {
    return "reload";
  }

  return "none";
}

export function useWorkspaceToolRefresh({
  latestToolEvent,
  dispatch,
  stateRef,
  loadTree,
  loadFile,
}: UseWorkspaceToolRefreshArgs): void {
  const callContextByIdRef = useRef<Map<string, ToolCallContext>>(new Map());
  const refreshTimerRef = useRef<number | null>(null);
  const pendingPathActionsRef = useRef<Map<string, WorkspaceOpenFileRefreshAction>>(new Map());

  const scheduleRefresh = useCallback(
    (policy: WorkspaceToolRefreshPolicy, changedPath?: string) => {
      if (changedPath && policy.openFileAction !== "none") {
        const existingAction = pendingPathActionsRef.current.get(changedPath) ?? "none";
        pendingPathActionsRef.current.set(
          changedPath,
          mergeOpenFileAction(existingAction, policy.openFileAction),
        );
      }

      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        void (async () => {
          const pendingPathActions = new Map(pendingPathActionsRef.current);
          pendingPathActionsRef.current.clear();

          await loadTree("tool_result");

          const openPathSet = new Set(stateRef.current.openFiles.map((file) => file.path));

          for (const [path, action] of pendingPathActions) {
            if (!openPathSet.has(path)) {
              continue;
            }

            if (action === "close") {
              dispatch({ type: "closeFile", path });
              continue;
            }

            if (action !== "reload") {
              continue;
            }

            await loadFile(path);
          }
        })();
      }, 450);
    },
    [dispatch, loadFile, loadTree, stateRef],
  );

  useEffect(() => {
    if (!latestToolEvent) {
      return;
    }

    const event = latestToolEvent.event;
    const toolName = event.data.name ?? "";
    const policy = getWorkspaceToolRefreshPolicy(toolName);
    if (!policy) {
      return;
    }

    if (event.type === "tool_call") {
      const callId = event.data.call_id;
      if (!callId) {
        return;
      }

      const args = parseJsonRecord(event.data.arguments);
      callContextByIdRef.current.set(callId, {
        path: extractPath(args, policy.pathArgKey),
      });
      return;
    }

    const callId = event.data.call_id;
    if (!policy.refreshTreeOnSuccess || event.data.declined) {
      if (callId) {
        callContextByIdRef.current.delete(callId);
      }
      return;
    }

    const output = parseJsonRecord(event.data.output);
    if (output?.error) {
      if (callId) {
        callContextByIdRef.current.delete(callId);
      }
      return;
    }

    const context = callId ? callContextByIdRef.current.get(callId) : undefined;
    const changedPath = extractPath(output, policy.outputPathKey) ?? context?.path;

    if (callId) {
      callContextByIdRef.current.delete(callId);
    }

    scheduleRefresh(policy, changedPath);
  }, [latestToolEvent, scheduleRefresh]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      pendingPathActionsRef.current.clear();
    };
  }, []);
}
