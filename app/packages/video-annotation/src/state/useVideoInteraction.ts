/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  type ScopedRef,
  useActiveSampleId,
  useAnnotationEngine,
  useSurfaceActions,
} from "@fiftyone/annotation";
import { useCallback } from "react";
import { useCurrentFrameGetter } from "./useCurrentFrame";
import { useHoveredTrackIds, useSelectedTrackIds } from "./useVideoSelection";

const SURFACE = "video-timeline";

/**
 * The timeline's seam onto engine interaction. A row is a whole track, so
 * reads link on `instanceId` across occurrences while writes address the
 * occurrence at the playhead frame.
 */
export interface VideoInteraction {
  /** Track ids (= engine instanceIds) currently selected. */
  selectedTrackIds: ReadonlySet<string>;
  /** Track ids (= engine instanceIds) currently hovered. */
  hoveredTrackIds: ReadonlySet<string>;
  /**
   * Replace the selection with this track's current-frame occurrence on the
   * given frame field path (tracks span multiple fields, so the path is
   * explicit — not assumed to be the detections field).
   */
  selectTrack: (instanceId: string, path: string) => void;
  /** Set hover on this track's current-frame occurrence on the given path. */
  hoverTrack: (instanceId: string, path: string, on: boolean) => void;
  /**
   * Select / hover a label by its exact engine ref. Used for sample-level
   * labels (temporal detections: addressed by `instanceId`, no frame) whose
   * path differs from the frame-detection field, so they can't go through the
   * `instanceId`-only track seam above.
   */
  selectLabel: (ref: ScopedRef) => void;
  hoverLabel: (ref: ScopedRef, on: boolean) => void;
}

/** The full select / hover seam for timeline rows. */
export const useVideoInteraction = (): VideoInteraction => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const actions = useSurfaceActions(engine, SURFACE, sampleId);
  const getFrame = useCurrentFrameGetter();

  const selectedTrackIds = useSelectedTrackIds();
  const hoveredTrackIds = useHoveredTrackIds();

  const selectTrack = useCallback(
    (instanceId: string, path: string) => {
      actions.setActive([{ path, instanceId, frame: getFrame() }]);
    },
    [actions, getFrame],
  );

  const hoverTrack = useCallback(
    (instanceId: string, path: string, on: boolean) => {
      actions.setHovered({ path, instanceId, frame: getFrame() }, on);
    },
    [actions, getFrame],
  );

  const selectLabel = useCallback(
    (ref: ScopedRef) => actions.setActive([ref]),
    [actions],
  );

  const hoverLabel = useCallback(
    (ref: ScopedRef, on: boolean) => actions.setHovered(ref, on),
    [actions],
  );

  return {
    selectedTrackIds,
    hoveredTrackIds,
    selectTrack,
    hoverTrack,
    selectLabel,
    hoverLabel,
  };
};
