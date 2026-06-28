/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  FRAMES_PREFIX,
  useActiveSampleId,
  useAnnotationEngine,
  useAnnotationEventBus,
} from "@fiftyone/annotation";
import { useCallback } from "react";
import { useCurrentFrameGetter } from "../state/useCurrentFrame";

/**
 * Builds the bridge's `onEditCommit` callback: after a box drag / resize lands
 * on the engine, promote the touched frame to a keyframe (clearing any
 * interpolation provenance) and dispatch `annotation:keyframeChanged` so
 * {@link useAutoInterpolate} re-lerps the bracketing segments against the new
 * geometry. This is the engine-era equivalent of the wiring the pre-engine
 * `upsertFromOverlay` carried via `toLocalDetection`. The promotion write folds
 * into the edit's undo unit via the gesture `undoKey` the commit landed under,
 * so one Ctrl-Z reverts the whole nudge.
 *
 * Bbox-only and frame-scoped: a sample-level temporal detection has no keyframe,
 * and a keypoint / polyline carries no `bounding_box` for the linear lerp.
 */
export const useKeyframePromotionOnEdit = (): ((
  overlayId: string,
  path: string,
  undoKey: string,
) => void) => {
  const engine = useAnnotationEngine();
  const sample = useActiveSampleId();
  const getFrame = useCurrentFrameGetter();
  const eventBus = useAnnotationEventBus();

  return useCallback(
    (overlayId, path, undoKey) => {
      if (!path.startsWith(FRAMES_PREFIX)) {
        return;
      }

      const frame = getFrame();
      const ref = { sample, path, instanceId: overlayId, frame };
      const det = engine.getLabel(ref);

      // bbox tracks only — the linear interpolation lerps `bounding_box`
      if (!det || !Array.isArray(det.bounding_box)) {
        return;
      }

      // Promote the touched frame to a keyframe when it isn't one already,
      // clearing interpolation provenance, folded into the edit's undo unit (the
      // commit's `undoKey`). An already-keyframe edit writes nothing here (no
      // empty undo entry) but still re-lerps below against its new geometry.
      if (!det.keyframe) {
        engine.transaction(
          () => {
            engine.updateLabel(ref, {
              keyframe: true,
              ...(det.propagation ? { propagation: null } : {}),
            });
          },
          { undoKey },
        );
      }

      // Mirror the event MarkKeyframeCommand emits so the adjacent segments
      // re-lerp against the new bbox — carrying the commit's `undoKey` so the
      // re-lerp folds into this edit's single undo unit.
      eventBus.dispatch("annotation:keyframeChanged", {
        trackId: `instance-${overlayId}`,
        instanceId: overlayId,
        frame,
        kind: "set",
        undoKey,
      });
    },
    [engine, eventBus, getFrame, sample],
  );
};
