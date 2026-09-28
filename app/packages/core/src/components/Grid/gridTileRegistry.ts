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

const TILE_HIGHLIGHT_ATTR = "data-fo-tile-highlight";
const TILE_SELECTION_HOVER_ATTR = "data-fo-selection-hover";

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
  entry.overlayEl.parentElement?.setAttribute(
    TILE_SELECTION_HOVER_ATTR,
    String(selectionHoveredTile === entry.id),
  );
  notify();
};

/** Remove a tile (called from `useRenderer.detachItem`). */
export const unregisterTile = (id: string): void => {
  const entry = tiles.get(id);
  if (!entry) return;
  if (hoveredTile === id) setHoveredTile(null);
  // Spotlight may hand this element to another sample next; never let a
  // highlight meant for this one follow it there.
  entry.overlayEl.parentElement?.removeAttribute(TILE_HIGHLIGHT_ATTR);
  entry.overlayEl.parentElement?.removeAttribute(TILE_SELECTION_HOVER_ATTR);
  tiles.delete(id);
  notify();
};

/**
 * Marks the visible tile for a sample as the counterpart of something the
 * user is pointing at elsewhere (a selection tray card). The grid stylesheet
 * turns the attribute into a nudge of the media and a wink of its checkbox.
 */
export const setTileHighlight = (id: string, on: boolean): void => {
  const tile = tiles.get(id)?.overlayEl.parentElement;
  if (!tile) return;
  if (on) tile.setAttribute(TILE_HIGHLIGHT_ATTR, "");
  else tile.removeAttribute(TILE_HIGHLIGHT_ATTR);
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

/** The tile a sample's element belongs to, or null for anything else. */
export const tileIdAt = (target: EventTarget | null): string | null => {
  if (!(target instanceof Node)) return null;
  for (const [id, entry] of tiles)
    if (entry.overlayEl.parentElement?.contains(target)) return id;
  return null;
};

/** Selection controls appear while the pointer is in the tile's top 40%. */
export const isPointerInTileSelectionRegion = (
  id: string | null,
  clientY: number,
): boolean => {
  const tile = id ? tiles.get(id)?.overlayEl.parentElement : null;
  if (!tile) return false;
  const { top, height } = tile.getBoundingClientRect();
  return height > 0 && clientY >= top && clientY <= top + height * 0.4;
};

// The tile under the pointer, published so a selection tray card can answer
// a grid hover the way the grid answers a card hover.
let hoveredTile: string | null = null;
let selectionHoveredTile: string | null = null;
const hoverListeners = new Set<() => void>();

/** Publishes tile hover separately from the selection controls' hover region. */
export const setHoveredTile = (
  id: string | null,
  selectionHovered = false,
): void => {
  const selectionId = selectionHovered ? id : null;
  if (hoveredTile === id && selectionHoveredTile === selectionId) return;
  if (selectionHoveredTile !== selectionId) {
    if (selectionHoveredTile) {
      tiles
        .get(selectionHoveredTile)
        ?.overlayEl.parentElement?.setAttribute(
          TILE_SELECTION_HOVER_ATTR,
          "false",
        );
    }
    if (selectionId) {
      tiles
        .get(selectionId)
        ?.overlayEl.parentElement?.setAttribute(
          TILE_SELECTION_HOVER_ATTR,
          "true",
        );
    }
    selectionHoveredTile = selectionId;
  }
  hoveredTile = id;
  for (const listener of hoverListeners) listener();
};

const subscribeHover = (listener: () => void): (() => void) => {
  hoverListeners.add(listener);
  return () => hoverListeners.delete(listener);
};

const getHoveredTile = () => hoveredTile;

/** Reads the grid tile whose selection card should mirror its hover. */
export const useHoveredTile = (): string | null =>
  useSyncExternalStore(subscribeHover, getHoveredTile, getHoveredTile);

/** Whether the pointer is in this tile's selection controls' hover region. */
export const useIsTileSelectionHovered = (id: string): boolean =>
  useSyncExternalStore(
    subscribeHover,
    () => selectionHoveredTile === id,
    () => false,
  );
