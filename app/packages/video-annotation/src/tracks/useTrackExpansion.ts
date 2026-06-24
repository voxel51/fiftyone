/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useState } from "react";

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
    [expandedIds]
  );

  return { expandedIds, isExpanded, toggle };
};
