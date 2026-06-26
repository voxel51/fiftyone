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

export class AnnotateSDK {
  loader: OssLoader;

  constructor() {
    this.loader = new OssLoader();
  }

  updateLabelSchema(dataset: string, field: string, schema: unknown) {
    const schemaFile = writeToTmpFile(JSON.stringify(schema), "json");

    return this.loader.executePythonCode(`
      import fiftyone as fo
      import json

      dataset = fo.load_dataset("${dataset}")

      with open("${schemaFile}") as f:
        label_schema_str = f.read()
        label_schema = json.loads(label_schema_str)
        dataset.update_label_schema("${field}", label_schema)
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
    options: { sampleIndex?: number } = {}
  ): Promise<DetectionsState> {
    const sampleIndex = options.sampleIndex ?? 0;
    const resultFile = path.join(
      os.tmpdir(),
      `detections-state-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.json`
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
    options: { sampleIndex?: number } = {}
  ): Promise<{ present: boolean; label: string | null }> {
    const sampleIndex = options.sampleIndex ?? 0;
    const resultFile = path.join(
      os.tmpdir(),
      `classification-state-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.json`
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
