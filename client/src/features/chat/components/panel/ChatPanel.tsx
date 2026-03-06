import { useChatController } from "../../hooks/useChatController";
import { isSessionActive, shouldShowThinking } from "../../state/chatSelectors";
import type { ToolCallStreamEvent, ToolResultStreamEvent } from "../../types";
import { ChatComposer } from "../composer";
import { ChatMessageList } from "../messages";
import { ChatPanelActions } from "./ChatPanelActions";
import { ChatTabs } from "./ChatTabs";
import { useChatPanelUiState } from "./useChatPanelUiState";
import styles from "./ChatPanel.module.css";

type ChatPanelProps = {
  userId: string;
  authToken: string;
  onLogout: () => void;
  onToolEvent?: (event: ToolCallStreamEvent | ToolResultStreamEvent) => void;
  onOpenWorkspacePath?: (path: string) => void;
};

export function ChatPanel({ userId, authToken, onLogout, onToolEvent, onOpenWorkspacePath }: ChatPanelProps) {
  const {
    state,
    activeLocalSessionId,
    sessionHistory,
    switchSession,
    openSessionTab,
    closeSessionTab,
    startNewSession,
    setDraft,
    setMode,
    setModel,
    setAutoConfirm,
    setDecision,
    sendMessage,
    submitAskUserQuestionResponse,
    stopSession,
  } = useChatController({ userId, authToken, onToolEvent });
  const {
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
  } = useChatPanelUiState({
    sessionHistory,
    activeSessionId: activeLocalSessionId,
    openSessionTab,
    closeSessionTab,
    startNewSession,
    onLogout,
  });

  const runActive = isSessionActive(state.status);
  const showThinking = shouldShowThinking(state);

  return (
    <section className={styles.panel}>
      <header className={styles.tabBar}>
        <ChatTabs
          tabs={openTabs}
          panelId={panelId}
          tabStripRef={tabStripRef}
          onSwitchSession={switchSession}
          onCloseTab={closeTab}
        />
        <ChatPanelActions
          historyOpen={historyOpen}
          menuOpen={menuOpen}
          historyRef={historyRef}
          sessionHistory={sessionHistory}
          activeSessionId={activeLocalSessionId}
          onLogout={logoutFromMenu}
          onToggleHistory={toggleHistory}
          onToggleMenu={toggleMenu}
          onStartFreshTab={startFreshTab}
          onSelectSessionFromHistory={openSessionFromHistory}
        />
      </header>

      <div
        className={styles.tabPanel}
        id={panelId}
        role="tabpanel"
        aria-labelledby={`chat-tab-${activeLocalSessionId}`}
      >
        <ChatMessageList
          messages={state.messages}
          showThinking={showThinking}
          status={state.status}
          pendingToolCalls={state.pendingToolCalls}
          decisions={state.decisionByCallId}
          onDecisionChange={setDecision}
          onOpenWorkspacePath={onOpenWorkspacePath}
          onAskUserQuestionSubmit={submitAskUserQuestionResponse}
        />

        {state.error ? <div className={styles.error}>{state.error}</div> : null}

        <ChatComposer
          draft={state.draft}
          mode={state.controls.mode}
          model={state.controls.model}
          autoConfirmTools={state.controls.autoConfirmTools}
          disabled={runActive}
          sendDisabled={!state.draft.trim()}
          status={state.status}
          onModeChange={setMode}
          onModelChange={setModel}
          onAutoConfirmChange={setAutoConfirm}
          onDraftChange={setDraft}
          onSend={sendMessage}
          onStop={stopSession}
        />
      </div>
    </section>
  );
}
