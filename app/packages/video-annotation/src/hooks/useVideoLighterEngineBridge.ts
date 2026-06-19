/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useActiveSampleId,
  useAnnotationEngine,
  useLighterEngineBridge,
} from "@fiftyone/annotation";
import { useTimeline } from "@fiftyone/playback";
import { useCallback, useRef } from "react";
import { useDatasetId } from "../state/accessors";

/**
 * Mount the video canvas on the annotation engine. The tile's Lighter scene
 * registers the engine's frame-locked Lighter bridge — the same contract the
 * image surface uses — so overlay hydration, reconcile, gesture commits, and
 * select/hover all route through the engine. The only video-specific input is
 * `frameOf`: the playhead's current frame, stamped onto every ref so writes and
 * selection address `(instanceId, frame)` (the `FrameStore` is frame-keyed; the
 * scene holds one overlay per track, keyed by `instanceId`).
 *
 * Mount inside the surface's `PlaybackProvider` (for `useTimeline`) and AFTER
 * the store registration + frame-clock attach, so the bridge reconciles against
 * a seeded frame store and the `FrameTemporalView` rather than the degenerate
 * pool view.
 */
export const useVideoLighterEngineBridge = (): void => {
  const engine = useAnnotationEngine();
  const sample = useActiveSampleId();
  const dataset = useDatasetId();
  const { getFrameNumber } = useTimeline();

  // referentially stable frame reader — a new identity would re-create the
  // bridge (clear + rehydrate); the playhead value is read live at call time
  const frameRef = useRef(getFrameNumber);
  frameRef.current = getFrameNumber;
  const frameOf = useCallback(() => frameRef.current(), []);

  // paths left unscoped: the composite store registers a single frame-detection
  // field, and sample-level temporal-detections carry no Lighter adapter, so the
  // loop's kind filter drops them from the canvas already.
  useLighterEngineBridge({ engine, sample, dataset, frameOf });
};
