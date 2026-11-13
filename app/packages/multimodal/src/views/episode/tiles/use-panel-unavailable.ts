import { useCallback, useState } from "react";

/**
 * Tracks a child panel's `onUnavailableChange` report for one scope, such as
 * a source and stream. A report made for an earlier scope never applies to
 * the current one.
 */
export function usePanelUnavailable(scopeKey: string): {
  readonly onUnavailableChange: (unavailable: boolean) => void;
  readonly unavailable: boolean;
} {
  const [unavailableKey, setUnavailableKey] = useState<string | null>(null);
  const onUnavailableChange = useCallback(
    (unavailable: boolean) =>
      setUnavailableKey((current) =>
        unavailable ? scopeKey : current === scopeKey ? null : current,
      ),
    [scopeKey],
  );
  return { onUnavailableChange, unavailable: unavailableKey === scopeKey };
}
