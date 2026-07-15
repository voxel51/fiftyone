/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Track } from "@fiftyone/playback";
import clsx from "clsx";
import { useCallback } from "react";
import { useVideoInteraction } from "../state/useVideoInteraction";
import { objectTrackPathOf } from "./frameTracks";
import { temporalDetectionRefOf } from "./temporalDetectionTracks";
import styles from "../components/VideoAnnotationSurface.module.css";

type TrackDecoration = Partial<{
  className: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTrackClick: () => void;
}>;

/**
 * Decorate timeline rows from engine interaction so a row lights up
 * (`linkHovered` / `linkSelected`) when its label is hovered / selected on any
 * surface, and the row's own hover / click writes that interaction back through
 * the engine — which the canvas Lighter bridge applies to the overlay. The
 * row's visual hover is plain CSS `:hover`; only the cross-component direction
 * needs the engine.
 *
 * Two row kinds, both engine-addressed:
 *  - an OBJECT track's row id IS its `instanceId` (a frame-detection track), so
 *    it links on `track.id` at the current playhead frame;
 *  - a TEMPORAL-DETECTION row is sample-level — identified by its structured
 *    event payload (not the row-id shape) — so it links on the TD's `_id`
 *    (`instanceId`) at its own field path, frame-less.
 *
 * Both read the same engine interaction sets (keyed by `instanceId`), so the TD
 * `_id` matches the canvas overlay and sidebar row.
 */
export const useVideoTrackDecorator = (): ((
  track: Track,
) => TrackDecoration) => {
  const {
    selectedTrackIds,
    hoveredTrackIds,
    selectTrack,
    hoverTrack,
    selectLabel,
    hoverLabel,
  } = useVideoInteraction();

  return useCallback(
    (track: Track) => {
      const tdRef = temporalDetectionRefOf(track);

      if (tdRef) {
        return {
          className: clsx({
            [styles.linkHovered]: hoveredTrackIds.has(tdRef.instanceId),
            [styles.linkSelected]: selectedTrackIds.has(tdRef.instanceId),
          }),
          onMouseEnter: () => hoverLabel(tdRef, true),
          onMouseLeave: () => hoverLabel(tdRef, false),
          onTrackClick: () => selectLabel(tdRef),
        };
      }

      // An object row addresses `(path, instanceId)` — the path is the field
      // the track lives on (detections / polylines), carried on its events.
      const path = objectTrackPathOf(track);

      return {
        className: clsx({
          [styles.linkHovered]: hoveredTrackIds.has(track.id),
          [styles.linkSelected]: selectedTrackIds.has(track.id),
        }),
        onMouseEnter: () => path && hoverTrack(track.id, path, true),
        onMouseLeave: () => path && hoverTrack(track.id, path, false),
        onTrackClick: () => path && selectTrack(track.id, path),
      };
    },
    [
      hoveredTrackIds,
      selectedTrackIds,
      hoverTrack,
      selectTrack,
      hoverLabel,
      selectLabel,
    ],
  );
};
