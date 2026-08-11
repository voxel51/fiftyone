import type { LocationVisualization } from "../../../../ir";
import { lowerBoundBigInt } from "../../../../utils/bigint";
import { voxel51PrimaryColor } from "../rendering/puck";
import {
  bearingDegrees,
  haversineDistanceMeters,
  normalizeLongitudeIntervalEast,
  unwrapLongitude,
} from "../wgs84";

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

const MAX_LOCATION_TRACK_RENDER_POINTS = 10_000;
const LOCATION_TRACK_SEGMENT_CHUNK_SIZE = 256;

const NO_FIX_STATUS = -1;
const MAX_FORWARD_CURSOR_STEPS = 64;
const TRAILING_HEADING_MIN_DISPLACEMENT_M = 1;

export interface LocationTrackPoint {
  /** 95% (2σ) horizontal accuracy in meters, when the fix carried one. */
  readonly accuracyM?: number;
  readonly altitude?: number;
  readonly fixService?: number;
  readonly fixStatus?: number;
  readonly latitude: number;
  readonly longitude: number;
  /** Internal continuous-world coordinate produced at stream ingest. */
  readonly longitudeUnwrapped?: boolean;
  readonly timeNs: bigint;
}

export interface LocationTrackSegment {
  readonly points: readonly LocationTrackPoint[];
}

/** Immutable search and rendering data for one valid-fix segment. */
export interface IndexedLocationTrackSegment {
  /** Points processed while building this index snapshot. */
  readonly buildPointCount: number;
  readonly coordinates: readonly (readonly [number, number])[];
  readonly cumulativeDistanceM: readonly number[];
  readonly endTimeNs: bigint;
  readonly points: readonly LocationTrackPoint[];
  readonly startTimeNs: bigint;
  readonly timesNs: readonly bigint[];
  readonly totalDistanceM: number;
}

/** Search index over the valid-fix segments of one location track. */
export interface IndexedLocationTrack {
  readonly firstPoint: LocationTrackPoint | null;
  readonly lastPoint: LocationTrackPoint | null;
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

export interface LocationTrackState {
  readonly color: string;
  /** Render geometry was decimated while preserving the admitted route. */
  readonly downsampled?: boolean;
  readonly label: string;
  readonly pointCount: number;
  readonly segments: readonly LocationTrackSegment[];
  readonly sourceName: string;
  readonly status: "loading" | "ready" | "error";
  readonly stream: string;
  /** Some source evidence could not be retained or read. */
  readonly truncated?: boolean;
}

export type LocationTracks = ReadonlyMap<string, LocationTrackState>;

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

export interface DecimatedLocationTrack {
  readonly pointCount: number;
  readonly segments: readonly LocationTrackSegment[];
  readonly stride: number;
  readonly truncated: boolean;
}

interface MutableLocationTrackSegment {
  pointCount: number;
  published?: LocationTrackSegment;
  publishedLength: number;
  settledChunks: readonly (readonly LocationTrackPoint[])[];
  readonly storageKey: object;
  tail: LocationTrackPoint[];
}

const locationSegmentStorageKeys = new WeakMap<LocationTrackSegment, object>();

/**
 * Incrementally preserves no-fix boundaries while points append. Rollback is
 * proportional to the discarded suffix, so an interrupted read never forces
 * the retained prefix through a full resegmentation pass.
 */
export class IncrementalLocationSegmentBuilder {
  private current: MutableLocationTrackSegment | null = null;
  private readonly operations: Array<MutableLocationTrackSegment | null> = [];
  private readonly mutableSegments: MutableLocationTrackSegment[] = [];
  private revision = 0;
  private snapshotCopiedPointCount = 0;
  private snapshotRevision = -1;
  private snapshotValue: readonly LocationTrackSegment[] = [];

