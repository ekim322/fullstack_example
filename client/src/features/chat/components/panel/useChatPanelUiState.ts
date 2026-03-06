import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { ChatSessionSummary } from "../../types";
import { getSessionLabel } from "../../utils/sessionLabel";
import type { ChatTab } from "./ChatTabs";

type UseChatPanelUiStateArgs = {
  sessionHistory: ChatSessionSummary[];
  activeSessionId: string;
  openSessionTab: (sessionId: string) => void;
  closeSessionTab: (sessionId: string) => void;
  startNewSession: () => void;
  onLogout: () => void;
};

type UseChatPanelUiStateResult = {
  panelId: string;
  historyOpen: boolean;
  menuOpen: boolean;
  historyRef: RefObject<HTMLDivElement>;
  tabStripRef: RefObject<HTMLDivElement>;
  openTabs: ChatTab[];
  openSessionFromHistory: (sessionId: string) => void;
  closeTab: (sessionId: string) => void;
  startFreshTab: () => void;
  toggleHistory: () => void;
  toggleMenu: () => void;
  logoutFromMenu: () => void;
};

export function useChatPanelUiState({
  sessionHistory,
  activeSessionId,
  openSessionTab,
  closeSessionTab,
  startNewSession,
  onLogout,
}: UseChatPanelUiStateArgs): UseChatPanelUiStateResult {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const panelId = "chat-session-panel";

  const sessionById = useMemo(
    () => new Map(sessionHistory.map((session) => [session.id, session] as const)),
    [sessionHistory],
  );
  const openTabIds = useMemo(
    () => sessionHistory.filter((session) => session.isOpen).map((session) => session.id),
    [sessionHistory],
  );
  const openTabs = useMemo(
    () =>
      openTabIds.map((tabId) => {
        const session = sessionById.get(tabId);
        return {
          id: tabId,
          isActive: tabId === activeSessionId,
          label: getSessionLabel(session?.label),
        };
      }),
    [activeSessionId, openTabIds, sessionById],
  );

  useEffect(() => {
    if (!historyOpen && !menuOpen) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      if (!historyRef.current?.contains(event.target as Node)) {
        setHistoryOpen(false);
        setMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [historyOpen, menuOpen]);

  useEffect(() => {
    const tabStrip = tabStripRef.current;
    if (!tabStrip) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY !== 0 && event.deltaX === 0) {
        event.preventDefault();
        tabStrip.scrollBy({
          left: event.deltaY,
          behavior: "auto",
        });
      }
    };

    tabStrip.addEventListener("wheel", handleWheel, { passive: false });
    return () => tabStrip.removeEventListener("wheel", handleWheel);
  }, []);

  const closeMenus = useCallback(() => {
    setHistoryOpen(false);
    setMenuOpen(false);
  }, []);

  const openSessionFromHistory = useCallback((sessionId: string) => {
    openSessionTab(sessionId);
    closeMenus();
  }, [closeMenus, openSessionTab]);

  const closeTab = useCallback((sessionId: string) => {
    closeSessionTab(sessionId);
  }, [closeSessionTab]);

  const startFreshTab = useCallback(() => {
    closeMenus();
    startNewSession();
  }, [closeMenus, startNewSession]);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((current) => {
      const next = !current;
      if (next) {
        setMenuOpen(false);
      }
      return next;
    });
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((current) => {
      const next = !current;
      if (next) {
        setHistoryOpen(false);
      }
      return next;
    });
  }, []);

  const logoutFromMenu = useCallback(() => {
    closeMenus();
    onLogout();
  }, [closeMenus, onLogout]);

  return {
    panelId,
    historyOpen,
    menuOpen,
    historyRef,
    tabStripRef,
    openTabs,
    openSessionFromHistory,
    closeTab,
    startFreshTab,
    toggleHistory,
    toggleMenu,
    logoutFromMenu,
  };
}
