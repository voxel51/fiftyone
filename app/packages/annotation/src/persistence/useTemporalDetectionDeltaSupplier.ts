import type { JSONDeltas } from "@fiftyone/core/src/client";
import { useIsVideo, useModalSample } from "@fiftyone/state";
import {
  parseTemporalDetectionEditKey,
  type RawTemporalDetectionsField,
  useTemporalDetectionPendingEdits,
} from "@fiftyone/video-annotation";
import { useCallback } from "react";
import type { DeltaSupplier } from "./deltaSupplier";

/**
 * Provides a {@link DeltaSupplier} for `TemporalDetection.support` edits
 * staged from the video annotation timeline.
 *
 * TDs live at sample level on a video sample (not under `frames.`), so
 * they don't flow through the video-labels delta paths. They also don't have
 * overlays, so they don't flow through the Lighter delta path.
 *
 * Pending edits are read from {@link useTemporalDetectionPendingEdits},
 * the TD's current array index is looked up live against the modal sample,
 * and one `replace /<fieldPath>/detections/<index>/support` op is emitted per
 * staged edit.
 *
 * Index is resolved at supply time (not capture time) so a concurrent
 * unrelated insert/remove on the same field doesn't break the patch.
 * If the targeted TD has disappeared from the sample, the edit is
 * silently dropped.
 *
 * No-op for non-video samples and when no edits are pending. Pending
 * edits are cleared on `annotation:persistenceSuccess` /
 * `persistenceError` by {@link useRegisterVideoAnnotationEventHandlers}.
 */
export const useTemporalDetectionDeltaSupplier = (): DeltaSupplier => {
  const modalSample = useModalSample();
  const isVideo = useIsVideo();
  const pending = useTemporalDetectionPendingEdits();

  return useCallback(() => {
    if (!isVideo || !modalSample?.sample || pending.size === 0) {
      return { deltas: [], metadata: undefined };
    }

    const sample = modalSample.sample as Record<string, unknown>;
    const deltas: JSONDeltas = [];

    for (const [key, support] of pending) {
      const { fieldPath, detectionId } = parseTemporalDetectionEditKey(key);
      const field = sample[fieldPath] as RawTemporalDetectionsField | undefined;

      const detections = field?.detections;
      if (!Array.isArray(detections)) {
        continue;
      }

      const index = detections.findIndex(
        (d) => (d._id ?? d.id) === detectionId
      );

      if (index < 0) {
        continue;
      }

      deltas.push({
        op: "replace",
        path: `/${fieldPath}/detections/${index}/support`,
        value: support,
      });
    }

    return { deltas, metadata: undefined };
  }, [isVideo, modalSample, pending]);
};
