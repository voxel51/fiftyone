import { useLayoutEffect } from "react";

/**
 * Reports whether a panel can draw its frame through the owner's
 * `onUnavailableChange`, and withdraws the report when the panel unmounts.
 */
export function useReportUnavailable(
  unavailable: boolean,
  onUnavailableChange: ((unavailable: boolean) => void) | undefined,
): void {
  // This layout effect reports before paint, so an owner waiting for the
  // frame can show the panel's notices instead of a loading cover.
  useLayoutEffect(() => {
    if (!onUnavailableChange) return undefined;
    onUnavailableChange(unavailable);
    return () => onUnavailableChange(false);
  }, [onUnavailableChange, unavailable]);
}
