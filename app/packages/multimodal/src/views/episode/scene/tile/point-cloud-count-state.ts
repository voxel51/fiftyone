import { useTileId } from "@fiftyone/tiling";
import { atom, createStore, useAtomValue, useStore } from "jotai";
import { useCallback, useEffect, useMemo } from "react";

type PointCloudCountsByTile = Readonly<
  Record<string, ReadonlyMap<string, number>>
>;

/** Live decoded point counts keyed by 3D tile and point-cloud source. */
const pointCloudCountsAtom = atom<PointCloudCountsByTile>({});

/** Publishes the complete point-count snapshot for one 3D tile. */
export function publishPointCloudCounts(
  store: ReturnType<typeof createStore>,
  tileId: string,
  pointCounts: ReadonlyMap<string, number>,
): void {
  store.set(pointCloudCountsAtom, (previous) => {
    const current = previous[tileId];
    if (!current && pointCounts.size === 0) return previous;
    if (current && pointCountMapsEqual(current, pointCounts)) return previous;

    if (pointCounts.size === 0) {
      const next = { ...previous };
      delete next[tileId];
      return next;
    }

    return { ...previous, [tileId]: new Map(pointCounts) };
  });
}

/** Publishes live point counts for the surrounding 3D tile. */
export function usePublishPointCloudCounts(): (
  pointCounts: ReadonlyMap<string, number>,
) => void {
  const tileId = useTileId();
  const store = useStore();

  useEffect(() => {
    if (!tileId) return undefined;
    return () => publishPointCloudCounts(store, tileId, new Map());
  }, [store, tileId]);

  return useCallback(
    (pointCounts) => {
      if (tileId) publishPointCloudCounts(store, tileId, pointCounts);
    },
    [store, tileId],
  );
}

/** Subscribes to one source's live point count in the surrounding 3D tile. */
export function usePointCloudCount(sourceId: string): number | undefined {
  const tileId = useTileId();
  const pointCountAtom = useMemo(
    () =>
      atom((get) =>
        tileId ? get(pointCloudCountsAtom)[tileId]?.get(sourceId) : undefined,
      ),
    [sourceId, tileId],
  );
  return useAtomValue(pointCountAtom);
}

function pointCountMapsEqual(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [sourceId, pointCount] of left) {
    if (right.get(sourceId) !== pointCount) return false;
  }
  return true;
}
