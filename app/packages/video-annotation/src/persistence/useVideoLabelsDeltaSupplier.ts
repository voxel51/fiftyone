import {
  useRegisterDeltaSupplier,
  type DeltaSupplier,
} from "@fiftyone/annotation";
import type { JSONDeltas } from "@fiftyone/core/src/client";
import {
  generateJsonPatch,
  idAlignedDetectionsDelta,
} from "@fiftyone/core/src/utils/json";
import { useIsVideo } from "@fiftyone/state";
import type { RawDetectionsField } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";

/**
 * Build a JSON-Patch delta for one frame's detections wrapper, aligning
 * baseline ↔ cache by `_id` (via {@link idAlignedDetectionsDelta}) instead of
 * by array index. A whole detection is the unit: matched ids diff in place,
 * cache-only ids append, baseline-only ids are removed.
 *
 * `fast-json-patch.compare` aligns arrays by index, so a shifted detections
 * list (e.g. `ShiftTrackCommand` removes a slot, every later slot slides
 * down) makes each subsequent slot look "different" and emits a flood of
 * unappliable per-slot replaces. The id-aligned diff sidesteps that — and
 * stays safe when the server has detections the cache doesn't know about,
 * since `_id`s the FE never saw aren't touched.
 *
 * Special case: baseline missing the inner array → one `add` of the whole
 * wrapper, since detection-level paths don't resolve without it.
 *
 * Exported for direct unit testing.
 */
export const buildDetectionsDelta = (
  from: RawDetectionsField,
  to: RawDetectionsField,
  pathPrefix: string
): JSONDeltas => {
  if (from.detections === undefined) {
    return [{ op: "add", path: pathPrefix, value: to }];
  }
  return idAlignedDetectionsDelta(
    to.detections ?? [],
    from.detections,
    pathPrefix,
    {
      currentId: (det) => det._id,
      baselineId: (det) => det._id,
      diffMatched: (cache, base, path) =>
        generateJsonPatch(
          base as unknown as Record<string, unknown>,
          cache as unknown as Record<string, unknown>
        ).map((op) => ({ ...op, path: `${path}${op.path}` })),
      serializeAdd: (det) => det,
    }
  );
};

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

    snapshots.forEach(({ frameNumber, baseline, cache }) => {
      const from = (baseline[frameField] ?? {}) as RawDetectionsField;
      const to = (cache[frameField] ?? {}) as RawDetectionsField;
      const pathPrefix = `/frames/${frameNumber}/${frameField}`;
      buildDetectionsDelta(from, to, pathPrefix).forEach((op) =>
        deltas.push(op)
      );
    });

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

/**
 * Registers the per-frame video-label {@link DeltaSupplier} with annotation's
 * aggregator for the lifetime of the caller, so video deltas flow into the
 * autosave pipeline without annotation importing this package.
 */
export const useRegisterVideoLabelsDeltaSupplier = (): void => {
  useRegisterDeltaSupplier(useVideoLabelsDeltaSupplier());
};
