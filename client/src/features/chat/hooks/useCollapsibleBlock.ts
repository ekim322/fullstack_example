import { useCallback, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";

type UseCollapsibleBlockResult = {
  isExpanded: boolean;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  toggleExpanded: () => void;
  onHeaderKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

export function useCollapsibleBlock(initialExpanded = false): UseCollapsibleBlockResult {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((current) => !current);
  }, []);

  const onHeaderKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleExpanded();
      }
    },
    [toggleExpanded],
  );

  return {
    isExpanded,
    setIsExpanded,
    toggleExpanded,
    onHeaderKeyDown,
  };
}
