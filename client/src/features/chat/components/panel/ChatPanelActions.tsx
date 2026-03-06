import type { RefObject } from "react";

import type { ChatSessionSummary } from "../../types";
import { formatSessionTime } from "../../utils/sessionTime";
import { SessionHistoryList } from "../shared/SessionHistoryList";
import styles from "./ChatPanelActions.module.css";

type ChatPanelActionsProps = {
  historyOpen: boolean;
  menuOpen: boolean;
  historyRef: RefObject<HTMLDivElement>;
  sessionHistory: ChatSessionSummary[];
  activeSessionId: string;
  onLogout: () => void;
  onToggleHistory: () => void;
  onToggleMenu: () => void;
  onStartFreshTab: () => void;
  onSelectSessionFromHistory: (sessionId: string) => void;
};

export function ChatPanelActions({
  historyOpen,
  menuOpen,
  historyRef,
  sessionHistory,
  activeSessionId,
  onLogout,
  onToggleHistory,
  onToggleMenu,
  onStartFreshTab,
  onSelectSessionFromHistory,
}: ChatPanelActionsProps) {
  return (
    <div className={styles.tabActions} ref={historyRef}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Open chat history"
        onClick={onToggleHistory}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 6.5v4.2l2.6 1.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <button
        type="button"
        className={`${styles.iconButton} ${styles.plusButton}`}
        aria-label="New chat"
        onClick={onStartFreshTab}
      >
        +
      </button>

      <button type="button" className={styles.iconButton} aria-label="Open menu" onClick={onToggleMenu}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="5" r="1.5" fill="currentColor" />
          <circle cx="10" cy="10" r="1.5" fill="currentColor" />
          <circle cx="10" cy="15" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {historyOpen ? (
        <div className={styles.historyPopover}>
          <header className={styles.historyHeader}>
            <h3>History</h3>
          </header>
          <SessionHistoryList
            sessions={sessionHistory}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSessionFromHistory}
            classNames={{
              list: styles.historyList,
              itemButton: styles.historyItem,
              activeItemButton: styles.historyItemActive,
              itemLabel: styles.historyItemLabel,
            }}
            renderItemMeta={(session) => (
              <time className={styles.historyItemTime}>{formatSessionTime(session.updatedAt)}</time>
            )}
          />
        </div>
      ) : null}

      {menuOpen ? (
        <div className={styles.menuPopover}>
          <button type="button" className={styles.menuItem} onClick={onLogout}>
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
