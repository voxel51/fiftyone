import { atom, useAtomValue, useSetAtom, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { registeredTilesAtom, tileScopedKey, tileSelectionAtom } from "./atoms";
import { useTileId, useTileScopeId, useTiling } from "./TilingProvider";
import type { RegisteredTile, SetTileTitleOptions, TilingTile } from "./types";

// Stable placeholder for use outside a TileIdScope; writes no-op.
const NO_TILE = "__no-tile__";

/** Transient emphasis for one tile's header title. Keyed by scope+tile
 *  for the same reason `tileSelectionAtom` is — see `atoms.ts`. */
const tileTitleHighlightedAtom = atomFamily((_scopedKey: string) =>
  atom(false),
);

/** Scoped key for the surrounding tile, or the no-op placeholder. */
function useScopedTileKey(tileId: string | null): string {
  return tileScopedKey(useTileScopeId(), tileId ?? NO_TILE);
}

/**
 * A tile body's extra header content (e.g. an Audio tile's mute button).
 * `MosaicGrid` renders the header and the tile body as two independent
 * trees with no JSX channel between them, so a tile body publishes here
 * and the header reads it back by tile id — mirrors `tileTitleHighlightedAtom`.
 * `null` (the default) means "no extra content"; every non-audio tile
 * simply never calls the setter, so this never affects them.
 */
// `atom<ReactNode>(null)` would resolve to `PrimitiveAtom<ReactNode>` in
// theory, but jotai's overloads narrow it to a read-only `Atom<ReactNode>`
// because the bare `null` initial value matches the read-fn overload
// first (same quirk documented in @fiftyone/playback's atoms.ts). The
// cast preserves the writable shape so `useSetAtom` type-checks.
const tileHeaderExtraAtom = atomFamily(
  (_tileId: string) => atom<ReactNode>(null) as PrimitiveAtom<ReactNode>,
);

export function useTileSelection<T = unknown>(): T | null {
  const key = useScopedTileKey(useTileId());
  return useAtomValue(tileSelectionAtom(key)) as T | null;
}

export function useSetTileSelection(): (selection: unknown) => void {
  const tileId = useTileId();
  const set = useSetAtom(tileSelectionAtom(useScopedTileKey(tileId)));
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
  return useAtomValue(tileSelectionAtom(useScopedTileKey(tileId))) as T | null;
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
  return useAtomValue(tileTitleHighlightedAtom(useScopedTileKey(useTileId())));
}

/** Sets transient cross-panel emphasis on the surrounding tile's title. */
export function useSetTileTitleHighlighted(): (highlighted: boolean) => void {
  const tileId = useTileId();
  const setHighlighted = useSetAtom(
    tileTitleHighlightedAtom(useScopedTileKey(tileId)),
  );
  return useCallback(
    (highlighted: boolean) => {
      if (!tileId) return;
      setHighlighted(highlighted);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tileId],
  );
}

/** The surrounding tile's extra header content, or `null` if none was published. */
export function useTileHeaderExtra(): ReactNode {
  const tileId = useTileId();
  return useAtomValue(tileHeaderExtraAtom(tileId ?? NO_TILE));
}

/** Reads a specific tile's extra header content by id — used by `MosaicGrid`. */
export function useTileHeaderExtraFor(tileId: string | null): ReactNode {
  return useAtomValue(tileHeaderExtraAtom(tileId ?? NO_TILE));
}

/**
 * Publishes extra content the surrounding tile's header should render
 * (e.g. a mute button). Call from a `useEffect` and reset to `null` on
 * cleanup so the header reverts when the tile unmounts or stops needing it.
 */
export function useSetTileHeaderExtra(): (node: ReactNode) => void {
  const tileId = useTileId();
  const setExtra = useSetAtom(tileHeaderExtraAtom(tileId ?? NO_TILE));
  return useCallback(
    (node: ReactNode) => {
      if (!tileId) return;
      setExtra(node);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tileId],
  );
}

export function useTileTypes(): RegisteredTile[] {
  return useAtomValue(registeredTilesAtom(useTileScopeId()));
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
