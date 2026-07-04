/**
 * Pure state + math for the two-click distance measurement tool.
 * `MeasurementLayer` owns the scene interaction; `PointCloudPanel` owns
 * the mode toggle and readout.
 */

export type MeasurementPoint = readonly [number, number, number];

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
  if (!current || current.b !== null) {
    return { a: pick, b: null };
  }
  return { a: current.a, b: pick };
}

/** Euclidean distance of a complete measurement, else `null`. */
export function measurementDistance(
  measurement: MeasurementState | null,
): number | null {
  if (!measurement?.b) return null;
  const [ax, ay, az] = measurement.a;
  const [bx, by, bz] = measurement.b;
  return Math.hypot(bx - ax, by - ay, bz - az);
}

/** `12.34 m` under 100 m, `123.4 m` above — readable at both scales. */
export function formatMeasurementDistance(meters: number): string {
  return `${meters >= 100 ? meters.toFixed(1) : meters.toFixed(2)} m`;
}

const POINTS_PICK_THRESHOLD_MIN_M = 0.05;
const POINTS_PICK_THRESHOLD_MAX_M = 0.8;
const POINTS_PICK_THRESHOLD_RATIO = 0.008;
const POINTS_PICK_THRESHOLD_DEFAULT_M = 0.25;

/**
 * World-space snap radius for picking individual lidar returns, scaled
 * with viewing distance: tight up close (precise picks), generous when
 * zoomed out (points subtend fractions of a pixel).
 */
export function pointsPickThreshold(cameraDistance: number): number {
  if (!Number.isFinite(cameraDistance) || cameraDistance <= 0) {
    return POINTS_PICK_THRESHOLD_DEFAULT_M;
  }
  return Math.min(
    POINTS_PICK_THRESHOLD_MAX_M,
    Math.max(
      POINTS_PICK_THRESHOLD_MIN_M,
      cameraDistance * POINTS_PICK_THRESHOLD_RATIO,
    ),
  );
}
