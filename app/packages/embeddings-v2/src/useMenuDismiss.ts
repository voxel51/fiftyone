/**
 * Closes an open header menu on an outside click or Escape.
 */
import { useEffect, type RefObject } from "react";

export function useMenuDismiss(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: Event) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        // The click that dismisses spends itself doing so. Without this it
        // also lands on the plot, where empty space means "clear", and
        // closing a menu silently discards the selection or text search
        e.stopPropagation();
        onDismiss();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    // Capture phase + pointerdown: the plot canvas stopPropagation()s its
    // pointer events, so a bubbling listener never sees an outside click on it
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, rootRef, onDismiss]);
}
