/**
 * Generic registry for things that render on top of grid sample tiles.
 *
 * A "tile decorator" is anything that wants per-sample DOM/UI on the
 * grid — status badges, comments-count chips, quality-score halos,
 * reviewer initials, etc. Decorators are plain React components that
 * accept a `sample` prop and return a `ReactNode` (or `null` to skip
 * for this sample); they render inside an absolute-positioned overlay
 * div the grid renderer reserves on each tile.
 *
 * Decorators self-register at module load via `registerTileDecorator`.
 * `useTileDecorators` reads the current set with React-18-safe
 * snapshotting so newly-registered decorators show up immediately.
 *
 * Forward path: once `@fiftyone/plugins` grows a
 * `PluginComponentType.GridTileDecorator`, this registry collapses to
 * a thin adapter — same `TileDecorator` shape, same `(sample) =>
 * ReactNode` contract, just sourced from `useActivePlugins(...)`. The
 * lone migration step is moving each `registerTileDecorator(...)`
 * call to `registerComponent({ type: GridTileDecorator, ... })`; no
 * decorator implementation has to change.
 */

import { useSyncExternalStore } from "react";

export interface TileDecoratorSample {
  /** Mongo `_id`. Present on default-looker samples. */
  _id?: string;
  /** Sample `id` (synonym for `_id` on most paths). */
  id?: string;
  /** Filepath when the decorator needs it for media-aware decisions. */
  filepath?: string;
  // Intentionally loose so decorators can pull any field without us
  // chasing the sample type through every grid call-site.
  [key: string]: unknown;
}

export interface TileDecorator {
  /**
   * Stable identifier. Re-registering with the same id replaces the
   * prior entry (hot-reload + module-eval-twice friendly).
   */
  id: string;
  /**
   * Higher renders on top. Default 0. Use sparingly — the overlay
   * div has `pointer-events: none`, so most decorators won't need to
   * compete for click handling.
   */
  priority?: number;
  /**
   * Called once per visible tile per decorator-set change. Return
   * `null`/`undefined` for samples the decorator doesn't care about
   * (e.g. status badge returns null when not in task mode).
   *
   * Runs inside the parent app's React tree (RecoilBridge wired by
   * the grid renderer), so decorators can freely use Recoil / Jotai
   * hooks.
   */
  render: (sample: TileDecoratorSample) => React.ReactNode;
}

// Module-local registry. Mutable for ergonomics — wrapped behind the
// external-store snapshot API so React updates stay sound.
const registry: TileDecorator[] = [];
const listeners = new Set<() => void>();

const notify = () => {
  for (const l of listeners) l();
};

const sortByPriority = () => {
  registry.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
};

/**
 * Register a tile decorator. Idempotent on `id`: re-registering with
 * the same id replaces the prior entry, which keeps Vite hot-reload
 * and accidental double-registration well-behaved.
 */
export const registerTileDecorator = (decorator: TileDecorator): void => {
  const existing = registry.findIndex((d) => d.id === decorator.id);
  if (existing >= 0) {
    registry[existing] = decorator;
  } else {
    registry.push(decorator);
  }
  sortByPriority();
  notify();
};

/** Unregister — mostly for tests. */
export const unregisterTileDecorator = (id: string): void => {
  const idx = registry.findIndex((d) => d.id === id);
  if (idx < 0) return;
  registry.splice(idx, 1);
  notify();
};

// External-store wiring for `useSyncExternalStore`.
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Returning the same array reference when nothing changed keeps
// downstream `useMemo` / `React.memo` happy. We bump a snapshot
// version on every change and freeze the snapshot so consumers can't
// mutate it.
let snapshot: readonly TileDecorator[] = Object.freeze([...registry]);
const refreshSnapshot = () => {
  snapshot = Object.freeze([...registry]);
};
// Refresh whenever notify fires.
listeners.add(refreshSnapshot);

const getSnapshot = (): readonly TileDecorator[] => snapshot;

/**
 * Current set of registered tile decorators, sorted by priority asc.
 * Re-renders the caller when decorators register / unregister.
 */
export const useTileDecorators = (): readonly TileDecorator[] =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
