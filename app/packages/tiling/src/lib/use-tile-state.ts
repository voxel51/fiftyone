import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { registeredTilesAtom, tileSelectionAtom } from "./atoms";
import { useTileId, useTiling } from "./TilingProvider";
import type { RegisteredTile } from "./types";

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

export function useSetTileTitle(): (title: string) => void {
  const tileId = useTileId();
  const { setTileTitle } = useTiling();
  return useCallback(
    (title: string) => {
      if (!tileId) return;
      setTileTitle(tileId, title);
    },
    [tileId, setTileTitle],
  );
}

export function useTileTypes(): RegisteredTile[] {
  return useAtomValue(registeredTilesAtom);
}
