/**
 * @file The keypoint specs verify through the UI, but a NaN hole and a
 * per-point attribute list are only observable in the database, so this reads
 * a saved `Keypoints` field back out of Python.
 */

import fs from "fs";
import os from "os";
import path from "path";

import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

/**
 * Persisted state of the first `Keypoint` in a `Keypoints` field, as read back
 * from Python after a save. NaN holes (skipped/unplaced nodes, unset float
 * attributes) come back as `null` — NaN is not representable in JSON.
 */
export interface KeypointsState {
  /** Whether the field is set and contains at least one keypoint. */
  present: boolean;
  /** Number of keypoints in the field. */
  count: number;
  /** The first keypoint's class label, or null. */
  label: string | null;
  /** The first keypoint's points; a skipped node reads as `[null, null]`. */
  points: [number | null, number | null][];
  /**
   * Requested per-point attribute lists of the first keypoint, keyed by
   * attribute name. A missing attribute maps to `null`.
   */
  attributes: Record<string, (boolean | number | string | null)[] | null>;
}

/**
 * Reads back the persisted state of a `Keypoints` field on a single sample
 * (or a single video frame). Use to verify a keypoint save round-trip —
 * placed nodes read back as finite coordinates, skipped nodes as
 * `[null, null]` (NaN holes), and per-point attribute lists exactly as
 * stored.
 *
 * @param loader The `fiftyoneLoader` fixture, used to run the read in Python
 * @param dataset The dataset name
 * @param field The `Keypoints` field to inspect, relative to its carrier —
 *   for a frame field pass `"keypoints"` (not `"frames.keypoints"`) along
 *   with `options.frameNumber`
 * @param options.sampleIndex Index into the dataset's sample order (default 0)
 * @param options.frameNumber Read from this frame of the sample instead of
 *   the sample itself (video datasets; 1-based)
 * @param options.attributes Per-point attribute names to read back from the
 *   first keypoint
 */
export const readKeypointsState = async (
  loader: AbstractFiftyoneLoader,
  dataset: string,
  field: string,
  options: {
    sampleIndex?: number;
    frameNumber?: number;
    attributes?: string[];
  } = {},
): Promise<KeypointsState> => {
  const sampleIndex = options.sampleIndex ?? 0;
  const frameNumber = options.frameNumber ?? null;
  const attributes = options.attributes ?? [];
  const resultFile = path.join(
    os.tmpdir(),
    `keypoints-state-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2)}.json`,
  );

  await loader.executePythonCode(`
      import json
      import math
      import fiftyone as fo

      dataset = fo.load_dataset("${dataset}")
      view = dataset.skip(${sampleIndex})
      sample = view.first() if len(view) > 0 else None

      frame_number = ${frameNumber ?? "None"}
      target = sample
      if sample is not None and frame_number is not None:
        target = sample.frames[frame_number] if frame_number in sample.frames else None

      result = {
        "present": False,
        "count": 0,
        "label": None,
        "points": [],
        "attributes": {},
      }

      def clean(value):
        if isinstance(value, float) and math.isnan(value):
          return None
        return value

      container = None
      if target is not None:
        try:
          container = target.get_field("${field}")
        except Exception:
          container = None

      if container is not None and getattr(container, "keypoints", None):
        kp = container.keypoints[0]
        result["present"] = True
        result["count"] = len(container.keypoints)
        result["label"] = kp.label
        result["points"] = [[clean(x), clean(y)] for x, y in (kp.points or [])]
        for name in json.loads('${JSON.stringify(attributes)}'):
          values = kp.get_field(name) if kp.has_field(name) else None
          result["attributes"][name] = (
            [clean(v) for v in values] if isinstance(values, list) else None
          )

      with open("${resultFile}", "w") as f:
        json.dump(result, f)
    `);

  const raw = fs.readFileSync(resultFile, "utf-8");
  fs.unlinkSync(resultFile);
  return JSON.parse(raw) as KeypointsState;
};
