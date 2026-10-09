/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The matrix's one horizontal scroll position. Every row and the column
 * header read it, so columns stay aligned; each re-renders only when the
 * range of columns it should mount changes.
 */

import { useMemo, useSyncExternalStore } from "react";
import { columnWindow, type Range } from "./matrixLayout";

export const createHScroll = () => {
  let x = 0;
  const listeners = new Set<() => void>();

  return {
    get x() {
      return x;
    },
    set(next: number) {
      if (next === x) return;
      x = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type HScroll = ReturnType<typeof createHScroll>;

/** The columns to mount (with overscan) and the ones actually in view. */
export const useColumnWindow = (
  scroll: HScroll,
  trackWidth: number,
  colWidth: number,
  count: number,
): Range & { visible: Range } => {
  const key = useSyncExternalStore(scroll.subscribe, () => {
    const mounted = columnWindow(scroll.x, trackWidth, colWidth, count);
    const visible = columnWindow(scroll.x, trackWidth, colWidth, count, 0);
    return [mounted.start, mounted.end, visible.start, visible.end].join(":");
  });
  return useMemo(() => {
    const [start, end, first, last] = key.split(":").map(Number);
    return { start, end, visible: { start: first, end: last } };
  }, [key]);
};
