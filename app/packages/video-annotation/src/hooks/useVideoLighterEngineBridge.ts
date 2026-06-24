/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  FRAMES_PREFIX,
  useActiveSampleId,
  useAnnotationEngine,
  useLighterEngineBridge,
} from "@fiftyone/annotation";
import { useCallback } from "react";
import { useDatasetId, useVisibleLabelSchemas } from "../state/accessors";
import { useCurrentFrameGetter } from "../state/useCurrentFrame";
import { stashEstablishKey } from "../sync/establishKeyRelay";

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

  // The bridge's projection scope = the sidebar's visible set (annotation-active
  // ∩ explore-active). Deactivating a frame field in the schema manager drops
  // its path here, the bridge re-creates, and its overlays clear — the canvas
  // now respects the active schema like the sidebar. Sample-level fields stay
  // scoped too (a still-active temporal-detection field remains present).
  const paths = useVisibleLabelSchemas();

  // referentially stable frame reader — a new identity would re-create the
  // bridge (clear + rehydrate); the playhead value is read live at call time
  const getFrame = useCurrentFrameGetter();

  // Stamp the playhead frame only onto frame-scoped paths (`frames.*`). A
  // sample-level temporal detection sharing this scene must stay frame-less so
  // its engine ref matches the sidebar / timeline; stamping a frame would make
  // each surface address a different occurrence and break cross-surface select.
  const frameOf = useCallback(
    (path: string) => (path.startsWith(FRAMES_PREFIX) ? getFrame() : undefined),
    [getFrame]
  );

  // Sample-level temporal-detections carry no Lighter adapter, so the loop's
  // kind filter drops them from hydration regardless of scope, but their
  // select/hover events still route through the bridge (frame-less ref,
  // instanceId == the TD `_id`). Stash each draw's gesture key by overlay id so
  // the auto-extend can fold its filler into the draw's undo unit (one Ctrl-Z
  // removes the whole drawn track).
  useLighterEngineBridge({
    engine,
    sample,
    dataset,
    paths,
    frameOf,
    onEstablishCommit: stashEstablishKey,
  });
};
