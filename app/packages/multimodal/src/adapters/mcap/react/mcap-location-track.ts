import type { LocationVisualization } from "../../../decoders";
import { voxel51PrimaryColor } from "./mcap-map-puck";
import { bearingDegrees } from "./wgs84";

// Brand orange leads so the (near-universal) single-GPS case reads as
// "the ego"; the rest are visually distant from it and from each other.
const SECONDARY_TRACK_COLORS = [
  "#3b82f6",
  "#84cc16",
  "#f472b6",
  "#a78bfa",
  "#22c55e",
] as const;

export function locationTrackColor(index: number): string {
  const colors = [voxel51PrimaryColor(), ...SECONDARY_TRACK_COLORS];
  return colors[index % colors.length];
}

export const MAX_LOCATION_TRACK_RENDER_POINTS = 10_000;

const NO_FIX_STATUS = -1;

export interface McapLocationTrackPoint {
  /** 95% (2σ) horizontal accuracy in meters, when the fix carried one. */
  readonly accuracyM?: number;
  readonly altitude?: number;
  readonly fixService?: number;
  readonly fixStatus?: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly timeNs: bigint;
}

export interface McapLocationTrackSegment {
  readonly points: readonly McapLocationTrackPoint[];
}

export interface McapLocationTrackState {
  readonly color: string;
  readonly label: string;
  readonly pointCount: number;
  readonly segments: readonly McapLocationTrackSegment[];
  readonly status: "loading" | "ready" | "error";
  readonly topic: string;
  readonly truncated?: boolean;
}

export type McapLocationTracks = ReadonlyMap<string, McapLocationTrackState>;

export interface InterpolatedLocation {
  readonly accuracyM?: number;
  readonly altitude?: number;
  readonly bearingDeg?: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly timeNs: bigint;
}

export interface LocationBounds {
  readonly east: number;
  readonly north: number;
  readonly south: number;
  readonly west: number;
}

export function locationPointFromVisualization(
  visualization: LocationVisualization,
  timelineTimeNs: bigint,
): McapLocationTrackPoint {
  return {
    accuracyM: horizontalAccuracyM(visualization.positionCovariance),
    altitude: finiteOrUndefined(visualization.altitude),
    fixService: finiteOrUndefined(visualization.fixService),
    fixStatus: finiteOrUndefined(visualization.fixStatus),
    latitude: visualization.latitude,
    longitude: visualization.longitude,
    timeNs: timelineTimeNs,
  };
}

/**
 * 95% (2σ) horizontal accuracy in meters from a row-major 3×3 ENU
 * position covariance: twice the square root of the worst-axis eigenvalue
 * of the East/North block, so a tilted error ellipse is never
 * understated. Degenerate matrices (all-zero, negative, non-finite) yield
 * `undefined` — receivers that report no real estimate report zeros, and
 * drawing "perfect accuracy" from junk would be a lie.
 */
export function horizontalAccuracyM(
  covariance: readonly number[] | undefined,
): number | undefined {
  if (!covariance || covariance.length !== 9) {
    return undefined;
  }
  const varEast = covariance[0];
  const varNorth = covariance[4];
  const covEastNorth = covariance[1];
  if (
    !Number.isFinite(varEast) ||
    !Number.isFinite(varNorth) ||
    !Number.isFinite(covEastNorth) ||
    varEast < 0 ||
    varNorth < 0
  ) {
    return undefined;
  }
  const mean = (varEast + varNorth) / 2;
  const spread = Math.sqrt(((varEast - varNorth) / 2) ** 2 + covEastNorth ** 2);
  const maxVariance = mean + spread;
  return maxVariance > 0 ? 2 * Math.sqrt(maxVariance) : undefined;
}

export function isValidLocationPoint(point: McapLocationTrackPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180 &&
    point.fixStatus !== NO_FIX_STATUS
  );
}

