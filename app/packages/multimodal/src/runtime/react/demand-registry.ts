import { useCallback, useRef } from "react";
import type { DemandHandlers, DemandRegistry } from "../demand-bridge";

/** Creates stable demand refs and an idempotent key subscription helper. */
export function useDemandRegistry<
  THandlers extends DemandHandlers,
>(): DemandRegistry<THandlers> {
  const handlersRef = useRef<THandlers | null>(null);
  const refCountsRef = useRef(new Map<string, number>());
  const subscribeKey = useCallback((key: string) => {
    const counts = refCountsRef.current;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    handlersRef.current?.onDemandChanged();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = counts.get(key) ?? 0;
      if (current <= 1) counts.delete(key);
      else counts.set(key, current - 1);
      handlersRef.current?.onDemandChanged();
    };
  }, []);
  return { handlersRef, refCountsRef, subscribeKey };
}
