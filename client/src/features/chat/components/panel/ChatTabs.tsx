import type { RefObject } from "react";

import { handleHorizontalTabListKeyDown } from "../../../../shared/ui/tabListKeyboardNavigation";
import styles from "./ChatTabs.module.css";

export type ChatTab = {
  id: string;
  label: string;
  isActive: boolean;
};

type ChatTabsProps = {
  tabs: ChatTab[];
  panelId: string;
  tabStripRef: RefObject<HTMLDivElement>;
  onSwitchSession: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
};

function tabIdForSession(sessionId: string): string {
  return `chat-tab-${sessionId}`;
}

export function ChatTabs({
  tabs,
  panelId,
  tabStripRef,
  onSwitchSession,
  onCloseTab,
}: ChatTabsProps) {
  return (
    <div className={styles.tabStrip} role="tablist" aria-label="Chat tabs" ref={tabStripRef}>
      {tabs.map((tab, index) => (
        <div key={tab.id} className={`${styles.tab} ${tab.isActive ? styles.tabActive : ""}`} role="presentation">
          <button
            type="button"
            id={tabIdForSession(tab.id)}
            role="tab"
            aria-controls={panelId}
            aria-selected={tab.isActive}
            tabIndex={tab.isActive ? 0 : -1}
            className={styles.tabButton}
            onClick={() => onSwitchSession(tab.id)}
            onKeyDown={(event) => handleHorizontalTabListKeyDown(event, index, tabs, onSwitchSession)}
          >
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
          <button
            type="button"
            className={styles.tabClose}
            aria-label={`Close ${tab.label}`}
            onClick={(event) => {
              event.stopPropagation();
              onCloseTab(tab.id);
            }}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
