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
        stream.updateLabel(frameNumber, detection);
      });
    },
    [stream]
  );
};
