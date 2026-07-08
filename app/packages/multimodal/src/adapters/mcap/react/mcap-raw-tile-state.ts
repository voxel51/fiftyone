import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback } from "react";

/**
 * Inspected topic per raw-message tile (tile id → topic). Lives in the
 * tiling shell's per-instance Jotai store, so state is scoped to one
 * modal and vanishes with it; layout persistence snapshots it per
 * dataset.
 */
export const mcapRawTileTopicAtom = atom<Readonly<Record<string, string>>>({});

/** Subscribe to the surrounding raw-message tile's inspected topic. */
export function useMcapRawTileTopic(): string | null {
  const tileId = useTileId();
  const byTile = useAtomValue(mcapRawTileTopicAtom);
  return tileId ? (byTile[tileId] ?? null) : null;
}

/** Set (or clear, with null) the surrounding raw tile's topic. */
export function useSetMcapRawTileTopic(): (topic: string | null) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (topic) => {
      if (!tileId) {
        return;
      }
      store.set(mcapRawTileTopicAtom, (previous) => {
        if ((previous[tileId] ?? null) === topic) {
          return previous;
        }
        if (topic === null) {
          const { [tileId]: _removed, ...rest } = previous;
          return rest;
        }
        return { ...previous, [tileId]: topic };
      });
    },
    [store, tileId],
  );
}
