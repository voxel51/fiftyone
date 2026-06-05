import {
  type InferenceResult,
  type PropagatedDetection,
  type PropagationInferenceResult,
} from "@fiftyone/annotation";
import { useCallback } from "react";

import { useFrameLabelsStream } from "../streams/frameLabelsStream";

/**
 * Method which applies a {@link PropagationInferenceResult} to the
 * `VideoFrameLabelsStream` cache. Each per-frame entry is written via
 * `stream.updateLabel`, which the auto-save pipeline picks up.
 */
export type PropagationResultHandler = (
  result: InferenceResult<PropagationInferenceResult>
) => void;

/** Writes a single propagated detection into a 1-based frame. */
export type PropagatedDetectionWriter = (
  frameNumber: number,
  detection: PropagatedDetection
) => void;

/**
 * Hook which returns a single-frame writer bound to the active session.
 * Used both by the batch {@link useApplyPropagationResult} (sync agents that
 * return every frame at once) and by streaming agents (SAM2) that emit a
 * frame at a time as inference lands.
 *
 * The agent mints a fresh `_id` per emitted frame, but the in-between frames
 * of a tracked object usually already carry a detection for this instance.
 * `updateLabel` matches by `_id`, so a fresh id would append a duplicate
 * (collapsed in rendering by the shared `instance._id`, but doubled in the
 * data and persisted as an `add`). Reuse the existing detection's `_id` when
 * one is present so the write overwrites it in place (a `replace`); fall
 * back to the minted id only for genuine gaps in the track (a correct `add`).
 */
export const useApplyPropagatedDetection = (): PropagatedDetectionWriter => {
  const stream = useFrameLabelsStream();

  return useCallback(
    (frameNumber: number, detection: PropagatedDetection) => {
      if (!stream) return;

      const snapshot = stream.getValue((frameNumber - 1) / stream.fps);
      const existing = snapshot?.detections.find(
        (d) => d.instance?._id === detection.instance?._id
      );

      stream.updateLabel(
        frameNumber,
        existing?._id ? { ...detection, _id: existing._id } : detection
      );
    },
    [stream]
  );
};

/**
 * Hook which returns a {@link PropagationResultHandler} bound to the
 * current video annotation session. Mirrors {@link useApplyInferenceResult}'s
 * shape; dispatches into the per-frame stream cache rather than into
 * Lighter overlays directly (overlays only exist for the current frame).
 */
export const useApplyPropagationResult = (): PropagationResultHandler => {
  const applyDetection = useApplyPropagatedDetection();

  return useCallback(
    (result: InferenceResult<PropagationInferenceResult>) => {
      if (result.type !== "sync") return;

      result.response.perFrame.forEach(({ frameNumber, detection }) =>
        applyDetection(frameNumber, detection)
      );
    },
    [applyDetection]
  );
};
