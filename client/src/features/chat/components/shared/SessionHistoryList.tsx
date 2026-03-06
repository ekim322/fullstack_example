import type { ReactNode } from "react";

import type { ChatSessionSummary } from "../../types";
import { getSessionLabel } from "../../utils/sessionLabel";

type SessionHistoryListClassNames = {
  list: string;
  itemButton: string;
  activeItemButton: string;
  itemLabel: string;
};

type SessionHistoryListProps = {
  sessions: ChatSessionSummary[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  classNames: SessionHistoryListClassNames;
  renderItemMeta: (session: ChatSessionSummary, isActive: boolean) => ReactNode;
  disabled?: boolean;
};

export function SessionHistoryList({
  sessions,
  activeSessionId,
  onSelectSession,
  classNames,
  renderItemMeta,
  disabled = false,
}: SessionHistoryListProps) {
  return (
    <ul className={classNames.list}>
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const itemButtonClassName = isActive
          ? `${classNames.itemButton} ${classNames.activeItemButton}`
          : classNames.itemButton;

        return (
          <li key={session.id}>
            <button
              type="button"
              className={itemButtonClassName}
              onClick={() => onSelectSession(session.id)}
              disabled={disabled}
            >
              <span className={classNames.itemLabel}>{getSessionLabel(session.label)}</span>
              {renderItemMeta(session, isActive)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

