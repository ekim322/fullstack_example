import type { WorkspaceNodeType, WorkspaceTreeNode } from "../../types/workspace";
import {
  normalizeAbsoluteWorkspacePath,
  toAbsoluteWorkspacePath as toSharedAbsoluteWorkspacePath,
} from "../../../../shared/workspacePaths";

export function findTreeNodeByPath(root: WorkspaceTreeNode | null, path: string): WorkspaceTreeNode | null {
  if (!root) {
    return null;
  }

  if (root.path === path) {
    return root;
  }

  for (const child of root.children) {
    const found = findTreeNodeByPath(child, path);
    if (found) {
      return found;
    }
  }

  return null;
}

export function getParentFolderPath(path: string): string {
  if (path === "/") {
    return "/";
  }

  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) {
    return "/";
  }
  return path.slice(0, lastSlash);
}

export function toAbsoluteWorkspacePath(input: string, baseFolderPath: string): string {
  return toSharedAbsoluteWorkspacePath(input, baseFolderPath);
}

export function normalizeAbsolutePath(path: string): string {
  return normalizeAbsoluteWorkspacePath(path);
}

export function getSelectedBaseFolderPath(
  selectedPath: string | null,
  selectedNodeType: WorkspaceNodeType | null,
): string {
  if (!selectedPath) {
    return "/";
  }
  return selectedNodeType === "folder" ? selectedPath : getParentFolderPath(selectedPath);
}
