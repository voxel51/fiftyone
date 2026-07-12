import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
  registeredTilesAtom,
  tileSelectionAtom,
  tileTitleHighlightedAtom,
} from "./atoms";
import { useTileId, useTiling } from "./TilingProvider";
import type { RegisteredTile, SetTileTitleOptions, TilingTile } from "./types";

// Stable placeholder for use outside a TileIdScope; writes no-op.
const NO_TILE = "__no-tile__";

export function useTileSelection<T = unknown>(): T | null {
  const tileId = useTileId();
  return useAtomValue(tileSelectionAtom(tileId ?? NO_TILE)) as T | null;
}

export function useSetTileSelection(): (selection: unknown) => void {
  const tileId = useTileId();
  const set = useSetAtom(tileSelectionAtom(tileId ?? NO_TILE));
  return useCallback(
    (selection: unknown) => {
      if (!tileId) return;
      set(selection);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tileId],
  );
}

export function useTileSelectionFor<T = unknown>(
  tileId: string | null,
): T | null {
  return useAtomValue(tileSelectionAtom(tileId ?? NO_TILE)) as T | null;
}

export function useTileTitle(): string | null {
  const tileId = useTileId();
  const { tiles } = useTiling();
  return tileId ? (tiles[tileId]?.title ?? null) : null;
}

export function useTileTitleFor(tileId: string | null): string | null {
  const { tiles } = useTiling();
  return tileId ? (tiles[tileId]?.title ?? null) : null;
}

export function useSetTileTitle(): (
  title: string,
  options?: SetTileTitleOptions,
) => void {
  const tileId = useTileId();
  const { setTileTitle } = useTiling();
  return useCallback(
    (title: string, options?: SetTileTitleOptions) => {
      if (!tileId) return;
      setTileTitle(tileId, title, options);
    },
    [tileId, setTileTitle],
  );
}

/** Whether the surrounding tile's title has transient cross-panel emphasis. */
export function useTileTitleHighlighted(): boolean {
  const tileId = useTileId();
  return useAtomValue(tileTitleHighlightedAtom(tileId ?? NO_TILE));
}

/** Sets transient cross-panel emphasis on the surrounding tile's title. */
export function useSetTileTitleHighlighted(): (highlighted: boolean) => void {
  const tileId = useTileId();
  const setHighlighted = useSetAtom(
    tileTitleHighlightedAtom(tileId ?? NO_TILE),
  );
  return useCallback(
    (highlighted: boolean) => {
      if (!tileId) return;
      setHighlighted(highlighted);
    },
    [setHighlighted, tileId],
  );
}

export function useTileTypes(): RegisteredTile[] {
  return useAtomValue(registeredTilesAtom);
}

/**
 * Register how to clone the surrounding tile. The factory should
 * capture the tile's *current* state (e.g. its bound source) so
 * "Duplicate" produces an exact copy, not a fresh default instance.
 * Call it on every render with a plain closure — the latest one is
 * used when the duplicate happens.
 */
export function useTileDuplicator(factory: () => TilingTile): void {
  const tileId = useTileId();
  const { registerTileDuplicator } = useTiling();
  // Latest-closure ref so the registration below survives re-renders
  // without re-registering, while duplicates still see current state.
  const factoryRef = useRef(factory);
  factoryRef.current = factory;
  // This effect registers the duplicate factory with the provider for
  // the lifetime of the tile.
  useEffect(() => {
    if (!tileId) return undefined;
    return registerTileDuplicator(tileId, () => factoryRef.current());
  }, [tileId, registerTileDuplicator]);
}