export function segmentLocationTrack(
  points: readonly McapLocationTrackPoint[],
): readonly McapLocationTrackSegment[] {
  const segments: McapLocationTrackSegment[] = [];
  let current: McapLocationTrackPoint[] = [];

  for (const point of points) {
    if (!isValidLocationPoint(point)) {
      if (current.length > 0) {
        segments.push({ points: current });
        current = [];
      }
      continue;
    }
    current.push(point);
  }

  if (current.length > 0) {
    segments.push({ points: current });
  }

  return segments;
}

export function decimateLocationTrackSegments(
  segments: readonly McapLocationTrackSegment[],
  maxPoints = MAX_LOCATION_TRACK_RENDER_POINTS,
): {
  readonly pointCount: number;
  readonly segments: readonly McapLocationTrackSegment[];
  readonly truncated: boolean;
} {
  const pointCount = countLocationTrackPoints(segments);
  if (pointCount <= maxPoints) {
    return { pointCount, segments, truncated: false };
  }

  const stride = Math.max(1, Math.ceil(pointCount / maxPoints));
  const decimated = segments
    .map((segment) => ({
      points: decimateSegmentByStride(segment.points, stride),
    }))
    .filter((segment) => segment.points.length > 0);

  return { pointCount, segments: decimated, truncated: true };
}

export function countLocationTrackPoints(
  segments: readonly McapLocationTrackSegment[],
): number {
  return segments.reduce((count, segment) => count + segment.points.length, 0);
}

export function interpolateLocationAtTime(
  segments: readonly McapLocationTrackSegment[],
  timeNs: bigint,
): InterpolatedLocation | null {
  const first = firstLocationPoint(segments);
  const last = lastLocationPoint(segments);
  if (!first || !last) return null;
  if (timeNs <= first.timeNs) return locationFromPoint(first);
  if (timeNs >= last.timeNs) return locationFromPoint(last);

  for (const segment of segments) {
    const points = segment.points;
    if (points.length === 0) continue;
    const segmentStart = points[0];
    const segmentEnd = points[points.length - 1];
    if (timeNs < segmentStart.timeNs || timeNs > segmentEnd.timeNs) {
      continue;
    }

    for (let index = 0; index < points.length - 1; index += 1) {
      const left = points[index];
      const right = points[index + 1];
      if (timeNs < left.timeNs || timeNs > right.timeNs) {
        continue;
      }
      return interpolateBetweenPoints(left, right, timeNs);
    }

    return locationFromPoint(segmentEnd);
  }

  // A timestamp between valid segments is a no-fix gap; do not draw a
  // marker there because that would visually bridge invalid GPS.
  return null;
}

/**
 * Coordinates of the "comet trail": the route inside
 * `[timeNs - windowNs, timeNs]`, clipped to the segment containing the
 * playhead so the trail never bridges a no-fix gap. Endpoints are
 * time-interpolated so the trail head sits exactly under the marker.
 */
export function locationTrailCoordinates(
  segments: readonly McapLocationTrackSegment[],
  timeNs: bigint,
  windowNs: bigint,
): readonly [number, number][] {
  const first = firstLocationPoint(segments);
  const last = lastLocationPoint(segments);
  if (!first || !last || timeNs < first.timeNs) {
    return [];
  }
  // Past the end of the track the marker holds at the final fix, so the
  // trail freezes behind it rather than vanishing.
  const headNs = timeNs > last.timeNs ? last.timeNs : timeNs;

  for (const segment of segments) {
    const points = segment.points;
    if (points.length === 0) continue;
    const startNs = points[0].timeNs;
    const endNs = points[points.length - 1].timeNs;
    if (headNs < startNs || headNs > endNs) {
      continue;
    }

    const tailNs = headNs - windowNs > startNs ? headNs - windowNs : startNs;
    const coordinates: [number, number][] = [];
    const tail = interpolateLocationAtTime([segment], tailNs);
    if (tail) {
      coordinates.push([tail.longitude, tail.latitude]);
    }
    for (const point of points) {
      if (point.timeNs > tailNs && point.timeNs < headNs) {
        coordinates.push([point.longitude, point.latitude]);
      }
    }
    const head = interpolateLocationAtTime([segment], headNs);
    if (head) {
      coordinates.push([head.longitude, head.latitude]);
    }
    return coordinates.length >= 2 ? coordinates : [];
  }

  // The playhead sits in a no-fix gap: no marker, no trail.
  return [];
}