  append(point: LocationTrackPoint): void {
    if (!isValidLocationPoint(point)) {
      this.current = null;
      this.operations.push(null);
      this.revision += 1;
      return;
    }
    if (!this.current) {
      this.current = {
        pointCount: 0,
        publishedLength: -1,
        settledChunks: [],
        storageKey: {},
        tail: [],
      };
      this.mutableSegments.push(this.current);
    }
    this.current.tail.push(point);
    this.current.pointCount += 1;
    if (this.current.tail.length === LOCATION_TRACK_SEGMENT_CHUNK_SIZE) {
      this.current.settledChunks = [
        ...this.current.settledChunks,
        this.current.tail,
      ];
      this.current.tail = [];
    }
    this.operations.push(this.current);
    this.revision += 1;
  }

  appendMany(points: readonly LocationTrackPoint[]): void {
    for (const point of points) this.append(point);
  }

  get inputPointCount(): number {
    return this.operations.length;
  }

  get renderRevision(): number {
    return this.revision;
  }

  /** Point references copied by the most recent publication snapshot. */
  get lastSnapshotCopiedPointCount(): number {
    return this.snapshotCopiedPointCount;
  }

  snapshot(): readonly LocationTrackSegment[] {
    this.snapshotCopiedPointCount = 0;
    if (this.snapshotRevision === this.revision) return this.snapshotValue;
    this.snapshotValue = this.mutableSegments.map((segment) => {
      if (segment.published && segment.publishedLength === segment.pointCount) {
        return segment.published;
      }
      const tail = segment.tail.slice();
      this.snapshotCopiedPointCount += tail.length;
      const published = {
        points: chunkedLocationPoints(
          segment.settledChunks,
          tail,
          segment.pointCount,
        ),
      };
      locationSegmentStorageKeys.set(published, segment.storageKey);
      segment.published = published;
      segment.publishedLength = segment.pointCount;
      return segment.published;
    });
    this.snapshotRevision = this.revision;
    return this.snapshotValue;
  }

