import { useFrameLabelsStream } from "@fiftyone/video-annotation";
import { useCallback } from "react";

import {
  type InferenceResult,
  type PropagationInferenceResult,
} from "../types";

/**
 * Method which applies a {@link PropagationInferenceResult} to the
 * `VideoFrameLabelsStream` cache. Each per-frame entry is written via
 * `stream.updateLabel`, which the auto-save pipeline picks up.
 */
export type PropagationResultHandler = (
  result: InferenceResult<PropagationInferenceResult>
) => void;

/**
 * Hook which returns a {@link PropagationResultHandler} bound to the
 * current video annotation session. Mirrors {@link useApplyInferenceResult}'s
 * shape; dispatches into the per-frame stream cache rather than into
 * Lighter overlays directly (overlays only exist for the current frame).
 */
export const useApplyPropagationResult = (): PropagationResultHandler => {
  const stream = useFrameLabelsStream();

  return useCallback(
    (result: InferenceResult<PropagationInferenceResult>) => {
      if (!stream) return;
      if (result.type !== "sync") return;

      result.response.perFrame.forEach(({ frameNumber, detection }) => {
        // The agent mints a fresh `_id` per interpolated frame, but the
        // in-between frames of a tracked object usually already carry a
        // detection for this instance. `updateLabel` matches by `_id`, so a
        // fresh id would append a duplicate (collapsed in rendering by the
        // shared `instance._id`, but doubled in the data and persisted as an
        // `add`). Reuse the existing detection's `_id` when one is present so
        // the propagation overwrites it in place (a `replace`); fall back to
        // the minted id only for genuine gaps in the track (a correct `add`).
        const snapshot = stream.getValue((frameNumber - 1) / stream.fps);
        const existing = snapshot?.detections.find(
          (d) => d.instance?._id === detection.instance?._id
        );

        stream.updateLabel(
          frameNumber,
          existing?._id ? { ...detection, _id: existing._id } : detection
        );
      });
    },
    [stream]
  );
};
