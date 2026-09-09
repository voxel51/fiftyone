import { useCallback, useEffect, useRef, useState } from "react";

/** Default time a copied-state affordance remains visible after copy. */
const COPY_FEEDBACK_MS = 1200;

/**
 * Tracks transient copy feedback, resetting to `resetValue` after the delay.
 */
export function useCopyFeedback<T>(
  resetValue: T,
  delayMs = COPY_FEEDBACK_MS,
): readonly [T, (value: T) => void] {
  const [value, setValue] = useState(resetValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // This effect clears a pending copy-feedback timer on unmount.
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const showFeedback = useCallback(
    (nextValue: T) => {
      setValue(nextValue);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setValue(resetValue);
      }, delayMs);
    },
    [delayMs, resetValue],
  );

  return [value, showFeedback];
}
