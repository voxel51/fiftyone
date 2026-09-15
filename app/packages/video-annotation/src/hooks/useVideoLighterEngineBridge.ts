/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useActiveSampleId,
  useAnnotationEngine,
  useLighterEngineBridge,
} from "@fiftyone/annotation";
import { useIsImageDynamicGroupVideo } from "@fiftyone/state";
import { useCallback } from "react";
import { useDatasetId } from "../state/accessors";
import { isFrameScopedPath } from "../state/framePaths";
import { useCurrentFrameGetter } from "../state/useCurrentFrame";
import { stashEstablishKey } from "../sync/establishKeyRelay";
import { useKeyframePromotionOnEdit } from "./useKeyframePromotionOnEdit";

/**
 * Mount the video canvas on the annotation engine via the frame-locked Lighter
 * bridge, stamping the playhead frame onto every frame-scoped ref. Mount inside
 * the surface's `PlaybackProvider`, after the store registration.
 */
export const useVideoLighterEngineBridge = (
  /** Projection scope; dropping a path re-creates the bridge and clears its overlays. */
  paths: ReadonlySet<string>,
): void => {
  const engine = useAnnotationEngine();
  const sample = useActiveSampleId();
  const dataset = useDatasetId();

  // referentially stable frame reader — a new identity would re-create the
  // bridge (clear + rehydrate); the playhead value is read live at call time
  const getFrame = useCurrentFrameGetter();

  // Stamp the playhead frame only onto frame-scoped paths; a sample-level
  // temporal detection sharing this scene must stay frame-less so its engine
  // ref matches the sidebar and timeline. A frame-less ref on a frame-scoped
  // path is worse: the `FrameStore` silently drops its writes.
  const isImageDynamicGroupVideo = useIsImageDynamicGroupVideo();
  const frameOf = useCallback(
    (path: string) =>
      isFrameScopedPath(path, isImageDynamicGroupVideo)
        ? getFrame()
        : undefined,
    [getFrame, isImageDynamicGroupVideo],
  );

  const onEditCommit = useKeyframePromotionOnEdit();

  // Each draw's gesture key is stashed by overlay id so the auto-extend can
  // fold its filler into the draw's undo unit.
  useLighterEngineBridge({
    engine,
    sample,
    dataset,
    paths,
    frameOf,
    onEstablishCommit: stashEstablishKey,
    onEditCommit,
  });
};
