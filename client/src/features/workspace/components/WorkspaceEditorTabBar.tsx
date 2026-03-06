import { Save, RotateCcw, X } from "lucide-react";

import type { WorkspaceOpenFile } from "../types/workspace";
import { handleHorizontalTabListKeyDown } from "../../../shared/ui/tabListKeyboardNavigation";
import styles from "./WorkspaceEditor.module.css";

type WorkspaceEditorTabBarProps = {
  openFiles: WorkspaceOpenFile[];
  activeFilePath: string;
  activeFile: WorkspaceOpenFile;
  editorPanelId: string;
  isSaving: boolean;
  isLoadingFile: boolean;
  onReload: (path?: string) => void;
  onSave: (path?: string) => void;
  onSwitchTab: (path: string) => void;
  onCloseFile: (path: string) => void;
};

export function WorkspaceEditorTabBar({
  openFiles,
  activeFilePath,
  activeFile,
  editorPanelId,
  isSaving,
  isLoadingFile,
  onReload,
  onSave,
  onSwitchTab,
  onCloseFile,
}: WorkspaceEditorTabBarProps) {
  const tabs = openFiles.map((file) => ({ id: file.path }));

  return (
    <header className={styles.tabBar}>
      <div className={styles.tabScrollArea} role="tablist" aria-label="Workspace tabs">
        {openFiles.map((file, index) => {
          const isActive = file.path === activeFilePath;
          const filename = file.path.split("/").pop() || file.path;

          return (
            <div
              key={file.path}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
            >
              <button
                type="button"
                className={styles.tabTrigger}
                role="tab"
                aria-controls={editorPanelId}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onSwitchTab(file.path)}
                onKeyDown={(event) =>
                  handleHorizontalTabListKeyDown(event, index, tabs, onSwitchTab)
                }
              >
                <span className={styles.tabName} title={file.path}>{filename}</span>
              </button>
              <div className={styles.tabActionArea}>
                <div className={`${styles.dirtyDot} ${file.isDirty ? styles.isDirty : ""}`} />
                <button
                  type="button"
                  className={`${styles.tabClose} ${file.isDirty ? styles.closeWhenDirty : ""} ${isActive ? styles.closeActive : ""}`}
                  title="Close"
                  onClick={() => onCloseFile(file.path)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.tabBarActions}>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => onReload(activeFile.path)}
          disabled={isLoadingFile || isSaving}
          title="Reload from server"
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => onSave(activeFile.path)}
          disabled={!activeFile.isDirty || isSaving}
          title="Save file (Ctrl+S)"
        >
          <Save size={14} />
        </button>
      </div>
    </header>
  );
}
