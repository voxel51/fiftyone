/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Shape of a single `TemporalDetection` as it arrives on the modal sample
 * dict. Only the fields consumers read are modeled; everything else (dynamic
 * attrs, etc.) is preserved via the index signature for downstream consumers.
 */
export interface RawTemporalDetection {
  _cls?: "TemporalDetection";
  _id?: string;
  id?: string;
  label?: string;
  /** 1-indexed inclusive frame range `[first, last]`. */
  support?: [number, number];
  confidence?: number;
  [key: string]: unknown;
}

/** Shape of a `TemporalDetections` wrapper field on the modal sample dict. */
export interface RawTemporalDetectionsField {
  _cls: "TemporalDetections";
  detections?: RawTemporalDetection[];
}

/**
 * A valid TD support is a 2-tuple `[first, last]` of finite frame numbers with
 * `last >= first`. Use when validating a support before building a track.
 */
export function isValidSupport(support: unknown): support is [number, number] {
  return (
    Array.isArray(support) &&
    support.length === 2 &&
    Number.isFinite(support[0]) &&
    Number.isFinite(support[1]) &&
    support[1] >= support[0]
  );
}

/**
 * Whether `frame` falls within `support`'s inclusive `[first, last]` range.
 *
 * Distinct from {@link isValidSupport}: this is a frame-containment gate with
 * no finiteness / ordering check — it answers "should this TD render at this
 * frame", not "is this support well-formed".
 */
export function isFrameInSupport(
  support: unknown,
  frame: number
): support is [number, number] {
  return (
    Array.isArray(support) &&
    support.length === 2 &&
    frame >= support[0] &&
    frame <= support[1]
  );
}

/** Type guard for a `TemporalDetections` wrapper field. */
export function isTemporalDetectionsField(
  value: unknown
): value is RawTemporalDetectionsField {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as { _cls?: unknown; detections?: unknown };
  return v._cls === "TemporalDetections" && Array.isArray(v.detections);
}
