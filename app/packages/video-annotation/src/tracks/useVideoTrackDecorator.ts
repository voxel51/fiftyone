/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Track } from "@fiftyone/playback";
import clsx from "clsx";
import { useCallback } from "react";
import { useVideoInteraction } from "../state/useVideoInteraction";
import styles from "../components/VideoAnnotationSurface.module.css";

/** TD rows carry sample-level identity; they don't link through this seam. */
const TEMPORAL_DETECTION_PREFIX = "td-";

type TrackDecoration = Partial<{
  className: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTrackClick: () => void;
}>;

/**
 * Decorate timeline rows from engine interaction: an object track's row id IS
 * its `instanceId`, so it lights up (`linkHovered` / `linkSelected`) when its
 * track is hovered / selected, and the row's own hover / click writes that
 * interaction back through the engine — which the canvas Lighter bridge applies
 * to the overlay. The row's visual hover is plain CSS `:hover`; only the
 * cross-component direction needs the engine.
 *
 * TD rows (sample-level, `td-` prefix) are inert here — their selection / edit
 * wiring is layered on by the caller; routing them through the object-track
 * instanceId seam would write a bogus ref.
 */
export const useVideoTrackDecorator = (): ((
  track: Track
) => TrackDecoration) => {
  const { selectedTrackIds, hoveredTrackIds, selectTrack, hoverTrack } =
    useVideoInteraction();

  return useCallback(
    (track: Track) => {
      if (track.id.startsWith(TEMPORAL_DETECTION_PREFIX)) {
        return {};
      }

      return {
        className: clsx({
          [styles.linkHovered]: hoveredTrackIds.has(track.id),
          [styles.linkSelected]: selectedTrackIds.has(track.id),
        }),
        onMouseEnter: () => hoverTrack(track.id, true),
        onMouseLeave: () => hoverTrack(track.id, false),
        onTrackClick: () => selectTrack(track.id),
      };
    },
    [hoveredTrackIds, selectedTrackIds, hoverTrack, selectTrack]
  );
};
