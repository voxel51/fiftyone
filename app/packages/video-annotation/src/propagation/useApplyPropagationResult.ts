import {
  type InferenceResult,
  type PropagatedDetection,
  type PropagationInferenceResult,
  useAnnotationEngine,
  useSurfaceActions,
} from "@fiftyone/annotation";
import { useCallback } from "react";

import { useFrameLabelsStream } from "../streams/frameLabelsStream";

/**
 * Method which applies a {@link PropagationInferenceResult} to the engine. Each
 * per-frame entry is written via `engine.updateLabel`, which the autosave
 * pipeline picks up through `engine.getJsonPatch`.
 */
export type PropagationResultHandler = (
  result: InferenceResult<PropagationInferenceResult>,
) => void;

/**
 * Writes a single propagated detection into a 1-based frame. `undoKey`
 * coalesces a streaming run's per-frame writes (which can't share one
 * synchronous transaction) into a single undo unit.
 */
export type PropagatedDetectionWriter = (
  frameNumber: number,
  detection: PropagatedDetection,
  opts?: { undoKey?: string },
) => void;

const SURFACE = "video";

/**
 * Hook which returns a single-frame writer bound to the active session. Used by
 * the batch {@link useApplyPropagationResult} (sync agents returning every
 * frame at once) and by future streaming agents that emit a frame at a time
 * as inference lands.
 *
 * The engine addresses a track by its `instance._id`, so a per-frame write
 * upserts that track's box at the frame — no fresh-id dedup dance: an existing
 * box for the instance is overwritten in place, a gap gets a freshly-minted
 * frame doc. Identity fields (`_id`/`instance`) are the store's, so they're
 * stripped from the written content and re-stamped from the ref.
 */
export const useApplyPropagatedDetection = (): PropagatedDetectionWriter => {
  const engine = useAnnotationEngine();
  const actions = useSurfaceActions(engine, SURFACE);
  const stream = useFrameLabelsStream();

  return useCallback(
    (frameNumber, detection, opts) => {
      if (!stream) {
        return;
      }

      const instanceId = detection.instance?._id ?? detection._id;

      if (!instanceId) {
        return;
      }

      const path = `frames.${stream.labelsField}`;
      const { _id, instance, ...content } = detection;

      actions.transaction(
        () =>
          actions.updateLabel(
            { path, instanceId, frame: frameNumber },
            content,
          ),
        opts?.undoKey ? { undoKey: opts.undoKey } : undefined,
      );
    },
    [actions, stream],
  );
};

/**
 * Hook which returns a {@link PropagationResultHandler} bound to the current
 * session. A sync agent returns every frame at once, so the whole batch lands
 * in one engine transaction (one undo unit).
 */
export const useApplyPropagationResult = (): PropagationResultHandler => {
  const engine = useAnnotationEngine();
  const actions = useSurfaceActions(engine, SURFACE);
  const applyDetection = useApplyPropagatedDetection();

  return useCallback(
    (result: InferenceResult<PropagationInferenceResult>) => {
      if (result.type !== "sync") {
        return;
      }

      // One transaction so the per-frame writers nest into a single undo unit.
      actions.transaction(() => {
        result.response.perFrame.forEach(({ frameNumber, detection }) =>
          applyDetection(frameNumber, detection),
        );
      });
    },
    [actions, applyDetection],
  );
};
