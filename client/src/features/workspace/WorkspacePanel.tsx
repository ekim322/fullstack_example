import { useEffect, useMemo, useState } from "react";
import { Files } from "lucide-react";

import { WorkspaceEditor } from "./components/WorkspaceEditor";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar";
import { WorkspaceTree } from "./components/WorkspaceTree";
import { useWorkspaceController } from "./hooks/useWorkspaceController";
import type {
  WorkspaceDialogs,
  WorkspaceOpenFileRequest,
  WorkspaceToolStreamEvent,
} from "./types/workspace";
import styles from "./WorkspacePanel.module.css";

type WorkspacePanelProps = {
  userId: string;
  authToken: string;
  latestToolEvent: WorkspaceToolStreamEvent | null;
  openFileRequest: WorkspaceOpenFileRequest | null;
};

export function WorkspacePanel({ userId, authToken, latestToolEvent, openFileRequest }: WorkspacePanelProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 900);

  const dialogs = useMemo<WorkspaceDialogs>(() => ({
    confirmDiscardDirtyFile: (path) =>
      window.confirm(
        `You have unsaved changes in ${path.split("/").pop()}. Do you want to close it anyway and discard changes?`,
      ),
    promptForNewFilePath: (defaultPath) => window.prompt("File path", defaultPath),
    promptForNewFolderPath: (defaultPath) => window.prompt("Folder path", defaultPath),
    confirmDeleteNode: (path, nodeType) => window.confirm(`Delete ${nodeType} ${path}?`),
    confirmRecursiveDelete: (path) => window.confirm(`Folder ${path} is not empty. Delete recursively?`),
  }), []);

  const {
    state,
    refreshTree,
    toggleExpanded,
    selectNode,
    setDraft,
    saveFile,
    reloadOpenFile,
    overwriteAfterConflict,
    closeFile,
    switchTab,
    createFile,
    createFolder,
    deleteSelected,
    uploadFromPicker,
    dismissToast,
  } = useWorkspaceController({ authToken, latestToolEvent, dialogs });

  useEffect(() => {
    if (!openFileRequest?.path) {
      return;
    }

    void selectNode(openFileRequest.path, "file");
  }, [openFileRequest, selectNode]);

  return (
    <div className={styles.panel}>
      <div className={styles.workspaceBody}>
        <div className={styles.activityBar}>
          <button
            type="button"
            className={`${styles.activityItem} ${isSidebarOpen ? styles.activityItemActive : ""}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Hide Explorer" : "Show Explorer"}
          >
            <Files size={24} strokeWidth={1.5} />
          </button>
        </div>

        {isSidebarOpen && (
          <aside className={styles.sidebar}>
            <WorkspaceToolbar
              selectedPath={state.selectedPath}
              isLoadingTree={state.isLoadingTree}
              isUploading={state.isUploading}
              onRefresh={() => void refreshTree()}
              onCreateFile={() => void createFile()}
              onCreateFolder={() => void createFolder()}
              onDeleteSelected={() => void deleteSelected()}
              onUpload={(files, mode) => void uploadFromPicker(files, mode)}
            />
            <div className={styles.treeContainer}>
              <WorkspaceTree
                root={state.tree}
                expandedPaths={state.expandedPaths}
                selectedPath={state.selectedPath}
                isLoading={state.isLoadingTree}
                onToggleFolder={toggleExpanded}
                onSelectNode={(path, nodeType) => void selectNode(path, nodeType)}
              />
            </div>
          </aside>
        )}

        <section className={styles.mainArea}>
          <WorkspaceEditor
            userId={userId}
            openFiles={state.openFiles}
            activeFilePath={state.activeFilePath}
            isSaving={state.isSaving}
            isLoadingFile={state.isLoadingFile}
            onDraftChange={setDraft}
            onSave={(path) => void saveFile(path)}
            onReload={(path) => void reloadOpenFile(path)}
            onOverwrite={(path) => void overwriteAfterConflict(path)}
            onCloseFile={closeFile}
            onSwitchTab={switchTab}
          />
        </section>
      </div>

      {state.toasts.length > 0 ? (
        <div className={styles.toastStack}>
          {state.toasts.map((toast) => (
            <div
              key={toast.id}
              className={`${styles.toast} ${
                toast.kind === "error"
                  ? styles.toastError
                  : toast.kind === "success"
                    ? styles.toastSuccess
                    : styles.toastInfo
              }`}
              onAnimationEnd={() => dismissToast(toast.id)}
            >
              <span>{toast.message}</span>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
