import type { LocationVisualization } from "../../../decoders";
import { voxel51PrimaryColor } from "./episode-map-puck";
import { bearingDegrees, haversineDistanceMeters } from "./wgs84";

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
const MAX_FORWARD_CURSOR_STEPS = 64;

export interface EpisodeLocationTrackPoint {
  /** 95% (2σ) horizontal accuracy in meters, when the fix carried one. */
  readonly accuracyM?: number;
  readonly altitude?: number;
  readonly fixService?: number;
  readonly fixStatus?: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly timeNs: bigint;
}

export interface EpisodeLocationTrackSegment {
  readonly points: readonly EpisodeLocationTrackPoint[];
}

/** Immutable search and rendering data for one valid-fix segment. */
export interface IndexedLocationTrackSegment {
  readonly coordinates: readonly (readonly [number, number])[];
  readonly cumulativeDistanceM: readonly number[];
  readonly endTimeNs: bigint;
  readonly points: readonly EpisodeLocationTrackPoint[];
  readonly startTimeNs: bigint;
  readonly timesNs: readonly bigint[];
  readonly totalDistanceM: number;
}

/** Search index over the valid-fix segments of one location track. */
export interface IndexedLocationTrack {
  readonly firstPoint: EpisodeLocationTrackPoint | null;
  readonly lastPoint: EpisodeLocationTrackPoint | null;
  readonly segments: readonly IndexedLocationTrackSegment[];
}

/** Mutable cursor reused during forward playback. */
export interface LocationTrackCursor {
  pointIndex: number;
  segmentIndex: number;
  timeNs: bigint | null;
}

/** Position and route-partition state resolved for one playhead time. */
export interface ResolvedLocationTrackPosition {
  /** Segment boundary separating fully-past from fully-future segments. */
  readonly boundarySegmentIndex: number;
  readonly lineProgress: number | null;
  readonly location: InterpolatedLocation | null;
  readonly pointIndex: number | null;
  readonly segmentIndex: number | null;
  readonly state: "empty" | "before" | "active" | "gap" | "after";
}

export interface EpisodeLocationTrackState {
  readonly color: string;
  readonly label: string;
  readonly pointCount: number;
  readonly segments: readonly EpisodeLocationTrackSegment[];
  readonly status: "loading" | "ready" | "error";
  readonly stream: string;
  readonly truncated?: boolean;
}

export type EpisodeLocationTracks = ReadonlyMap<
  string,
  EpisodeLocationTrackState
