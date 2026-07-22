import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback } from "react";

/**
 * Inspected stream per raw-message tile (tile id → stream). Lives in the
 * tiling shell's per-instance Jotai store, so state is scoped to one
 * modal and vanishes with it; layout persistence snapshots it per
 * dataset.
 */
export type EpisodeRawTileStreams = Readonly<Record<string, string>>;

/** Modal-local stream binding for each raw-message tile. */
export const episodeRawTileStreamAtom = atom<EpisodeRawTileStreams>({});

/** Subscribe to the surrounding raw-message tile's inspected stream. */
export function useEpisodeRawTileStream(): string | null {
  const tileId = useTileId();
  const byTile = useAtomValue(episodeRawTileStreamAtom);
  return tileId ? (byTile[tileId] ?? null) : null;
}

/** Set (or clear, with null) the surrounding raw tile's stream. */
export function useSetEpisodeRawTileStream(): (stream: string | null) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (stream) => {
      if (!tileId) {
        return;
      }
      store.set(episodeRawTileStreamAtom, (previous) => {
        if ((previous[tileId] ?? null) === stream) {
          return previous;
        }
        if (stream === null) {
          const { [tileId]: _removed, ...rest } = previous;
          return rest;
        }
        return { ...previous, [tileId]: stream };
      });
    },
    [store, tileId],
  );
}
