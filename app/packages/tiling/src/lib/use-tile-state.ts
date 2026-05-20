import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useMemo } from "react";
import {
  registeredTilesAtom,
  tileSelectionAtom,
  tileSourceAtom,
  tileTitleAtom,
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
  const set = useSetAtom(tileSourceAtom(tileId ?? NO_TILE));
  return useCallback(
    (sourceId: string | null) => {
      // Out-of-scope writes are real no-ops — don't touch the NO_TILE
      // placeholder atom (state could otherwise survive across mounts).
      if (!tileId) return;
      set(sourceId);
    },
    // `set` is a Jotai setter (referentially stable from useSetAtom).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tileId]
  );
}

/**
 * Imperative setter for the source of an explicit tile id — used by
 * surfaces that bind a tile that doesn't yet exist at hook call time
 * (e.g. TilingHeader's "Add tile" menu defaulting a freshly-spawned
 * tile to the first registered source of its type).
 */
export function useSetTileSourceFor(): (
  tileId: string,
  sourceId: string | null
) => void {
  const store = useStore();
  return useCallback(
    (tileId, sourceId) => store.set(tileSourceAtom(tileId), sourceId),
    [store]
  );
}

/**
 * Read the current tile's title override. Returns `null` when no override
 * has been set — callers should fall back to the static config title.
 */
export function useTileTitle(): string | null {
  const tileId = useTileId();
  return useAtomValue(tileTitleAtom(tileId ?? NO_TILE));
}

/**
 * Read the title override for an explicit `tileId` — used by surfaces
 * that aren't inside a `TileIdScope` but know which tile to inspect
 * (e.g. `TileSettingsSidebar` reading the focused tile's override title).
 * Pass `null` when no tile is focused.
 */
export function useTileTitleFor(tileId: string | null): string | null {
  return useAtomValue(tileTitleAtom(tileId ?? NO_TILE));
}

/**
 * Setter for the current tile's title override. Pass `null` to revert to
 * the static config title.
 */
export function useSetTileTitle(): (title: string | null) => void {
  const tileId = useTileId();
  const set = useSetAtom(tileTitleAtom(tileId ?? NO_TILE));
  return useCallback(
    (title: string | null) => {
      if (!tileId) return;
      set(title);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tileId]
  );
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
  const set = useSetAtom(tileSelectionAtom(tileId ?? NO_TILE));
  return useCallback(
    (selection: unknown) => {
      if (!tileId) return;
      set(selection);
    },
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
