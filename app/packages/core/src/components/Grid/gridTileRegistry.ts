/**
 * Live registry of grid tiles that are currently visible — populated
 * by `useRenderer.showItem` and consumed by `TileDecoratorPortals`,
 * which renders one React portal per entry into the tile's reserved
 * overlay div.
 *
 * Decoupling tile DOM management (in `useRenderer`) from React
 * rendering (in `TileDecoratorPortals`) lets us keep `showItem` a
 * cheap synchronous callback while letting decorators use any React /
 * Recoil / Jotai patterns inside.
 */

import { useSyncExternalStore } from "react";
import type { TileDecoratorSample } from "./tileDecorators";

export interface GridTileEntry {
  /** Stable id for the tile — used as React key and registry key. */
  id: string;
  /** The empty `<div>` sibling of the looker host, ready for portal. */
  overlayEl: HTMLElement;
  /** Sample payload handed to decorators' `render(sample)`. */
  sample: TileDecoratorSample;
}

const tiles = new Map<string, GridTileEntry>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of listeners) l();
};

/**
 * Register / refresh a tile. Idempotent on `id`: re-registering with
 * the same id replaces the prior entry (e.g. when Spotlight reuses a
 * tile element for a different sample, or when the sample payload
 * changes after a refetch).
 */
export const registerTile = (entry: GridTileEntry): void => {
  const prev = tiles.get(entry.id);
  // Skip the notify storm when nothing meaningful changed — the same
  // tile re-attaching to the same overlay div with the same sample
  // identity is the steady-scroll case and shouldn't churn portals.
  if (
    prev &&
    prev.overlayEl === entry.overlayEl &&
    prev.sample === entry.sample
  ) {
    return;
  }
  tiles.set(entry.id, entry);
  notify();
};

/** Remove a tile (called from `useRenderer.detachItem`). */
export const unregisterTile = (id: string): void => {
  const entry = tiles.get(id);
  if (!entry) return;
  tiles.delete(id);
  notify();
};

// External-store snapshot. Returns a stable array reference between
// changes so portal renders aren't churned.
let snapshot: readonly GridTileEntry[] = Object.freeze([]);
const refreshSnapshot = () => {
  snapshot = Object.freeze(Array.from(tiles.values()));
};
listeners.add(refreshSnapshot);

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const getSnapshot = (): readonly GridTileEntry[] => snapshot;

export const useGridTiles = (): readonly GridTileEntry[] =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
