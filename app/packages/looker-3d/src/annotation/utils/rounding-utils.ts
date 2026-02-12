import type { ReconciledDetection3D, ReconciledPolyline3D } from "../types";

/**
 * Precision for numeric rounding to avoid noisy diffs.
 */
export const PRECISION = 6;

/**
 * Rounds a number to PRECISION decimal places.
 */
export const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Rounds a tuple of numbers to PRECISION decimal places.
 */
export const roundTuple = <T extends number[]>(tuple: T): T =>
  tuple.map(round) as T;

/**
 * Rounds all numeric values in a detection label for consistent precision.
 */
export function roundDetection(
  detection: ReconciledDetection3D
): ReconciledDetection3D {
  return {
    ...detection,
    location: roundTuple(detection.location),
    dimensions: roundTuple(detection.dimensions),
    rotation: detection.rotation ? roundTuple(detection.rotation) : undefined,
    quaternion: detection.quaternion
      ? roundTuple(detection.quaternion)
      : undefined,
  };
}

/**
 * Rounds all numeric values in a polyline label for consistent precision.
 */
export function roundPolyline(
  polyline: ReconciledPolyline3D
): ReconciledPolyline3D {
  return {
    ...polyline,
    points3d: polyline.points3d.map((segment) =>
      segment.map((point) => roundTuple(point))
    ),
  };
}
