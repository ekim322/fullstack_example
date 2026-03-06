import type { KeyboardEventHandler, ReactNode } from "react";

type CollapsibleBlockHeaderProps = {
  isExpanded: boolean;
  onToggle: () => void;
  onHeaderKeyDown: KeyboardEventHandler<HTMLDivElement>;
  headerClassName: string;
  expandedHeaderClassName: string;
  caretClassName: string;
  expandedCaretClassName: string;
  children: ReactNode;
};

export function CollapsibleBlockHeader({
  isExpanded,
  onToggle,
  onHeaderKeyDown,
  headerClassName,
  expandedHeaderClassName,
  caretClassName,
  expandedCaretClassName,
  children,
}: CollapsibleBlockHeaderProps) {
  const resolvedHeaderClassName = isExpanded
    ? `${headerClassName} ${expandedHeaderClassName}`
    : headerClassName;
  const resolvedCaretClassName = isExpanded
    ? `${caretClassName} ${expandedCaretClassName}`
    : caretClassName;

  return (
    <div
      className={resolvedHeaderClassName}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={onToggle}
      onKeyDown={onHeaderKeyDown}
    >
      <span className={resolvedCaretClassName}>
        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {children}
    </div>
  );
}
