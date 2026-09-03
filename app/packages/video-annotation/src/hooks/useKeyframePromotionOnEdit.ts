/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useActiveSampleId,
  useAnnotationEngine,
  useAnnotationEventBus,
} from "@fiftyone/annotation";
import { useIsImageDynamicGroupVideo } from "@fiftyone/state";
import { useCallback } from "react";
import { isFrameScopedPath } from "../state/framePaths";
import { useCurrentFrameGetter } from "../state/useCurrentFrame";

/**
 * Builds the bridge's `onEditCommit` callback: after a geometry drag / resize
 * lands on the engine, promote the touched frame to a keyframe and dispatch
 * `annotation:keyframeChanged` so
 * {@link useAutoInterpolate} re-lerps the bracketing segments against the new
 * geometry. The promotion write folds into the edit's undo unit via the gesture
 * `undoKey` the commit landed under, so one Ctrl-Z reverts the whole nudge.
 *
 * Frame-scoped: a sample-level temporal detection has no keyframe.
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
  const isImageDynamicGroupVideo = useIsImageDynamicGroupVideo();

  return useCallback(
    (overlayId, path, undoKey) => {
      if (!isFrameScopedPath(path, isImageDynamicGroupVideo)) {
        return;
      }

      const frame = getFrame();
      const ref = { sample, path, instanceId: overlayId, frame };
      const det = engine.getLabel(ref);

      if (!det) {
        return;
      }

      // geometry-bearing frame labels only: box tracks lerp `bounding_box`;
      // keypoint / polyline tracks carry `points` and persist as keyframes
      // (points don't interpolate, so the keyframe is what makes the edit stick)
      if (!Array.isArray(det.bounding_box) && !Array.isArray(det.points)) {
        return;
      }

      // Promote the touched frame to a keyframe when it isn't one already,
      // folded into the edit's undo unit (the commit's `undoKey`). An
      // already-keyframe edit writes nothing here (no empty undo entry) but
      // still re-lerps below against its new geometry.
      if (!det.keyframe) {
        engine.transaction(
          () => {
            engine.updateLabel(ref, { keyframe: true });
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
        path,
        undoKey,
      });
    },
    [engine, eventBus, getFrame, isImageDynamicGroupVideo, sample],
  );
};
