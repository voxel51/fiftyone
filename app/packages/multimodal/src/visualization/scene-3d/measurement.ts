/**
 * Pure state + math for the two-click grid-plane ruler.
 * `MeasurementLayer` owns the scene interaction; `PointCloudPanel` owns
 * the mode toggle and readout.
 */

import { nextTwoClickState } from "../../utils/two-click-state";

export type MeasurementPoint = readonly [number, number, number];
export type MeasurementPlaneUpAxis = "x" | "y" | "z";

export interface MeasurementState {
  readonly a: MeasurementPoint;
  /** `null` while waiting for the second pick. */
  readonly b: MeasurementPoint | null;
}

/**
 * Advance the two-click state machine: first pick anchors, second pick
 * completes, a third starts a fresh measurement.
 */
export function nextMeasurementState(
  current: MeasurementState | null,
  pick: MeasurementPoint,
): MeasurementState {
  return nextTwoClickState(current, pick);
}

const GRID_PLANE_DISTANCE_AXES: Record<
  MeasurementPlaneUpAxis,
  readonly [0 | 1 | 2, 0 | 1 | 2]
> = {
  x: [1, 2],
  y: [0, 2],
  z: [0, 1],
};

/** Grid-plane distance of a complete measurement, else `null`. */
export function measurementDistance(
  measurement: MeasurementState | null,
  planeUp: MeasurementPlaneUpAxis = "z",
): number | null {
  if (!measurement?.b) return null;
  const [firstAxis, secondAxis] = GRID_PLANE_DISTANCE_AXES[planeUp];
  return Math.hypot(
    measurement.b[firstAxis] - measurement.a[firstAxis],
    measurement.b[secondAxis] - measurement.a[secondAxis],
  );
}

/** `12.34 m` under 100 m, `123.4 m` above — readable at both scales. */
export function formatMeasurementDistance(meters: number): string {
  return `${meters >= 100 ? meters.toFixed(1) : meters.toFixed(2)} m`;
}
