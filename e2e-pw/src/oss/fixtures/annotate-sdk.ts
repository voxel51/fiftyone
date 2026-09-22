import fs from "fs";
import os from "os";
import path from "path";

import { writeToTmpFile } from "src/oss/utils/fs";
import { OssLoader } from "./loader";

/**
 * Persisted state of a `Detections` field on a single sample, as read back
 * from Python after a save. Used to verify that annotation operations were
 * persisted correctly.
 */
export interface DetectionsState {
  /** Whether the field is set and contains at least one detection. */
  present: boolean;
  /** Number of detections in the field. */
  count: number;
  /** Total non-zero pixel count across the first detection's mask, or 0. */
  maskPixels: number;
  /**
   * Fraction of `true` pixels in the first detection's mask (0–1), or 0 when
   * there is no mask. Resolution-INDEPENDENT, unlike {@link maskPixels}: the
   * mask is re-rasterized to the overlay's pixel resolution on commit, so the
   * raw pixel count changes with the canvas size even when the painted region
   * is unchanged. Use coverage to compare a mask before/after an edit.
   */
  maskCoverage: number;
}

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

export class AnnotateSDK {
  loader: OssLoader;

  constructor() {
    this.loader = new OssLoader();
  }

  updateLabelSchema(
    dataset: string,
    field: string,
    schema: unknown,
    options: { allowNewAttrs?: boolean } = {},
  ) {
    const schemaFile = writeToTmpFile(JSON.stringify(schema), "json");
    // attributes that are not materialized subfields yet (nothing annotated)
    // require allow_new_attrs=True
    const allowNewAttrs = options.allowNewAttrs ? "True" : "False";

    return this.loader.executePythonCode(`
      import fiftyone as fo
      import json

      dataset = fo.load_dataset("${dataset}")

      with open("${schemaFile}") as f:
        label_schema_str = f.read()
        label_schema = json.loads(label_schema_str)
        dataset.update_label_schema(
            "${field}", label_schema, allow_new_attrs=${allowNewAttrs}
        )
    `);
  }

  addFieldToActiveLabelSchema(dataset: string, field: string) {
    return this.loader.executePythonCode(`
      import fiftyone as fo

      dataset = fo.load_dataset("${dataset}")
      active_schemas = dataset.active_label_schemas

      field_name = "${field}"

      if field_name not in active_schemas:
          active_schemas.append(field_name)
          dataset.active_label_schemas = active_schemas
    `);
  }

  /**
   * Reads back the persisted state of a `Detections` field on a single sample.
   *
   * Use to verify a save round-trip — e.g. after drawing a mask with the pen
   * tool in segmentation mode, that the field is set and the mask is non-empty.
   *
   * @param dataset The dataset name
   * @param field The `Detections` field to inspect
   * @param options.sampleIndex Index into the dataset's sample order
   *   (default 0). Uses `dataset.skip(n).first()` so the same ordering as
   *   `dataset.first()` is preserved.
   */
  async getDetectionsState(
    dataset: string,
    field: string,
    options: { sampleIndex?: number } = {},
  ): Promise<DetectionsState> {
    const sampleIndex = options.sampleIndex ?? 0;
    const resultFile = path.join(
      os.tmpdir(),
      `detections-state-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.json`,
    );

    await this.loader.executePythonCode(`
      import json
      import numpy as np
      import fiftyone as fo

      dataset = fo.load_dataset("${dataset}")
      view = dataset.skip(${sampleIndex})
      sample = view.first() if len(view) > 0 else None

      result = {"present": False, "count": 0, "mask_pixels": 0, "mask_coverage": 0.0}
      if sample is not None:
        try:
          detections_field = sample.get_field("${field}")
        except Exception:
          detections_field = None
        if detections_field is not None and getattr(detections_field, "detections", None):
          det = detections_field.detections[0]
          mask = det.get_mask() if hasattr(det, "get_mask") else det.mask
          result["present"] = True
          result["count"] = len(detections_field.detections)
          if mask is not None:
            arr = np.asarray(mask).astype(bool)
            result["mask_pixels"] = int(arr.sum())
            result["mask_coverage"] = float(arr.mean()) if arr.size else 0.0

      with open("${resultFile}", "w") as f:
        json.dump(result, f)
    `);

    const raw = fs.readFileSync(resultFile, "utf-8");
    fs.unlinkSync(resultFile);
    const parsed = JSON.parse(raw) as {
      present: boolean;
      count: number;
      mask_pixels: number;
      mask_coverage: number;
    };

    return {
      present: parsed.present,
      count: parsed.count,
      maskPixels: parsed.mask_pixels,
      maskCoverage: parsed.mask_coverage,
    };
  }

  /**
   * Waits until at least `minCount` detections of `field` are persisted.
   *
   * The right wait after an edit whose label is created asynchronously
   * (e.g. AI inference in a worker): save settlement reads "settled" before
   * the label even exists, and a network wait can miss an early patch. This
   * polls the database itself, so it can only pass once the label is real.
   *
   * Expected latency: inference (mock: instant) + one autosave tick (<= 3s)
   * + the patch round-trip; each probe costs ~1s of Python startup. The 15s
   * bound is ~3 probes past the expected worst case, not a race.
   */
  async waitForDetectionCount(dataset: string, field: string, minCount = 1) {
    const deadline = Date.now() + 15_000;
    let count = 0;
    while (Date.now() < deadline) {
      count = (await this.getDetectionsState(dataset, field)).count;
      if (count >= minCount) return;
    }
    throw new Error(
      `expected >=${minCount} persisted "${field}" detections within 15s, ` +
        `found ${count}`,
    );
  }

