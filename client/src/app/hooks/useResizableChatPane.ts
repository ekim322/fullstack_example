import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const DEFAULT_CHAT_WIDTH_VW = 41.6;

type UseResizableChatPaneResult = {
  chatWidth: number;
  isResizing: boolean;
  shellStyle: React.CSSProperties;
  startResizing: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleResizerKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
};

export function useResizableChatPane(): UseResizableChatPaneResult {
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH_VW);
  const [isResizing, setIsResizing] = useState(false);

  const resizeToClientX = useCallback((clientX: number) => {
    const newWidthVW = ((window.innerWidth - clientX) / window.innerWidth) * 100;
    const clampedWidthVW = Math.min(80, Math.max(20, newWidthVW));
    setChatWidth(clampedWidthVW);
  }, []);

  const startResizing = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsResizing(true);
    resizeToClientX(event.clientX);
  }, [resizeToClientX]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (pointerMoveEvent: PointerEvent) => {
      if (!isResizing) {
        return;
      }
      resizeToClientX(pointerMoveEvent.clientX);
    },
    [isResizing, resizeToClientX],
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("pointermove", resize);
      window.addEventListener("pointerup", stopResizing);
      window.addEventListener("pointercancel", stopResizing);
    }
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const handleResizerKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 5 : 2;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setChatWidth((current) => Math.min(80, current + step));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setChatWidth((current) => Math.max(20, current - step));
    }
  }, []);

  const shellStyle = useMemo(
    () => ({ "--chat-width": `${chatWidth}vw` } as React.CSSProperties),
    [chatWidth],
  );

  return {
    chatWidth,
    isResizing,
    shellStyle,
    startResizing,
    handleResizerKeyDown,
  };
}
