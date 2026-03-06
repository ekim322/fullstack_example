import { ChatPanel } from "../features/chat/components";
import { WorkspacePanel } from "../features/workspace/WorkspacePanel";
import { useResizableChatPane } from "./hooks/useResizableChatPane";
import { useWorkspaceEventBridge } from "./hooks/useWorkspaceEventBridge";
import styles from "./AppShell.module.css";

type AppShellProps = {
  userId: string;
  authToken: string;
  onLogout: () => void;
};

export function AppShell({ userId, authToken, onLogout }: AppShellProps) {
  const {
    isResizing,
    shellStyle,
    startResizing,
    handleResizerKeyDown,
  } = useResizableChatPane();
  const {
    latestWorkspaceToolEvent,
    workspaceOpenFileRequest,
    handleToolEvent,
    handleOpenWorkspacePath,
  } = useWorkspaceEventBridge();

  return (
    <main
      className={`${styles.shell} ${isResizing ? styles.resizing : ""}`}
      style={shellStyle}
    >
      <section className={`${styles.pane} ${styles.workspacePane}`}>
        <WorkspacePanel
          userId={userId}
          authToken={authToken}
          latestToolEvent={latestWorkspaceToolEvent}
          openFileRequest={workspaceOpenFileRequest}
        />
      </section>
      
      <button
        type="button"
        className={styles.resizer} 
        onPointerDown={startResizing}
        onKeyDown={handleResizerKeyDown}
        title="Resize panels"
        aria-label="Resize panels"
      />

      <section className={`${styles.pane} ${styles.chatPane}`}>
        <ChatPanel
          userId={userId}
          authToken={authToken}
          onLogout={onLogout}
          onToolEvent={handleToolEvent}
          onOpenWorkspacePath={handleOpenWorkspacePath}
        />
      </section>
    </main>
  );
}
