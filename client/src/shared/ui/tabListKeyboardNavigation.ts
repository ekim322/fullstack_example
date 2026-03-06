import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type TabLike = {
  id: string;
};

export function handleHorizontalTabListKeyDown<T extends TabLike>(
  event: ReactKeyboardEvent<HTMLElement>,
  currentIndex: number,
  tabs: readonly T[],
  onActivateTab: (tabId: string) => void,
): void {
  if (tabs.length < 2) {
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    const nextIndex = (currentIndex + 1) % tabs.length;
    onActivateTab(tabs[nextIndex].id);
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    const nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    onActivateTab(tabs[nextIndex].id);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    onActivateTab(tabs[0].id);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    onActivateTab(tabs[tabs.length - 1].id);
  }
}
