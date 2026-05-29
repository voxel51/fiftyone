import type { JSONDeltas } from "@fiftyone/core/src/client";
import { useIsVideo, useModalSample } from "@fiftyone/state";
import {
  parseTemporalDetectionEditKey,
  type TemporalDetectionEditFields,
  useTemporalDetectionPendingEdits,
} from "@fiftyone/video-annotation";
import { useCallback } from "react";
import type { DeltaSupplier } from "./deltaSupplier";

/**
 * Provides a {@link DeltaSupplier} for edits to `TemporalDetection`
 * fields staged from the video annotation surface (timeline drag or
 * sidebar form). Resolves the array index by `_id` at supply time so
 * concurrent inserts/removes don't desync.
 *
 * Top-level fields (`support`/`label`/`confidence`) emit `replace` ops
 * (or `add` when the field doesn't exist on the baseline). Each
 * `attributes` entry maps to a top-level field on the TD doc; a `null`
 * value emits `remove`.
 */
export const useTemporalDetectionDeltaSupplier = (): DeltaSupplier => {
  const modalSample = useModalSample();
  const isVideo = useIsVideo();
  const pending = useTemporalDetectionPendingEdits();

  return useCallback(() => {
    if (!isVideo || !modalSample?.sample || pending.size === 0) {
      return { deltas: [], metadata: undefined };
    }

    return {
      deltas: buildTemporalDetectionDeltas(
        modalSample.sample as Record<string, unknown>,
        pending
      ),
      metadata: undefined,
    };
  }, [isVideo, modalSample, pending]);
};

/**
 * Walk the pending TD edits and emit JSON-Patch ops per defined field.
 * Edits where the field/detection is gone are dropped. Exported for
 * direct unit testing.
 */
export function buildTemporalDetectionDeltas(
  sample: Record<string, unknown>,
  pending: ReadonlyMap<string, TemporalDetectionEditFields>
): JSONDeltas {
  const deltas: JSONDeltas = [];

  for (const [key, update] of pending) {
    const { fieldPath, detectionId } = parseTemporalDetectionEditKey(key);
    const field = sample[fieldPath] as
      | { _cls?: string; detections?: unknown }
      | undefined;
    if (!field || field._cls !== "TemporalDetections") {
      continue;
    }
    const detections = Array.isArray(field.detections) ? field.detections : [];
    const index = detections.findIndex(
      (d) =>
        (d as { _id?: string; id?: string })._id === detectionId ||
        (d as { _id?: string; id?: string }).id === detectionId
    );

    // Not on the sample → this is a create. Emit one `add /-` with the
    // full doc. Skip if `support` is missing (malformed).
    if (index < 0) {
      if (!update.support) continue;
      const value: Record<string, unknown> = {
        _cls: "TemporalDetection",
        _id: detectionId,
        support: update.support,
      };
      if (update.label !== undefined) value.label = update.label;
      if (update.confidence !== undefined) value.confidence = update.confidence;
      if (update.attributes) {
        for (const [k, v] of Object.entries(update.attributes)) {
          if (v !== null) value[k] = v;
        }
      }
      deltas.push({
        op: "add",
        path: `/${fieldPath}/detections/-`,
        value,
      });
      continue;
    }

    const detection = detections[index] as Record<string, unknown>;
    const basePath = `/${fieldPath}/detections/${index}`;

    if (update.support !== undefined) {
      pushScalar(deltas, basePath, "support", detection, update.support);
    }
    if (update.label !== undefined) {
      pushScalar(deltas, basePath, "label", detection, update.label);
    }
    if (update.confidence !== undefined) {
      pushScalar(deltas, basePath, "confidence", detection, update.confidence);
    }
    if (update.attributes) {
      for (const [attrKey, value] of Object.entries(update.attributes)) {
        if (value === null) {
          if (attrKey in detection) {
            deltas.push({ op: "remove", path: `${basePath}/${attrKey}` });
          }
        } else {
          deltas.push({
            op: attrKey in detection ? "replace" : "add",
            path: `${basePath}/${attrKey}`,
            value,
          });
        }
      }
    }
  }

  return deltas;
}

function pushScalar(
  deltas: JSONDeltas,
  basePath: string,
  key: string,
  detection: Record<string, unknown>,
  value: unknown
): void {
  deltas.push({
    op: key in detection ? "replace" : "add",
    path: `${basePath}/${key}`,
    value,
  });
}
