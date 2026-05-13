import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useTileId } from "../TilingProvider";
import {
  registeredTilesAtom,
  tileSelectionAtom,
  tileSourceAtom,
  type RegisteredTile,
} from "./atoms";

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
 * Distinct tile kinds among the currently-registered streams, in
 * registration order. Each entry exposes the first registered stream's
 * tile metadata as the kind's exemplar (used for the icon + kind
 * label).
 */
export function useTileKinds(): RegisteredTile[] {
  const tiles = useAtomValue(registeredTilesAtom);
  return useMemo(() => {
    const seen = new Map<string, RegisteredTile>();
    for (const entry of tiles) {
      if (!seen.has(entry.tile.kind)) seen.set(entry.tile.kind, entry);
    }
    return Array.from(seen.values());
  }, [tiles]);
}

/**
 * Registered streams whose tile metadata matches the given kind. Used
 * by settings source pickers ("which camera feed to bind this Camera
 * tile to").
 */
export function useStreamsByKind(kind: string): RegisteredTile[] {
  const tiles = useAtomValue(registeredTilesAtom);
  return useMemo(
    () => tiles.filter((t) => t.tile.kind === kind),
    [tiles, kind]
  );
}
