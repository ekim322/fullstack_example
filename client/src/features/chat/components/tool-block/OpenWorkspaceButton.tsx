import type { KeyboardEventHandler, MouseEventHandler } from "react";

import styles from "./OpenWorkspaceButton.module.css";

type OpenWorkspaceButtonProps = {
  path: string;
  onOpenPath: (path: string) => void;
};

export function OpenWorkspaceButton({ path, onOpenPath }: OpenWorkspaceButtonProps) {
  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    onOpenPath(path);
  };

  const stopKeyDown: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
  };

  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleClick}
      onKeyDown={stopKeyDown}
    >
      Open in workspace
    </button>
  );
}