  /**
   * Reads back the persisted state of a `Keypoints` field on a single sample
   * (or a single video frame). Use to verify a keypoint save round-trip —
   * placed nodes read back as finite coordinates, skipped nodes as
   * `[null, null]` (NaN holes), and per-point attribute lists exactly as
   * stored.
   *
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
  async getKeypointsState(
    dataset: string,
    field: string,
    options: {
      sampleIndex?: number;
      frameNumber?: number;
      attributes?: string[];
    } = {},
  ): Promise<KeypointsState> {
    const sampleIndex = options.sampleIndex ?? 0;
    const frameNumber = options.frameNumber ?? null;
    const attributes = options.attributes ?? [];
    const resultFile = path.join(
      os.tmpdir(),
      `keypoints-state-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.json`,
    );

    await this.loader.executePythonCode(`
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
  }

  /**
   * Seeds one `Keypoint` into a sample-level `Keypoints` field so a spec can
   * open a PRE-EXISTING label (as opposed to creating one through the UI).
   * A `null` entry becomes a `[nan, nan]` hole — an unplaced skeleton node.
   * Replaces the field's current contents on that sample.
   *
   * @param dataset The dataset name
   * @param field The sample-level `Keypoints` field (must already exist)
   * @param points Relative `[x, y]` coordinates per skeleton node, or `null`
   *   for a hole
   * @param options.sampleIndex Index into the dataset's sample order (default 0)
   * @param options.label The keypoint's class (default "person")
   */
  async seedKeypoints(
    dataset: string,
    field: string,
    points: Array<[number, number] | null>,
    options: { sampleIndex?: number; label?: string } = {},
  ): Promise<void> {
    const sampleIndex = options.sampleIndex ?? 0;
    const label = options.label ?? "person";

    await this.loader.executePythonCode(`
      import json
      import fiftyone as fo

      dataset = fo.load_dataset("${dataset}")
      sample = dataset.skip(${sampleIndex}).first()
      nan = float("nan")
      raw = json.loads('${JSON.stringify(points)}')
      points = [(nan, nan) if p is None else (p[0], p[1]) for p in raw]
      sample["${field}"] = fo.Keypoints(
        keypoints=[fo.Keypoint(label="${label}", points=points)]
      )
      sample.save()
    `);
  }

  /**
   * Seeds one `Detection` into a sample-level `Detections` field, creating the
   * field if needed. Used to put a box underneath a keypoint placement click
   * and prove the click is not stolen by the box.
   *
   * @param dataset The dataset name
   * @param field The sample-level `Detections` field
   * @param boundingBox Relative `[x, y, w, h]`
   * @param options.sampleIndex Index into the dataset's sample order (default 0)
   * @param options.label The detection's class (default "box")
   */
  async seedDetection(
    dataset: string,
    field: string,
    boundingBox: [number, number, number, number],
    options: { sampleIndex?: number; label?: string } = {},
  ): Promise<void> {
    const sampleIndex = options.sampleIndex ?? 0;
    const label = options.label ?? "box";

    await this.loader.executePythonCode(`
      import fiftyone as fo

      dataset = fo.load_dataset("${dataset}")
      if not dataset.has_sample_field("${field}"):
        dataset.add_sample_field(
          "${field}", fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections
        )
      sample = dataset.skip(${sampleIndex}).first()
      sample["${field}"] = fo.Detections(
        detections=[
          fo.Detection(
            label="${label}",
            bounding_box=${JSON.stringify(boundingBox)},
          )
        ]
      )
      sample.save()
    `);
  }

  /**
   * Reads back the persisted state of a sample-level `Classification` field on a
   * single sample. Use to verify a classification create/delete round-trip.
   *
   * @param dataset The dataset name
   * @param field The `Classification` field to inspect
   * @param options.sampleIndex Index into the dataset's sample order (default 0)
   */
  async getClassificationState(
    dataset: string,
    field: string,
    options: { sampleIndex?: number } = {},
  ): Promise<{ present: boolean; label: string | null }> {
    const sampleIndex = options.sampleIndex ?? 0;
    const resultFile = path.join(
      os.tmpdir(),
      `classification-state-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.json`,
    );

    await this.loader.executePythonCode(`
      import json
      import fiftyone as fo

      dataset = fo.load_dataset("${dataset}")
      view = dataset.skip(${sampleIndex})
      sample = view.first() if len(view) > 0 else None

      result = {"present": False, "label": None}
      if sample is not None:
        try:
          cls_field = sample.get_field("${field}")
        except Exception:
          cls_field = None
        if cls_field is not None:
          result["present"] = True
          result["label"] = getattr(cls_field, "label", None)

      with open("${resultFile}", "w") as f:
        json.dump(result, f)
    `);

    const raw = fs.readFileSync(resultFile, "utf-8");
    fs.unlinkSync(resultFile);
    return JSON.parse(raw) as { present: boolean; label: string | null };
  }
}
