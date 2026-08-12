/** Playback-driven point counts published by a 3D tile to its settings UI. */
export interface PointCloudCountStore {
  readonly getPointCount: (sourceId: string) => number | undefined;
  readonly publish: (pointCounts: ReadonlyMap<string, number>) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * Small external store for playback-driven point counts. Keeping this outside
 * the tile-settings registration lets only the count labels update per frame;
 * the rest of the sidebar remains stable while playback advances.
 */
export function createPointCloudCountStore(): PointCloudCountStore {
  let pointCounts: ReadonlyMap<string, number> = new Map();
  const listeners = new Set<() => void>();

  return {
    getPointCount: (sourceId) => pointCounts.get(sourceId),
    publish: (nextPointCounts) => {
      if (pointCountMapsEqual(pointCounts, nextPointCounts)) return;
      pointCounts = new Map(nextPointCounts);
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
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
