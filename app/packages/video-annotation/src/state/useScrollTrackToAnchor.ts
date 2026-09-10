/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEngine, useInteraction } from "@fiftyone/annotation";
import type { TimelineTracksScroller } from "@fiftyone/playback";
import type React from "react";
import { useEffect, useRef } from "react";

/**
 * Bring the anchored track's row into view when selection moves. Goes through
 * {@link TimelineTracksScroller} because the virtualized drawer has no DOM node
 * for an off-screen row.
 */
export const useScrollTrackToAnchor = (
  scroller: React.RefObject<TimelineTracksScroller | null>,
): void => {
  const engine = useAnnotationEngine();
  const anchorId = useInteraction(
    engine,
    (i) => i.getAnchor()?.instanceId ?? null,
  );
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!anchorId || anchorId === previous.current) {
      previous.current = anchorId;
      return;
    }

    previous.current = anchorId;

    // Defer to the next frame so any layout shift from the selection settles
    // before scrolling.
    requestAnimationFrame(() => {
      scroller.current?.scrollToTrack(anchorId);
    });
  }, [anchorId, scroller]);
};
