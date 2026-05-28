import type { JSONDeltas } from "@fiftyone/core/src/client";
import { generateJsonPatch } from "@fiftyone/core/src/utils/json";
import { useIsVideo } from "@fiftyone/state";
import { useFrameLabelsStream } from "@fiftyone/video-annotation";
import { useCallback } from "react";
import type { DeltaSupplier } from "./deltaSupplier";

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
      const from = (baseline[frameField] ?? {}) as Record<string, unknown>;
      const to = (cache[frameField] ?? {}) as Record<string, unknown>;
      const subDeltas = generateJsonPatch(from, to);
      const pathPrefix = `/frames/${frameNumber}/${frameField}`;

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
