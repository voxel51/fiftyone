/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { JSONObject } from "src/shared/dataset-factory";
import { deserializeMask } from "src/shared/numpy";

/**
 * Persisted state of a `Detections` field on a single sample, extracted from
 * its raw document after a save. Used to verify that annotation operations
 * were persisted correctly.
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
 * Reads the persisted state of a `Detections` field off a raw sample
 * document (`datasetFactory.readSample`). Use to verify a save round-trip —
 * e.g. after drawing a mask with the pen tool in segmentation mode, that the
 * field is set and the mask is non-empty.
 */
export const detectionsState = (
  sample: JSONObject,
  field: string,
): DetectionsState => {
  const detections =
    ((sample[field] as JSONObject | null | undefined)?.detections as
      | JSONObject[]
      | undefined) ?? [];
  if (detections.length === 0) {
    return { present: false, count: 0, maskPixels: 0, maskCoverage: 0 };
  }
  const mask = detections[0].mask;
  const { pixels, coverage } = mask
    ? deserializeMask(mask)
    : { pixels: 0, coverage: 0 };
  return {
    present: true,
    count: detections.length,
    maskPixels: pixels,
    maskCoverage: coverage,
  };
};

export interface ClassificationState {
  present: boolean;
  label: string | null;
}

/**
 * Reads the persisted state of a sample-level `Classification` field off a
 * raw sample document. Use to verify a classification create/delete
 * round-trip.
 */
export const classificationState = (
  sample: JSONObject,
  field: string,
): ClassificationState => {
  const classification = sample[field] as JSONObject | null | undefined;
  return {
    present: classification != null,
    label: (classification?.label as string | undefined) ?? null,
  };
};
