import { useEffect, useRef } from "react";
import { FilePlus, FolderPlus, FolderUp, RefreshCw, Upload, Trash2 } from "lucide-react";

import styles from "./WorkspaceToolbar.module.css";

type WorkspaceToolbarProps = {
  selectedPath: string | null;
  isLoadingTree: boolean;
  isUploading: boolean;
  onRefresh: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onDeleteSelected: () => void;
  onUpload: (fileList: FileList | null, mode: "files" | "folder") => void;
};

export function WorkspaceToolbar({
  selectedPath,
  isLoadingTree,
  isUploading,
  onRefresh,
  onCreateFile,
  onCreateFolder,
  onDeleteSelected,
  onUpload,
}: WorkspaceToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!folderInputRef.current) {
      return;
    }

    folderInputRef.current.setAttribute("webkitdirectory", "");
    folderInputRef.current.setAttribute("directory", "");
  }, []);

  return (
    <div className={styles.toolbar}>
      <div className={styles.header}>
        <span className={styles.title}>EXPLORER</span>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onCreateFile}
            title="New File"
          >
            <FilePlus size={14} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onCreateFolder}
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Upload Files"
            aria-label="Upload Files"
          >
            <Upload size={14} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => folderInputRef.current?.click()}
            disabled={isUploading}
            title="Upload Folder"
            aria-label="Upload Folder"
          >
            <FolderUp size={14} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRefresh}
            disabled={isLoadingTree}
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoadingTree ? styles.spinning : ""} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.dangerHover}`}
            onClick={onDeleteSelected}
            disabled={!selectedPath || selectedPath === "/"}
            title="Delete Selected"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        onChange={(event) => {
          onUpload(event.currentTarget.files, "files");
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className={styles.hiddenInput}
        onChange={(event) => {
          onUpload(event.currentTarget.files, "folder");
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
