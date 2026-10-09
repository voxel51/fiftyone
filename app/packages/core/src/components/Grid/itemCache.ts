import type { createCache } from "@fiftyone/looker";
import { usePanelId } from "@fiftyone/spaces";
import type * as fos from "@fiftyone/state";
import type { ID } from "@fiftyone/spotlight";
import { useMemo } from "react";

/** Each sample's rank in the grid, by id */
export type Records = Map<string, number>;

export interface GridItems {
  key: string;
  /** Lookers, built once and kept for every Spotlight the grid creates */
  lookers?: ReturnType<typeof createCache>;
  /** Pages already fetched, which may be read from the Relay store */
  pages: Set<number>;
  records: Records;
  store: WeakMap<ID, { sample: fos.Sample; index: number }>;
}

const byPanel = new Map<string, GridItems>();

/**
 * A grid's items outlive its Spotlight: opening a sample unmounts the grid,
 * and returning should show the same tiles without fetching them again. They
 * are kept per panel, and replaced when the grid resets.
 */
export const gridItems = (panel: string, key: string): GridItems => {
  const current = byPanel.get(panel);
  if (current?.key === key) return current;

  current?.lookers?.delete();
  const next: GridItems = {
    key,
    pages: new Set(),
    records: new Map(),
    store: new WeakMap(),
  };
  byPanel.set(panel, next);
  return next;
};

export default function useGridItems(key: string) {
  const panel = usePanelId() ?? "grid";
  return useMemo(() => gridItems(panel, key), [panel, key]);
}
