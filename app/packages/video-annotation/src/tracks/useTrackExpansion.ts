/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useMemo, useState } from "react";

/** Which parent tracks have their sub-track rows expanded. */
export interface TrackExpansion {
  expandedIds: ReadonlySet<string>;
  isExpanded: (parentId: string) => boolean;
  toggle: (parentId: string) => void;
}

/**
 * Local expand/collapse state for tracks with collapsible sub-tracks. Default
 * collapsed — a parent's children render only after the user expands it.
 */
export const useTrackExpansion = (): TrackExpansion => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((parentId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }

      return next;
    });
  }, []);

  const isExpanded = useCallback(
    (parentId: string) => expandedIds.has(parentId),
    [expandedIds],
  );

  // Memoized: consumers key work off this object's identity (the timeline's
  // row-decoration cache reaches it through `decorateTrack`'s dependency
  // list), so returning a fresh object every render invalidated that cache on
  // every render and made the row memoization useless.
  return useMemo(
    () => ({ expandedIds, isExpanded, toggle }),
    [expandedIds, isExpanded, toggle],
  );
};
