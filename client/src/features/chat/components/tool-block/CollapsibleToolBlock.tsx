import type { ReactNode } from "react";

import { useCollapsibleBlock } from "../../hooks/useCollapsibleBlock";
import { CollapsibleBlockHeader } from "../shared/CollapsibleBlockHeader";
import styles from "./CollapsibleToolBlock.module.css";

type CollapsibleToolBlockProps = {
  icon: ReactNode;
  title: ReactNode;
  titleAction?: ReactNode;
  headerRight?: ReactNode;
  children?: ReactNode;
};

export function CollapsibleToolBlock({
  icon,
  title,
  titleAction,
  headerRight,
  children,
}: CollapsibleToolBlockProps) {
  const {
    isExpanded: expanded,
    onHeaderKeyDown,
    toggleExpanded,
  } = useCollapsibleBlock();

  return (
    <div className={`${styles.messageBubble} ${styles.toolBlock}`}>
      <CollapsibleBlockHeader
        isExpanded={expanded}
        onToggle={toggleExpanded}
        onHeaderKeyDown={onHeaderKeyDown}
        headerClassName={styles.toolHeader}
        expandedHeaderClassName={styles.toolHeaderExpanded}
        caretClassName={styles.caret}
        expandedCaretClassName={styles.caretExpanded}
      >
        <span className={styles.toolIcon}>{icon}</span>
        <span className={styles.toolTitle}>
          <span className={styles.toolTitleText}>{title}</span>
          {titleAction ? <span className={styles.toolTitleAction}>{titleAction}</span> : null}
        </span>
        {headerRight}
      </CollapsibleBlockHeader>

      {expanded ? <div className={styles.toolBody}>{children}</div> : null}
    </div>
  );
}
