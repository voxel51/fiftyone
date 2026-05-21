import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { registeredTilesAtom, tileSelectionAtom } from "./atoms";
import { useTileId } from "./TilingProvider";
import type { RegisteredTile } from "./types";

// Stable placeholder so atomFamily doesn't churn when a component is
// mounted outside a TileIdScope. The placeholder atom stays null and
// writes against it are silently no-ops.
const NO_TILE = "__no-tile__";

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
  const set = useSetAtom(tileSelectionAtom(tileId ?? NO_TILE));
  return useCallback(
    (selection: unknown) => {
      if (!tileId) return;
      set(selection);
    },
    // `set` is a Jotai setter (referentially stable from useSetAtom).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tileId]
  );
}

/**
 * Read the selection payload for an explicit `tileId` — used by surfaces
 * that aren't inside a `TileIdScope` but know which tile to inspect
 * (e.g. the global inspector sidebar reading the focused tile's data).
 * Pass `null` when no tile is focused.
 */
export function useTileSelectionFor<T = unknown>(
  tileId: string | null
): T | null {
  return useAtomValue(tileSelectionAtom(tileId ?? NO_TILE)) as T | null;
}

/**
 * Every registered tile kind, in registration order. One entry per
 * `type` since the registry is keyed by type. Used by the "Add tile"
 * menu.
 */
export function useTileTypes(): RegisteredTile[] {
  return useAtomValue(registeredTilesAtom);
}