export function locationBounds(
  segments: readonly McapLocationTrackSegment[],
): LocationBounds | null {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const segment of segments) {
    for (const point of segment.points) {
      west = Math.min(west, point.longitude);
      east = Math.max(east, point.longitude);
      south = Math.min(south, point.latitude);
      north = Math.max(north, point.latitude);
    }
  }

  if (
    west === Number.POSITIVE_INFINITY ||
    east === Number.NEGATIVE_INFINITY ||
    south === Number.POSITIVE_INFINITY ||
    north === Number.NEGATIVE_INFINITY
  ) {
    return null;
  }

  return { east, north, south, west };
}

export function combineLocationBounds(
  bounds: readonly (LocationBounds | null)[],
): LocationBounds | null {
  let combined: LocationBounds | null = null;
  for (const bound of bounds) {
    if (!bound) continue;
    combined = combined
      ? {
          east: Math.max(combined.east, bound.east),
          north: Math.max(combined.north, bound.north),
          south: Math.min(combined.south, bound.south),
          west: Math.min(combined.west, bound.west),
        }
      : bound;
  }
  return combined;
}

function interpolateBetweenPoints(
  left: McapLocationTrackPoint,
  right: McapLocationTrackPoint,
  timeNs: bigint,
): InterpolatedLocation {
  const span = Number(right.timeNs - left.timeNs);
  if (span <= 0) {
    return locationFromPoint(right, bearingDegrees(left, right));
  }
  const fraction = Number(timeNs - left.timeNs) / span;
  return {
    accuracyM: interpolateOptional(left.accuracyM, right.accuracyM, fraction),
    altitude: interpolateOptional(left.altitude, right.altitude, fraction),
    bearingDeg: bearingDegrees(left, right),
    latitude: interpolateNumber(left.latitude, right.latitude, fraction),
    longitude: interpolateNumber(left.longitude, right.longitude, fraction),
    timeNs,
  };
}

function locationFromPoint(
  point: McapLocationTrackPoint,
  bearingDeg?: number,
): InterpolatedLocation {
  return {
    accuracyM: point.accuracyM,
    altitude: point.altitude,
    bearingDeg,
    latitude: point.latitude,
    longitude: point.longitude,
    timeNs: point.timeNs,
  };
}

function firstLocationPoint(
  segments: readonly McapLocationTrackSegment[],
): McapLocationTrackPoint | null {
  for (const segment of segments) {
    if (segment.points.length > 0) return segment.points[0];
  }
  return null;
}

function lastLocationPoint(
  segments: readonly McapLocationTrackSegment[],
): McapLocationTrackPoint | null {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const points = segments[index].points;
    if (points.length > 0) return points[points.length - 1];
  }
  return null;
}

function decimateSegmentByStride(
  points: readonly McapLocationTrackPoint[],
  stride: number,
): readonly McapLocationTrackPoint[] {
  if (points.length <= 2 || stride <= 1) return points;
  const decimated: McapLocationTrackPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    if (index % stride === 0 || index === points.length - 1) {
      decimated.push(points[index]);
    }
  }
  return decimated;
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function interpolateNumber(left: number, right: number, fraction: number) {
  return left + (right - left) * fraction;
}

function interpolateOptional(
  left: number | undefined,
  right: number | undefined,
  fraction: number,
): number | undefined {
  return left === undefined || right === undefined
    ? undefined
    : interpolateNumber(left, right, fraction);
}
