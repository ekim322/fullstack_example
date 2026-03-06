import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";
import type { WorkspaceNodeType, WorkspaceTreeNode } from "../types/workspace";
import styles from "./WorkspaceTree.module.css";

type WorkspaceTreeProps = {
  root: WorkspaceTreeNode | null;
  expandedPaths: Record<string, boolean>;
  selectedPath: string | null;
  isLoading: boolean;
  onToggleFolder: (path: string) => void;
  onSelectNode: (path: string, nodeType: WorkspaceNodeType) => void;
};

export function WorkspaceTree({
  root,
  expandedPaths,
  selectedPath,
  isLoading,
  onToggleFolder,
  onSelectNode,
}: WorkspaceTreeProps) {
  if (isLoading && !root) {
    return <div className={styles.emptyState}>Loading workspace...</div>;
  }

  if (!root) {
    return <div className={styles.emptyState}>Workspace unavailable.</div>;
  }

  if (root.children.length === 0) {
    return <div className={styles.emptyState}>No files yet.</div>;
  }

  const renderNode = (node: WorkspaceTreeNode, depth: number) => {
    const isFolder = node.node_type === "folder";
    const isExpanded = isFolder && Boolean(expandedPaths[node.path]);
    const isSelected = node.path === selectedPath;

    return (
      <li key={node.path} className={styles.nodeItem}>
        <button
          type="button"
          className={`${styles.nodeRow}${isSelected ? ` ${styles.nodeRowSelected}` : ""}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (isFolder) {
              onToggleFolder(node.path);
            }
            onSelectNode(node.path, node.node_type);
          }}
        >
          <div className={styles.caretContainer}>
            {isFolder ? (
              isExpanded ? (
                <ChevronDown size={14} className={styles.caretIcon} />
              ) : (
                <ChevronRight size={14} className={styles.caretIcon} />
              )
            ) : null}
          </div>

          <div className={styles.nodeIconContainer}>
            {isFolder ? (
              <Folder size={14} className={styles.folderIcon} />
            ) : (
              <File size={14} className={styles.fileIcon} />
            )}
          </div>
          <span className={styles.nodeName}>{node.name}</span>
        </button>

        {isFolder && isExpanded && node.children.length > 0 ? (
          <ul className={styles.nodeList}>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className={styles.treeRoot}>
      <ul className={styles.nodeList}>{root.children.map((child) => renderNode(child, 0))}</ul>
    </div>
  );
}
