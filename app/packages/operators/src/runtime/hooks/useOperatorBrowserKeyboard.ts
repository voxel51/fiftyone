import { useCallback, useEffect } from "react";

type UseOperatorBrowserKeyboardProps = {
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  onSubmit: () => void;
  close: () => void;
  isOperatorPaletteOpened: boolean;
};

/**
 * useOperatorBrowserKeyboard
 *
 * Handles keyboard events for operator browser navigation.
 */
export default function useOperatorBrowserKeyboard({
  isVisible,
  setIsVisible,
  selectNext,
  selectPrevious,
  onSubmit,
  close,
  isOperatorPaletteOpened,
}: UseOperatorBrowserKeyboardProps): void {
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "`" && !isVisible) return;
      if (e.key === "`" && isOperatorPaletteOpened) return;

      if (["ArrowDown", "ArrowUp", "`", "Enter", "Escape"].includes(e.key))
        e.preventDefault();

      switch (e.key) {
        case "ArrowDown":
          selectNext();
          break;
        case "ArrowUp":
          selectPrevious();
          break;
        case "`":
          setIsVisible(!isVisible);
          break;
        case "Enter":
          onSubmit();
          break;
        case "Escape":
          close();
          break;
      }
    },
    [
      selectNext,
      selectPrevious,
      isVisible,
      onSubmit,
      close,
      setIsVisible,
      isOperatorPaletteOpened,
    ]
  );

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onKeyDown]);
}
