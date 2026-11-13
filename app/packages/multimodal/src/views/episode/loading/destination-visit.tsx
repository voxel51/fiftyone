import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

/**
 * Longest time the loading mask may cover one destination. Longer than warm
 * and typical cold opens, and shorter than one byte-read inactivity deadline
 * (30 s), so a stalled read reveals the shell's own loading and error states.
 * It only dismisses the mask; it never cancels or fails a request.
 */
export const DESTINATION_LOADING_WATCHDOG_MS = 10_000;

interface DestinationVisit {
  readonly settle: () => void;
  readonly settled: boolean;
}

const UNSCOPED_VISIT: DestinationVisit = {
  settle: () => undefined,
  settled: false,
};

const context = createContext<DestinationVisit>(UNSCOPED_VISIT);

/**
 * Scopes the modal loading mask to one navigation visit. Each change of
 * `visitKey`, including A -> B -> A, starts a new visit, and settle callbacks
 * from an earlier visit are ignored. A settled visit stays settled, so URL
 * renewals, retries, and later seeks cannot bring the mask back. Keep the key
 * independent of signed URLs.
 */
export function DestinationVisitProvider({
  children,
  visitKey,
}: {
  readonly children: ReactNode;
  readonly visitKey: string;
}) {
  const [visit, setVisit] = useState({
    epoch: 0,
    key: visitKey,
    settled: false,
  });
  if (visit.key !== visitKey) {
    setVisit({ epoch: visit.epoch + 1, key: visitKey, settled: false });
  }
  const { epoch, settled } = visit;
  const settle = useCallback(
    () =>
      setVisit((current) =>
        current.epoch === epoch && !current.settled
          ? { ...current, settled: true }
          : current,
      ),
    [epoch],
  );
  // This effect bounds how long the mask can hide a visit that never reports
  // a frame or a terminal outcome. Navigation and unmount clear the timer.
  useEffect(() => {
    if (settled) return undefined;
    const timer = setTimeout(settle, DESTINATION_LOADING_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [settle, settled]);
  const value = useMemo(() => ({ settle, settled }), [settle, settled]);
  return <context.Provider value={value}>{children}</context.Provider>;
}

/** Reads whether the current visit has settled, and how to settle it. */
export function useDestinationVisit(): DestinationVisit {
  return useContext(context);
}
