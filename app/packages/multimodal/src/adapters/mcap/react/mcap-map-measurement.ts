/**
 * Pure state + math for the map tile's two-click WGS84 ruler.
 */

import { haversineDistanceMeters, type GeoPoint } from "./wgs84";

export type MapMeasurementPoint = GeoPoint;

export interface MapMeasurementState {
  readonly a: MapMeasurementPoint;
  /** `null` while waiting for the second pick. */
  readonly b: MapMeasurementPoint | null;
}

/**
 * Advance the two-click state machine: first pick anchors, second pick
 * completes, a third starts a fresh measurement.
 */
export function nextMapMeasurementState(
  current: MapMeasurementState | null,
  pick: MapMeasurementPoint,
): MapMeasurementState {
  if (!current || current.b !== null) {
    return { a: pick, b: null };
  }
  return { a: current.a, b: pick };
}

/** Great-circle distance of a complete WGS84 measurement, else `null`. */
export function mapMeasurementDistance(
  measurement: MapMeasurementState | null,
): number | null {
  if (!measurement?.b) return null;
  return haversineDistanceMeters(measurement.a, measurement.b);
}

export function formatMapMeasurementDistance(meters: number): string {
  if (meters < 100) {
    return `${meters.toFixed(2)} m`;
  }
  if (meters < 1_000) {
    return `${meters.toFixed(1)} m`;
  }
  if (meters < 100_000) {
    return `${(meters / 1_000).toFixed(2)} km`;
  }
  return `${(meters / 1_000).toFixed(1)} km`;
}