>;

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
): EpisodeLocationTrackPoint {
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

export function isValidLocationPoint(
  point: EpisodeLocationTrackPoint,
): boolean {
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
  points: readonly EpisodeLocationTrackPoint[],
): readonly EpisodeLocationTrackSegment[] {
  const segments: EpisodeLocationTrackSegment[] = [];
  let current: EpisodeLocationTrackPoint[] = [];

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
  segments: readonly EpisodeLocationTrackSegment[],
  maxPoints = MAX_LOCATION_TRACK_RENDER_POINTS,
): {
  readonly pointCount: number;
  readonly segments: readonly EpisodeLocationTrackSegment[];
  readonly truncated: boolean;
} {
  const pointCount = countLocationTrackPoints(segments);
  if (pointCount <= maxPoints) {
    return { pointCount, segments, truncated: false };
  }

  const decimated = decimateSegmentsByGlobalIndex(
    segments,
    pointCount,
    maxPoints,
  );

  return { pointCount, segments: decimated, truncated: true };
}

export function countLocationTrackPoints(
  segments: readonly EpisodeLocationTrackSegment[],
): number {
  return segments.reduce((count, segment) => count + segment.points.length, 0);
}

/** Builds the immutable time, coordinate, and distance index for a track. */
export function indexLocationTrack(
  segments: readonly EpisodeLocationTrackSegment[],
): IndexedLocationTrack {
  const indexedSegments: IndexedLocationTrackSegment[] = [];
  for (const segment of segments) {
    if (segment.points.length === 0) continue;
    const cumulativeDistanceM = [0];
    const coordinates: [number, number][] = [];
    const timesNs: bigint[] = [];
    for (let index = 0; index < segment.points.length; index += 1) {
      const point = segment.points[index];
      coordinates.push([point.longitude, point.latitude]);
      timesNs.push(point.timeNs);
      if (index > 0) {
        cumulativeDistanceM.push(
          cumulativeDistanceM[index - 1] +
            haversineDistanceMeters(segment.points[index - 1], point),
        );
      }
    }
    indexedSegments.push({
      coordinates,
      cumulativeDistanceM,
      endTimeNs: timesNs[timesNs.length - 1],
      points: segment.points,
      startTimeNs: timesNs[0],
      timesNs,
      totalDistanceM: cumulativeDistanceM[cumulativeDistanceM.length - 1],
    });
  }
  return {
    firstPoint: indexedSegments[0]?.points[0] ?? null,
    lastPoint:
      indexedSegments[indexedSegments.length - 1]?.points.at(-1) ?? null,
    segments: indexedSegments,
  };
}

/** Creates a cursor for repeated indexed location lookups. */
export function createLocationTrackCursor(): LocationTrackCursor {
  return { pointIndex: 0, segmentIndex: 0, timeNs: null };
}

/**
 * Resolves one indexed track position. Forward playback advances the optional
 * cursor; seeks and backwards movement fall back to binary search.
 */
export function resolveIndexedLocationAtTime(
  track: IndexedLocationTrack,
  timeNs: bigint,
  cursor?: LocationTrackCursor,
): ResolvedLocationTrackPosition {
  const { firstPoint, lastPoint, segments } = track;
  if (!firstPoint || !lastPoint || segments.length === 0) {
    updateCursor(cursor, 0, 0, timeNs);
    return emptyResolvedPosition();
  }
  if (timeNs < firstPoint.timeNs) {
    updateCursor(cursor, 0, 0, timeNs);
    return {
      boundarySegmentIndex: 0,
      lineProgress: null,
      location: locationFromPoint(firstPoint),
      pointIndex: null,
      segmentIndex: null,
      state: "before",
    };
  }
  if (timeNs > lastPoint.timeNs) {
    const segmentIndex = segments.length - 1;
    const pointIndex = segments[segmentIndex].points.length - 1;
    updateCursor(cursor, segmentIndex, pointIndex, timeNs);
    return {
      boundarySegmentIndex: segments.length,
      lineProgress: null,
      location: locationFromPoint(lastPoint),
      pointIndex: null,
      segmentIndex: null,
      state: "after",
    };
  }

  const segmentIndex = resolveSegmentIndex(segments, timeNs, cursor);
  if (segmentIndex < 0) {
    const boundarySegmentIndex = findFirstSegmentStartingAfter(
      segments,
      timeNs,
    );
    updateCursor(cursor, boundarySegmentIndex, 0, timeNs);
    return {
      boundarySegmentIndex,
      lineProgress: null,
      location: null,
      pointIndex: null,
      segmentIndex: null,
      state: "gap",
    };
  }

  const segment = segments[segmentIndex];
  const pointIndex = resolvePointIndex(segment, segmentIndex, timeNs, cursor);
  const location = locationAtIndexedPoint(segment, pointIndex, timeNs);
  updateCursor(cursor, segmentIndex, pointIndex, timeNs);
  return {
    boundarySegmentIndex: segmentIndex,
    lineProgress: lineProgressAt(segment, pointIndex, location, timeNs),
    location,
    pointIndex,
    segmentIndex,
    state: "active",
  };
}

/** Builds the comet tail from the same resolved segment as the marker. */
export function indexedLocationTrailCoordinates(
  track: IndexedLocationTrack,
  resolved: ResolvedLocationTrackPosition,
  windowNs: bigint,
): readonly [number, number][] {
  let segmentIndex = resolved.segmentIndex;
  let head = resolved.location;
  if (resolved.state === "after") {
    segmentIndex = track.segments.length - 1;
    head = track.lastPoint ? locationFromPoint(track.lastPoint) : null;
  }
  if (segmentIndex === null || !head) return [];

  const segment = track.segments[segmentIndex];
  if (!segment) return [];
  const tailNs =
    head.timeNs - windowNs > segment.startTimeNs
      ? head.timeNs - windowNs
      : segment.startTimeNs;
  const tailPointIndex = findPointInterval(segment.timesNs, tailNs);
  const tail = locationAtIndexedPoint(segment, tailPointIndex, tailNs);
  const coordinates: [number, number][] = [[tail.longitude, tail.latitude]];
  const firstInteriorPoint = lowerBoundBigInt(segment.timesNs, tailNs + 1n);
  const endInteriorPoint = lowerBoundBigInt(segment.timesNs, head.timeNs);
  for (let index = firstInteriorPoint; index < endInteriorPoint; index += 1) {
    const coordinate = segment.coordinates[index];
    coordinates.push([coordinate[0], coordinate[1]]);
  }
  coordinates.push([head.longitude, head.latitude]);
  return coordinates.length >= 2 ? coordinates : [];
}

export function interpolateLocationAtTime(
  segments: readonly EpisodeLocationTrackSegment[],
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
  segments: readonly EpisodeLocationTrackSegment[],
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
  segments: readonly EpisodeLocationTrackSegment[],
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

function emptyResolvedPosition(): ResolvedLocationTrackPosition {
  return {
    boundarySegmentIndex: 0,
    lineProgress: null,
    location: null,
    pointIndex: null,
    segmentIndex: null,
    state: "empty",
  };
}

function updateCursor(
  cursor: LocationTrackCursor | undefined,
  segmentIndex: number,
  pointIndex: number,
  timeNs: bigint,
): void {
  if (!cursor) return;
  cursor.segmentIndex = segmentIndex;
  cursor.pointIndex = pointIndex;
  cursor.timeNs = timeNs;
}

function resolveSegmentIndex(
  segments: readonly IndexedLocationTrackSegment[],
  timeNs: bigint,
  cursor: LocationTrackCursor | undefined,
): number {
  if (cursor && cursor.timeNs !== null) {
    if (timeNs >= cursor.timeNs) {
      let index = Math.min(cursor.segmentIndex, segments.length - 1);
      let steps = 0;
      while (index < segments.length && timeNs > segments[index].endTimeNs) {
        index += 1;
        steps += 1;
        if (steps >= MAX_FORWARD_CURSOR_STEPS) {
          return binarySearchSegmentIndex(segments, timeNs);
        }
      }
      if (
        index < segments.length &&
        timeNs >= segments[index].startTimeNs &&
        timeNs <= segments[index].endTimeNs
      ) {
        return index;
      }
      return -1;
    }
  }

  return binarySearchSegmentIndex(segments, timeNs);
}

function binarySearchSegmentIndex(
  segments: readonly IndexedLocationTrackSegment[],
  timeNs: bigint,
): number {
  const candidate = lowerBoundSegmentStart(segments, timeNs) - 1;
  return candidate >= 0 && timeNs <= segments[candidate].endTimeNs
    ? candidate
    : -1;
}

function findFirstSegmentStartingAfter(
  segments: readonly IndexedLocationTrackSegment[],
  timeNs: bigint,
): number {
  return lowerBoundSegmentStart(segments, timeNs);
}

function lowerBoundSegmentStart(
  segments: readonly IndexedLocationTrackSegment[],
  timeNs: bigint,
): number {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (segments[middle].startTimeNs <= timeNs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function resolvePointIndex(
  segment: IndexedLocationTrackSegment,
  segmentIndex: number,
  timeNs: bigint,
  cursor: LocationTrackCursor | undefined,
): number {
  if (segment.points.length <= 1) return 0;
  if (
    cursor &&
    cursor.timeNs !== null &&
    timeNs >= cursor.timeNs &&
    cursor.segmentIndex === segmentIndex
  ) {
    let index = Math.min(cursor.pointIndex, segment.points.length - 2);
    let steps = 0;
    while (
      index + 1 < segment.points.length - 1 &&
      segment.timesNs[index + 1] < timeNs
    ) {
      index += 1;
      steps += 1;
      if (steps >= MAX_FORWARD_CURSOR_STEPS) {
        return findPointInterval(segment.timesNs, timeNs);
      }
    }
    return index;
  }
  return findPointInterval(segment.timesNs, timeNs);
}

function findPointInterval(timesNs: readonly bigint[], timeNs: bigint): number {
  if (timesNs.length <= 1) return 0;
  const rightIndex = lowerBoundBigInt(timesNs, timeNs);
  if (rightIndex <= 0) return 0;
  if (rightIndex >= timesNs.length) return timesNs.length - 2;
  return rightIndex - 1;
}

function lowerBoundBigInt(values: readonly bigint[], target: bigint): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle] < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function locationAtIndexedPoint(
  segment: IndexedLocationTrackSegment,
  pointIndex: number,
  timeNs: bigint,
): InterpolatedLocation {
  if (segment.points.length === 1) {
    return locationFromPoint(segment.points[0]);
  }
  const leftIndex = Math.min(pointIndex, segment.points.length - 2);
  return interpolateBetweenPoints(
    segment.points[leftIndex],
    segment.points[leftIndex + 1],
    timeNs,
  );
}

function lineProgressAt(
  segment: IndexedLocationTrackSegment,
  pointIndex: number,
  location: InterpolatedLocation,
  timeNs: bigint,
): number {
  if (segment.points.length <= 1) return 0;
  const leftIndex = Math.min(pointIndex, segment.points.length - 2);
  if (segment.totalDistanceM > 0) {
    const distanceM =
      segment.cumulativeDistanceM[leftIndex] +
      haversineDistanceMeters(segment.points[leftIndex], location);
    return clampUnit(distanceM / segment.totalDistanceM);
  }
  const span = Number(segment.endTimeNs - segment.startTimeNs);
  return span > 0
    ? clampUnit(Number(timeNs - segment.startTimeNs) / span)
    : leftIndex / (segment.points.length - 1);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolateBetweenPoints(
  left: EpisodeLocationTrackPoint,
  right: EpisodeLocationTrackPoint,
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
  point: EpisodeLocationTrackPoint,
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
  segments: readonly EpisodeLocationTrackSegment[],
): EpisodeLocationTrackPoint | null {
  for (const segment of segments) {
    if (segment.points.length > 0) return segment.points[0];
  }
  return null;
}

function lastLocationPoint(
  segments: readonly EpisodeLocationTrackSegment[],
): EpisodeLocationTrackPoint | null {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const points = segments[index].points;
    if (points.length > 0) return points[points.length - 1];
  }
  return null;
}

function decimateSegmentsByGlobalIndex(
  segments: readonly EpisodeLocationTrackSegment[],
  pointCount: number,
  maxPoints: number,
): readonly EpisodeLocationTrackSegment[] {
  if (maxPoints <= 0) {
    return [];
  }

  const wantedIndices = new Set<number>();
  if (maxPoints === 1) {
    wantedIndices.add(0);
  } else {
    for (let sampleIndex = 0; sampleIndex < maxPoints; sampleIndex += 1) {
      wantedIndices.add(
        Math.round((sampleIndex * (pointCount - 1)) / (maxPoints - 1)),
      );
    }
  }

  let globalIndex = 0;
  const decimated: EpisodeLocationTrackSegment[] = [];
  for (const segment of segments) {
    const points: EpisodeLocationTrackPoint[] = [];
    for (const point of segment.points) {
      if (wantedIndices.has(globalIndex)) {
        points.push(point);
      }
      globalIndex += 1;
    }
    if (points.length > 0) {
      decimated.push({ points });
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
