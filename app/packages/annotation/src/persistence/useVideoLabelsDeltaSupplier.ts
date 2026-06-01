import type { JSONDeltas } from "@fiftyone/core/src/client";
import { generateJsonPatch } from "@fiftyone/core/src/utils/json";
import { useIsVideo } from "@fiftyone/state";
import {
  useFrameLabelsStream,
  type RawDetection,
  type RawDetectionsField,
} from "@fiftyone/video-annotation";
import { useCallback } from "react";
import type { DeltaSupplier } from "./deltaSupplier";

/** Detection paired with its array-slot index for path-building. */
interface DetInfo {
  id: string;
  det: RawDetection;
  index: number;
}

/** Index a detections list by `_id`. Entries lacking `_id` are skipped. */
const indexById = (list: RawDetection[]): Map<string, DetInfo> => {
  const map = new Map<string, DetInfo>();
  list.forEach((det, index) => {
    if (det._id !== undefined) map.set(det._id, { id: det._id, det, index });
  });
  return map;
};

/** Per-field replaces for `_id`s present in both sides. */
const updateOps = (
  baseById: Map<string, DetInfo>,
  cacheById: Map<string, DetInfo>,
  pathPrefix: string
): JSONDeltas => {
  const ops: JSONDeltas = [];
  baseById.forEach(({ id, det: baseDet, index }) => {
    const cache = cacheById.get(id);
    if (!cache) return;
    const sub = generateJsonPatch(
      baseDet as unknown as Record<string, unknown>,
      cache.det as unknown as Record<string, unknown>
    );
    sub.forEach((op) =>
      ops.push({ ...op, path: `${pathPrefix}/detections/${index}${op.path}` })
    );
  });
  return ops;
};

/**
 * Removes for `_id`s in baseline but not cache. Descending index so an
 * earlier remove doesn't shift later indices it would have referenced.
 */
const removeOps = (
  baseById: Map<string, DetInfo>,
  cacheById: Map<string, DetInfo>,
  pathPrefix: string
): JSONDeltas =>
  Array.from(baseById.values())
    .filter((info) => !cacheById.has(info.id))
    .sort((a, b) => b.index - a.index)
    .map(({ index }) => ({
      op: "remove" as const,
      path: `${pathPrefix}/detections/${index}`,
    }));

/** Adds for `_id`s in cache but not baseline. Appended with `/-`. */
const addOps = (
  baseById: Map<string, DetInfo>,
  cacheById: Map<string, DetInfo>,
  pathPrefix: string
): JSONDeltas => {
  const ops: JSONDeltas = [];
  cacheById.forEach(({ id, det }) => {
    if (baseById.has(id)) return;
    ops.push({
      op: "add" as const,
      path: `${pathPrefix}/detections/-`,
      value: det,
    });
  });
  return ops;
};

/**
 * Build a JSON-Patch delta for one frame's detections wrapper, aligning
 * baseline ↔ cache by `_id` instead of by array index.
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
 */
const buildDetectionsDelta = (
  from: RawDetectionsField,
  to: RawDetectionsField,
  pathPrefix: string
): JSONDeltas => {
  if (from.detections === undefined) {
    return [{ op: "add", path: pathPrefix, value: to }];
  }
  const baseById = indexById(from.detections);
  const cacheById = indexById(to.detections ?? []);
  return [
    ...updateOps(baseById, cacheById, pathPrefix),
    ...removeOps(baseById, cacheById, pathPrefix),
    ...addOps(baseById, cacheById, pathPrefix),
  ];
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
