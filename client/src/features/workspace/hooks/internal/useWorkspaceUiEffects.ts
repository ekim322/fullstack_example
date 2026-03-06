import { useEffect, type MutableRefObject } from "react";

import type { WorkspaceState } from "../../types/workspace";

type UseWorkspaceSaveShortcutArgs = {
  stateRef: MutableRefObject<WorkspaceState>;
  saveOpenFile: (path?: string) => Promise<boolean>;
};

export function useWorkspaceSaveShortcut({
  stateRef,
  saveOpenFile,
}: UseWorkspaceSaveShortcutArgs): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const activePath = stateRef.current.activeFilePath;
        if (!activePath) return;
        const activeFile = stateRef.current.openFiles.find((file) => file.path === activePath);
        if (!activeFile || !activeFile.isDirty || stateRef.current.isSaving) {
          return;
        }
        void saveOpenFile(activePath);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveOpenFile, stateRef]);
}
