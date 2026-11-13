import { useMemo, useSyncExternalStore } from "react";

/** Opaque source descriptor for complete ranges behind a parent-level filter. */
export interface SelectionRangeSource {
  readonly source: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

type Resolver = (scope: {
  mediaType: string;
  filters: Readonly<Record<string, unknown>>;
}) => SelectionRangeSource | undefined;

let resolver: Resolver | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Installs source-owned filter-to-range semantics without changing grid filters. */
export function registerSelectionRangeSource(next: Resolver) {
  const previous = resolver;
  resolver = next;
  for (const listener of listeners) listener();
  return () => {
    if (resolver !== next) return;
    resolver = previous;
    for (const listener of listeners) listener();
  };
}

/** Reads the registered source's capture semantics for the current filters. */
export function useSelectionRangeSource(scope: Parameters<Resolver>[0]) {
  const { mediaType, filters } = scope;
  const current = useSyncExternalStore(subscribe, () => resolver);
  return useMemo(
    () => current?.({ mediaType, filters }),
    [current, mediaType, filters],
  );
}
