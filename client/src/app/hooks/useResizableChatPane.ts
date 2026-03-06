import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const DEFAULT_CHAT_WIDTH_VW = 41.6;
const DEFAULT_CHAT_HEIGHT_VH = 50;

type UseResizableChatPaneResult = {
  chatWidth: number;
  chatHeight: number;
  isResizing: boolean;
  shellStyle: React.CSSProperties;
  startResizing: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleResizerKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
};

export function useResizableChatPane(): UseResizableChatPaneResult {
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH_VW);
  const [chatHeight, setChatHeight] = useState(DEFAULT_CHAT_HEIGHT_VH);
  const [isResizing, setIsResizing] = useState(false);

  const resizeToClient = useCallback((clientX: number, clientY: number) => {
    if (window.innerWidth <= 1100) {
      const newHeightVH = ((window.innerHeight - clientY) / window.innerHeight) * 100;
      const clampedHeightVH = Math.min(85, Math.max(15, newHeightVH));
      setChatHeight(clampedHeightVH);
    } else {
      const newWidthVW = ((window.innerWidth - clientX) / window.innerWidth) * 100;
      const clampedWidthVW = Math.min(80, Math.max(20, newWidthVW));
      setChatWidth(clampedWidthVW);
    }
  }, []);

  const startResizing = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsResizing(true);
    resizeToClient(event.clientX, event.clientY);
  }, [resizeToClient]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (pointerMoveEvent: PointerEvent) => {
      if (!isResizing) {
        return;
      }
      resizeToClient(pointerMoveEvent.clientX, pointerMoveEvent.clientY);
    },
    [isResizing, resizeToClient],
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
    const isMobile = window.innerWidth <= 1100;
    const step = event.shiftKey ? 5 : 2;
    
    if (isMobile) {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setChatHeight((current) => Math.min(85, current + step));
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setChatHeight((current) => Math.max(15, current - step));
      }
    } else {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setChatWidth((current) => Math.min(80, current + step));
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setChatWidth((current) => Math.max(20, current - step));
      }
    }
  }, []);

  const shellStyle = useMemo(
    () => ({ 
      "--chat-width": `${chatWidth}vw`,
      "--chat-height": `${chatHeight}vh`
    } as React.CSSProperties),
    [chatWidth, chatHeight],
  );

  return {
    chatWidth,
    chatHeight,
    isResizing,
    shellStyle,
    startResizing,
    handleResizerKeyDown,
  };
}
