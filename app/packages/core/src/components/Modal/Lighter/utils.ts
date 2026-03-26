/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import type { Rect } from "@fiftyone/lighter";

/**
 * Extracts a zoom target rectangle from raw FiftyOne sample data by finding
 * all Detection `bounding_box` values and computing their union.
 *
 * This is intentionally a synchronous, schema-free extraction — it walks the
 * sample object looking only for the structural signatures of Detection labels
 * (`_cls: "Detection"` / `_cls: "Detections"`) without calling any async
 * state (Recoil snapshots, field-type resolution, etc.).
 *
 * The returned rect is in normalized [0,1] coordinates relative to the image,
 * matching the `relativeBounds` used by BoundingBoxOverlay. It can be passed
 * directly to `CoordinateSystem2D.relativeToAbsolute` once image dimensions
 * are known.
 *
 * @param sample - The raw sample data object (e.g. `modalSample.sample`).
 * @returns The union bounding rect in [0,1] space, or `null` if no Detection
 *   labels with valid bounding boxes were found.
 */
export function extractZoomTarget(sample: Record<string, unknown>): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  const visitDetection = (det: unknown): void => {
    if (!det || typeof det !== "object") return;
    const box = (det as Record<string, unknown>).bounding_box;
    if (!Array.isArray(box) || box.length < 4) return;

    const [x, y, w, h] = box as number[];
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return;
    if (w <= 0 || h <= 0) return;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    found = true;
  };

  const visitLabel = (label: Record<string, unknown>): void => {
    const cls = label._cls;

    if (cls === "Detection") {
      visitDetection(label);
    } else if (cls === "Detections") {
      const detections = label.detections;
      if (Array.isArray(detections)) {
        for (const det of detections) {
          visitDetection(det);
        }
      }
    } else if (cls === "DynamicEmbeddedDocument") {
      for (const nested of Object.values(label)) {
        if (nested && typeof nested === "object" && !Array.isArray(nested)) {
          visitLabel(nested as Record<string, unknown>);
        }
      }
    }
  };

  for (const value of Object.values(sample)) {
    if (!value || typeof value !== "object") continue;
    visitLabel(value as Record<string, unknown>);
  }

  if (!found) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