  truncate(inputPointCount: number): void {
    const wanted = Math.max(
      0,
      Math.min(inputPointCount, this.operations.length),
    );
    if (wanted === this.operations.length) return;
    while (this.operations.length > wanted) {
      const segment = this.operations.pop();
      if (!segment) continue;
      if (segment.tail.length === 0) {
        const settled = segment.settledChunks.at(-1);
        if (!settled) {
          throw new Error("location segment rollback storage is inconsistent");
        }
        segment.settledChunks = segment.settledChunks.slice(0, -1);
        segment.tail = settled.slice();
      }
      segment.tail.pop();
      segment.pointCount -= 1;
      segment.published = undefined;
      segment.publishedLength = -1;
      if (segment.pointCount === 0) {
        const removed = this.mutableSegments.pop();
        if (removed !== segment) {
          throw new Error("location segment rollback order is inconsistent");
        }
      }
    }
    const lastOperation = this.operations.at(-1);
    this.current = lastOperation ?? null;
    this.revision += 1;
  }
}

function chunkedLocationPoints(
  settledChunks: readonly (readonly LocationTrackPoint[])[],
  tail: readonly LocationTrackPoint[],
  length: number,
): readonly LocationTrackPoint[] {
  const settledPointCount =
    settledChunks.length * LOCATION_TRACK_SEGMENT_CHUNK_SIZE;
  const pointAt = (index: number): LocationTrackPoint | undefined => {
    if (index < settledPointCount) {
      return settledChunks[
        Math.floor(index / LOCATION_TRACK_SEGMENT_CHUNK_SIZE)
      ]?.[index % LOCATION_TRACK_SEGMENT_CHUNK_SIZE];
    }
    return tail[index - settledPointCount];
  };
  return readonlyArrayView(length, pointAt);
}

function readonlyArrayView<Value>(
  length: number,
  valueAt: (index: number) => Value | undefined,
): readonly Value[] {
  const target = new Array<Value>(length);
  return new Proxy(target, {
    get: (array, property, receiver) => {
      const index = arrayIndex(property);
      if (index !== null) return valueAt(index);
      const reflected: unknown = Reflect.get(array, property, receiver);
      return reflected;
    },
    getOwnPropertyDescriptor: (array, property) => {
      const index = arrayIndex(property);
      if (index === null) {
        return Reflect.getOwnPropertyDescriptor(array, property);
      }
      const value = valueAt(index);
      return value === undefined
        ? undefined
        : { configurable: true, enumerable: true, value, writable: false };
    },
    has: (array, property) => {
      const index = arrayIndex(property);
      return index === null
        ? Reflect.has(array, property)
        : index >= 0 && index < length;
    },
    ownKeys: (array) => [
      ...Array.from({ length }, (_, index) => String(index)),
      ...Reflect.ownKeys(array).filter((property) => property !== "length"),
      "length",
    ],
  });
}

function arrayIndex(property: string | symbol): number | null {
  if (typeof property !== "string" || !/^(0|[1-9]\d*)$/.test(property)) {
    return null;
  }
  const index = Number(property);
  return Number.isSafeInteger(index) ? index : null;
}

export function locationPointFromVisualization(
  visualization: LocationVisualization,
  timelineTimeNs: bigint,
): LocationTrackPoint {
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

export function isValidLocationPoint(point: LocationTrackPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    (point.longitudeUnwrapped ||
      (point.longitude >= -180 && point.longitude <= 180)) &&
    point.fixStatus !== NO_FIX_STATUS
  );
}

/** Converts one external wrapped fix to the nearest admitted world copy. */
export function unwrapLocationTrackPoint(
  point: LocationTrackPoint,
  reference?: { readonly longitude: number } | null,
): LocationTrackPoint {
  if (
    point.longitudeUnwrapped ||
    !Number.isFinite(point.longitude) ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    return point;
  }
  return {
    ...point,
    longitude: reference
      ? unwrapLongitude(point.longitude, reference.longitude)
      : point.longitude,
    longitudeUnwrapped: true,
  };
}

export function segmentLocationTrack(
  points: readonly LocationTrackPoint[],
): readonly LocationTrackSegment[] {
  const builder = new IncrementalLocationSegmentBuilder();
  builder.appendMany(points);
  return builder.snapshot();
}

export function decimateLocationTrackSegments(
  segments: readonly LocationTrackSegment[],
  maxPoints = MAX_LOCATION_TRACK_RENDER_POINTS,
): DecimatedLocationTrack {
  const pointCount = countLocationTrackPoints(segments);
  const normalizedMaxPoints = Math.max(0, Math.floor(maxPoints));
  if (normalizedMaxPoints === 0) {
    return { pointCount, segments: [], stride: 1, truncated: pointCount > 0 };
  }
  if (pointCount <= normalizedMaxPoints) {
    return { pointCount, segments, stride: 1, truncated: false };
  }
  if (normalizedMaxPoints === 1) {
    const last = lastLocationPoint(segments);
    return {
      pointCount,
      segments: last ? [{ points: [last] }] : [],
      stride: nextPowerOfTwo(pointCount),
      truncated: true,
    };
  }
  const stride = appendStableDecimationStride(pointCount, normalizedMaxPoints);
  const decimated = decimateSegmentsByStableStride(
    segments,
    pointCount,
    stride,
  );

  return { pointCount, segments: decimated, stride, truncated: true };
}

function countLocationTrackPoints(
  segments: readonly LocationTrackSegment[],
): number {
  return segments.reduce((count, segment) => count + segment.points.length, 0);
}

/** Immutable prefix view that retains incremental storage/index identity. */
export function locationTrackSegmentPrefix(
  segment: LocationTrackSegment,
  pointCount: number,
): LocationTrackSegment {
  const length = Math.max(0, Math.min(pointCount, segment.points.length));
  if (length === segment.points.length) return segment;
  const prefix = {
    points: readonlyArrayView(length, (index) => segment.points[index]),
  };
  const storageKey = locationSegmentStorageKeys.get(segment);
  if (storageKey) locationSegmentStorageKeys.set(prefix, storageKey);
  return prefix;
}

/** Builds the immutable time, coordinate, and distance index for a track. */
export function indexLocationTrack(
  segments: readonly LocationTrackSegment[],
): IndexedLocationTrack {
  const indexedSegments: IndexedLocationTrackSegment[] = [];
  for (const segment of segments) {
    if (segment.points.length === 0) continue;
    indexedSegments.push(indexLocationTrackSegment(segment));
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
      location: locationWithTrailingHeading(
        segments[segmentIndex].points,
        locationFromPoint(lastPoint),
      ),
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
  const location = locationWithTrailingHeading(
    segment.points,
    locationAtIndexedPoint(segment, pointIndex, timeNs),
  );
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
  segments: readonly LocationTrackSegment[],
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
  segments: readonly LocationTrackSegment[],
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
  segments: readonly LocationTrackSegment[],
): LocationBounds | null {
  if (segments.length === 1) {
    const bounds = locationSegmentBounds(segments[0]);
    if (bounds && locationBoundsAreSingleWorld(bounds)) return bounds;
  }
  return combineLocationBounds(segments.map(locationSegmentBounds));
}

export function combineLocationBounds(
  bounds: readonly (LocationBounds | null)[],
): LocationBounds | null {
  const intervals = bounds.flatMap((bound) => {
    if (
      !bound ||
      !Number.isFinite(bound.west) ||
      !Number.isFinite(bound.east) ||
      !Number.isFinite(bound.south) ||
      !Number.isFinite(bound.north) ||
      bound.south > bound.north
    ) {
      return [];
    }
    const east = normalizeLongitudeIntervalEast(bound.west, bound.east);
    if (east === null) return [];
    const width = east - bound.west;
    if (width <= 360) return [{ ...bound, east }];
    const center = (bound.west + east) / 2;
    return [{ ...bound, east: center + 180, west: center - 180 }];
  });
  if (intervals.length === 0) return null;

  let best: LocationBounds | null = null;
  for (const anchor of intervals.map(
    (bound) => (bound.west + bound.east) / 2,
  )) {
    let west = Number.POSITIVE_INFINITY;
    let east = Number.NEGATIVE_INFINITY;
    let south = Number.POSITIVE_INFINITY;
    let north = Number.NEGATIVE_INFINITY;
    for (const bound of intervals) {
      const center = (bound.west + bound.east) / 2;
      const shift = 360 * Math.round((anchor - center) / 360);
      west = Math.min(west, bound.west + shift);
      east = Math.max(east, bound.east + shift);
      south = Math.min(south, bound.south);
      north = Math.max(north, bound.north);
    }
    const candidate = { east, north, south, west };
    if (!best || east - west < best.east - best.west) best = candidate;
  }
  if (!best || best.east - best.west <= 360) return best;
  const center = (best.west + best.east) / 2;
  return { ...best, east: center + 180, west: center - 180 };
}

function locationBoundsAreSingleWorld(bounds: LocationBounds): boolean {
  return (
    Number.isFinite(bounds.west) &&
    Number.isFinite(bounds.east) &&
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.north) &&
    bounds.south <= bounds.north &&
    bounds.east >= bounds.west &&
    bounds.east - bounds.west <= 360
  );
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
  left: LocationTrackPoint,
  right: LocationTrackPoint,
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
  point: LocationTrackPoint,
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

/**
 * Estimates course from the previous admitted position to the resolved one.
 * Only points at or before the resolved location participate, and sub-meter
 * motion remains a headingless dot.
 */
function locationWithTrailingHeading(
  points: readonly LocationTrackPoint[],
  location: InterpolatedLocation,
): InterpolatedLocation {
  const endExclusive = upperBoundPointTime(points, location.timeNs);
  if (endExclusive === 0) return { ...location, bearingDeg: undefined };

  const endIndex = endExclusive - 1;
  const end = points[endIndex];
  const currentIsStoredPoint =
    end.timeNs === location.timeNs &&
    end.latitude === location.latitude &&
    end.longitude === location.longitude;
  const previous = currentIsStoredPoint ? points[endIndex - 1] : end;
  if (
    !previous ||
    haversineDistanceMeters(previous, location) <
      TRAILING_HEADING_MIN_DISPLACEMENT_M
  ) {
    return { ...location, bearingDeg: undefined };
  }
  return {
    ...location,
    bearingDeg: bearingDegrees(previous, location),
  };
}

function upperBoundPointTime(
  points: readonly LocationTrackPoint[],
  timeNs: bigint,
): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (points[middle].timeNs <= timeNs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstLocationPoint(
  segments: readonly LocationTrackSegment[],
): LocationTrackPoint | null {
  for (const segment of segments) {
    if (segment.points.length > 0) return segment.points[0];
  }
  return null;
}

function lastLocationPoint(
  segments: readonly LocationTrackSegment[],
): LocationTrackPoint | null {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const points = segments[index].points;
    if (points.length > 0) return points[points.length - 1];
  }
  return null;
}

function decimateSegmentsByStableStride(
  segments: readonly LocationTrackSegment[],
  pointCount: number,
  stride: number,
): readonly LocationTrackSegment[] {
  let globalIndex = 0;
  const decimated: LocationTrackSegment[] = [];
  for (const segment of segments) {
    const points: LocationTrackPoint[] = [];
    for (const point of segment.points) {
      if (globalIndex % stride === 0 || globalIndex === pointCount - 1) {
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

function appendStableDecimationStride(
  pointCount: number,
  maxPoints: number,
): number {
  let stride = 1;
  while (stableDecimatedPointCount(pointCount, stride) > maxPoints) {
    stride *= 2;
  }
  return stride;
}

function stableDecimatedPointCount(pointCount: number, stride: number): number {
  if (pointCount <= 0) return 0;
  const lastIndex = pointCount - 1;
  const regularSamples = Math.floor(lastIndex / stride) + 1;
  return regularSamples + (lastIndex % stride === 0 ? 0 : 1);
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

const indexedLocationTrackSegmentCache = new WeakMap<
  LocationTrackSegment,
  IndexedLocationTrackSegment
>();

interface IncrementalLocationSegmentIndexState {
  readonly coordinates: [number, number][];
  readonly cumulativeDistanceM: number[];
  points: readonly LocationTrackPoint[];
  readonly timesNs: bigint[];
}

const incrementalLocationSegmentIndexCache = new WeakMap<
  object,
  IncrementalLocationSegmentIndexState
>();

function indexLocationTrackSegment(
  segment: LocationTrackSegment,
): IndexedLocationTrackSegment {
  const cached = indexedLocationTrackSegmentCache.get(segment);
  if (cached) return cached;
  const storageKey = locationSegmentStorageKeys.get(segment);
  if (!storageKey) return buildLocationTrackSegmentIndex(segment);

  let state = incrementalLocationSegmentIndexCache.get(storageKey);
  let startIndex = 0;
  if (state && locationPointsExtendPrefix(state.points, segment.points)) {
    startIndex = state.points.length;
  } else {
    state = {
      coordinates: [],
      cumulativeDistanceM: [],
      points: [],
      timesNs: [],
    };
  }
  appendLocationSegmentIndex(state, segment.points, startIndex);
  state.points = segment.points;
  incrementalLocationSegmentIndexCache.set(storageKey, state);
  const indexed = indexedLocationSegmentStateSnapshot(
    state,
    segment.points,
    segment.points.length - startIndex,
  );
  indexedLocationTrackSegmentCache.set(segment, indexed);
  return indexed;
}

function buildLocationTrackSegmentIndex(
  segment: LocationTrackSegment,
): IndexedLocationTrackSegment {
  const state: IncrementalLocationSegmentIndexState = {
    coordinates: [],
    cumulativeDistanceM: [],
    points: [],
    timesNs: [],
  };
  appendLocationSegmentIndex(state, segment.points, 0);
  state.points = segment.points;
  const indexed = indexedLocationSegmentStateSnapshot(
    state,
    segment.points,
    segment.points.length,
  );
  indexedLocationTrackSegmentCache.set(segment, indexed);
  return indexed;
}

function appendLocationSegmentIndex(
  state: IncrementalLocationSegmentIndexState,
  points: readonly LocationTrackPoint[],
  startIndex: number,
): void {
  for (let index = startIndex; index < points.length; index += 1) {
    const point = points[index];
    state.coordinates.push([point.longitude, point.latitude]);
    state.timesNs.push(point.timeNs);
    state.cumulativeDistanceM.push(
      index === 0
        ? 0
        : state.cumulativeDistanceM[index - 1] +
            haversineDistanceMeters(points[index - 1], point),
    );
  }
}

function indexedLocationSegmentStateSnapshot(
  state: IncrementalLocationSegmentIndexState,
  points: readonly LocationTrackPoint[],
  buildPointCount: number,
): IndexedLocationTrackSegment {
  const pointCount = points.length;
  return {
    buildPointCount,
    coordinates: readonlyArrayView(
      pointCount,
      (index) => state.coordinates[index],
    ),
    cumulativeDistanceM: readonlyArrayView(
      pointCount,
      (index) => state.cumulativeDistanceM[index],
    ),
    endTimeNs: state.timesNs[pointCount - 1],
    points,
    startTimeNs: state.timesNs[0],
    timesNs: readonlyArrayView(pointCount, (index) => state.timesNs[index]),
    totalDistanceM: state.cumulativeDistanceM[pointCount - 1],
  };
}

function locationPointsExtendPrefix(
  previous: readonly LocationTrackPoint[],
  current: readonly LocationTrackPoint[],
): boolean {
  if (previous.length > current.length) return false;
  if (previous.length === 0) return true;
  return (
    previous[0] === current[0] &&
    previous[previous.length - 1] === current[previous.length - 1]
  );
}

const locationSegmentBoundsCache = new WeakMap<
  LocationTrackSegment,
  LocationBounds | null
>();

const incrementalLocationSegmentBoundsCache = new WeakMap<
  object,
  {
    readonly bounds: LocationBounds | null;
    readonly points: readonly LocationTrackPoint[];
  }
>();

function locationSegmentBounds(
  segment: LocationTrackSegment,
): LocationBounds | null {
  const cached = locationSegmentBoundsCache.get(segment);
  if (cached !== undefined) return cached;
  const storageKey = locationSegmentStorageKeys.get(segment);
  const previous = storageKey
    ? incrementalLocationSegmentBoundsCache.get(storageKey)
    : undefined;
  const extendsPrefix =
    previous && locationPointsExtendPrefix(previous.points, segment.points);
  let west = extendsPrefix
    ? (previous.bounds?.west ?? Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;
  let east = extendsPrefix
    ? (previous.bounds?.east ?? Number.NEGATIVE_INFINITY)
    : Number.NEGATIVE_INFINITY;
  let south = extendsPrefix
    ? (previous.bounds?.south ?? Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY;
  let north = extendsPrefix
    ? (previous.bounds?.north ?? Number.NEGATIVE_INFINITY)
    : Number.NEGATIVE_INFINITY;
  const startIndex = extendsPrefix ? previous.points.length : 0;
  for (let index = startIndex; index < segment.points.length; index += 1) {
    const point = segment.points[index];
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
  }
  const bounds =
    west === Number.POSITIVE_INFINITY ? null : { east, north, south, west };
  locationSegmentBoundsCache.set(segment, bounds);
  if (storageKey) {
    incrementalLocationSegmentBoundsCache.set(storageKey, {
      bounds,
      points: segment.points,
    });
  }
  return bounds;
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
