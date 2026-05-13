import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import {
  registeredTilesAtom,
  tileSelectionAtom,
  tileSourceAtom,
} from "./atoms";
import { useTileId } from "./TilingProvider";
import type { RegisteredTile } from "./types";

// We need a stable placeholder key so atomFamily doesn't create a new
// atom on every render when the surrounding tile id is null (the
// component is mounted outside a TileIdScope). The placeholder atom
// stays null and writes against it are no-ops.
const NO_TILE = "__no-tile__";

/**
 * Read the current tile's bound source stream id. Reads `useTileId()`
 * internally, so call only inside a `TileIdScope`. Returns `null` when
 * the tile has no bound source (placeholder mode).
 */
export function useTileSource(): string | null {
  const tileId = useTileId();
  return useAtomValue(tileSourceAtom(tileId ?? NO_TILE));
}

/**
 * Setter for the current tile's bound source stream id. Returned
 * function is stable.
 */
export function useSetTileSource(): (sourceId: string | null) => void {
  const tileId = useTileId();
  return useSetAtom(tileSourceAtom(tileId ?? NO_TILE));
}

/**
 * Read the current tile's selection payload. Inspector / setting
 * surfaces use this to render details about whatever the user picked
 * inside the tile.
 */
export function useTileSelection<T = unknown>(): T | null {
  const tileId = useTileId();
  return useAtomValue(tileSelectionAtom(tileId ?? NO_TILE)) as T | null;
}

/**
 * Setter for the current tile's selection payload. Tile bodies call
 * this when the user clicks something inspectable.
 */
export function useSetTileSelection(): (selection: unknown) => void {
  const tileId = useTileId();
  return useSetAtom(tileSelectionAtom(tileId ?? NO_TILE));
}

/**
 * Distinct tile types among the currently-registered tiles, in
 * registration order. Each entry exposes the first registered source
 * as the type's exemplar (used for the icon + type label in
 * TilingHeader's add-tile menu).
 */
export function useTileTypes(): RegisteredTile[] {
  const tiles = useAtomValue(registeredTilesAtom);
  return useMemo(() => {
    const seen = new Map<string, RegisteredTile>();
    for (const entry of tiles) {
      if (!seen.has(entry.type)) seen.set(entry.type, entry);
    }
    return Array.from(seen.values());
  }, [tiles]);
}

/**
 * Registered tile sources matching the given `type`. Used by settings
 * source pickers ("which camera feed should this Camera tile show").
 */
export function useTileSourcesByType(type: string): RegisteredTile[] {
  const tiles = useAtomValue(registeredTilesAtom);
  return useMemo(() => tiles.filter((t) => t.type === type), [tiles, type]);
}
