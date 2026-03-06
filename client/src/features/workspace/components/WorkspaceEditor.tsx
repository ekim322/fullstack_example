import { AlertTriangle } from "lucide-react";
import Editor from "@monaco-editor/react";
import type { WorkspaceOpenFile } from "../types/workspace";
import { WorkspaceEditorTabBar } from "./WorkspaceEditorTabBar";
import styles from "./WorkspaceEditor.module.css";

type WorkspaceEditorProps = {
  userId: string;
  openFiles: WorkspaceOpenFile[];
  activeFilePath: string | null;
  isSaving: boolean;
  isLoadingFile: boolean;
  onDraftChange: (path: string, value: string) => void;
  onSave: (path?: string) => void;
  onReload: (path?: string) => void;
  onOverwrite: (path?: string) => void;
  onCloseFile: (path: string) => void;
  onSwitchTab: (path: string) => void;
};

export function WorkspaceEditor({
  userId,
  openFiles,
  activeFilePath,
  isSaving,
  isLoadingFile,
  onDraftChange,
  onSave,
  onReload,
  onOverwrite,
  onCloseFile,
  onSwitchTab,
}: WorkspaceEditorProps) {
  const editorPanelId = "workspace-editor-panel";

  if (openFiles.length === 0 || !activeFilePath) {
    return (
      <div className={styles.emptyStateContainer}>
        <div className={styles.emptyStateLogo}>
          <div className={styles.logoIcon}>S</div>
        </div>
        <div className={styles.welcomeText} title={userId}>Welcome {userId}</div>
        <div className={styles.emptyStateText}>Select a file to view and edit</div>
      </div>
    );
  }

  const activeFile = openFiles.find((f) => f.path === activeFilePath) || openFiles[0];

  return (
    <div className={styles.editorRoot}>
      <WorkspaceEditorTabBar
        openFiles={openFiles}
        activeFilePath={activeFilePath}
        activeFile={activeFile}
        editorPanelId={editorPanelId}
        isSaving={isSaving}
        isLoadingFile={isLoadingFile}
        onReload={onReload}
        onSave={onSave}
        onSwitchTab={onSwitchTab}
        onCloseFile={onCloseFile}
      />

      <div className={styles.breadcrumb}>
        {activeFile.path}
      </div>

      {activeFile.conflictMessage ? (
        <div className={styles.conflictBanner}>
          <div className={styles.guardMessage}>
            <AlertTriangle size={14} className={styles.guardIcon} />
            <span>{activeFile.conflictMessage}</span>
          </div>
          <div className={styles.guardActions}>
            <button type="button" onClick={() => onReload(activeFile.path)} className={styles.secondaryBtn}>
              Reload From Server
            </button>
            <button type="button" onClick={() => onOverwrite(activeFile.path)} className={styles.dangerBtn}>
              Overwrite Anyway
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.editorContainer} id={editorPanelId} role="tabpanel">
        <Editor
          key={activeFile.path}
          className={styles.editor}
          path={activeFile.path}
          value={activeFile.draft}
          onChange={(value) => onDraftChange(activeFile.path, value || "")}
          theme="vs-dark"
          options={{
            readOnly: isLoadingFile,
            minimap: { enabled: false },
            wordWrap: "on",
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
          }}
        />
      </div>
    </div>
  );
}
