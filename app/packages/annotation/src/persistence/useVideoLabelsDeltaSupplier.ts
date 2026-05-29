import type { JSONDeltas } from "@fiftyone/core/src/client";
import { generateJsonPatch } from "@fiftyone/core/src/utils/json";
import { useIsVideo } from "@fiftyone/state";
import { useFrameLabelsStream } from "@fiftyone/video-annotation";
import { useCallback } from "react";
import type { DeltaSupplier } from "./deltaSupplier";

/** Wrapper shape FiftyOne uses for label-list fields (e.g. `Detections`). */
type LabelsField = { detections?: object[] };

/**
 * Provides a {@link DeltaSupplier} for per-frame label edits made through the
 * video annotation surface.
 *
 * Walks the stream's dirty frames; for each, structurally diffs the
 * frame-field subtree (baseline → cache) and emits the resulting JSON-Patch
 * ops with paths prefixed by `/frames/<frame_number>/<frame_field>`.
 *
 * A no-op for non-video samples and when no stream is mounted.
 */
export const useVideoLabelsDeltaSupplier = (): DeltaSupplier => {
  const stream = useFrameLabelsStream();
  const isVideo = useIsVideo();

  return useCallback(() => {
    if (!isVideo || !stream) {
      return { deltas: [], metadata: undefined };
    }

    const frameField = stream.labelsField;
    const snapshots = stream.getDirtyFrameSnapshots();
    const deltas: JSONDeltas = [];

    for (const { frameNumber, baseline, cache } of snapshots) {
      const baselineField = baseline[frameField] as LabelsField | undefined;
      const cacheField = cache[frameField] as LabelsField | undefined;
      const pathPrefix = `/frames/${frameNumber}/${frameField}`;

      // Baseline is missing the field, or the wrapper is present but
      // missing its inner detections array. Either way the structural
      // diff produces `add /<frameField>/detections ...`, which the
      // server-side `apply_jsonpatch` rejects because that path doesn't
      // resolve on the document. Emit a single op for the whole wrapper.
      if (cacheField !== undefined && baselineField?.detections === undefined) {
        deltas.push({
          op: baselineField === undefined ? "add" : "replace",
          path: pathPrefix,
          value: cacheField,
        });
        continue;
      }

      const subDeltas = generateJsonPatch(baselineField ?? {}, cacheField ?? {});
      for (const op of subDeltas) {
        deltas.push({ ...op, path: `${pathPrefix}${op.path}` });
      }
    }

    // Stash the cache refs we just translated. The persistence event
    // handler advances baseline on success (clearing dirty) or discards
    // on failure (leaving dirty intact for retry). Without this, the
    // same delta would re-emit on every autosave tick.
    if (deltas.length > 0) {
      stream.markCommitPending(snapshots);
    }

    return { deltas, metadata: undefined };
  }, [isVideo, stream]);
};
