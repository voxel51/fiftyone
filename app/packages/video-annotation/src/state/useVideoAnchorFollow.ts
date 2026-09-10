/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEngine, useInteraction } from "@fiftyone/annotation";
import type { TimelineTracksScroller } from "@fiftyone/playback";
import type React from "react";
import { useEffect, useRef } from "react";
import { useCurrentFrame } from "./useCurrentFrame";

/**
 * Re-stamp a frame-label anchor to the same track at the new playhead frame,
 * so the form follows the instance across frames. A gap or a sample-level
 * anchor leaves the anchor alone.
 */
export const useFollowAnchorFrame = (): void => {
  const engine = useAnnotationEngine();
  const frame = useCurrentFrame();

  useEffect(() => {
    const anchor = engine.interaction.getAnchor();

    if (!anchor || anchor.frame == null || anchor.frame === frame) {
      return;
    }

    const next = { ...anchor, frame };

    // track absent on this frame — keep editing the current occurrence
    if (!engine.getLabel(next)) {
      return;
    }

    engine.interaction.setActive([next]);
  }, [engine, frame]);
};

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
