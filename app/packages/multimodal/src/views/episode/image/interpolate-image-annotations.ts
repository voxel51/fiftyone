/**
 * Pure geometry engine for interpolating decoded image annotations between two
 * cached annotation messages at a sub-message playhead position. Intentionally
 * free of React, cache, and timeline concerns so it can be unit-tested in
 * isolation; the React/cache wiring lives in `use-interpolated-image-annotations`.
 *
 * Annotations arrive ~2 Hz against ~12 Hz camera images. To bridge that gap
 * visually we lerp between the previous and next annotation message by fraction
 * `(now - prev_t) / (next_t - prev_t)`.
 *
 * Foxglove doesn't carry stable instance IDs across messages, so we group
 * LINE_LIST segments into per-object chunks, run a greedy label + geometry
 * matching pass between prev/next groups, and only lerp matched pairs. Unmatched
 * groups in prev stay put; unmatched groups in next don't appear until the next
 * message becomes current.
 */
import type {
  ImageAnnotationCircle,
  ImageAnnotationPoints,
  ImageAnnotationText,
  ImageAnnotationsVisualization,
} from "../../../ir";
import { groupLineSegmentsByLabel } from "../../../visualization/media-2d/line-segment-grouping";
import type { DecodedFrame } from "../../../ir";
import type {
  ImageAnnotationBounds,
  ImageAnnotationLineListGroup,
  ImageAnnotationRenderMetadata,
} from "../../../visualization/media-2d/image-annotation-render-metadata";

function interpolationFraction({
  nextTimelineTimeNs,
  playheadNs,
  previousTimelineTimeNs,
}: {
  readonly nextTimelineTimeNs: bigint;
  readonly playheadNs: bigint;
  readonly previousTimelineTimeNs: bigint;
}): number | null {
  const span = nextTimelineTimeNs - previousTimelineTimeNs;
  if (span <= 0n) return null;
  const elapsed = playheadNs - previousTimelineTimeNs;
  if (elapsed <= 0n) return null;
  const f = Number(elapsed) / Number(span);
  if (!Number.isFinite(f)) return null;
  return Math.min(1, f);
}

function vizOf(msg: DecodedFrame): ImageAnnotationsVisualization | null {
  const v = msg.output.visualization;
  if (!v || v.kind !== "image-annotations") return null;
  return v as ImageAnnotationsVisualization;
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

type Point2 = readonly [number, number];

const MATCH_DISTANCE_PX = 200;
const MIN_MATCH_IOU = 0.15;

interface PointTrack {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly x: number;
  readonly y: number;
}

interface CircleTrack {
  readonly deltaDiameter: number;
  readonly position: PointTrack;
  readonly previous: ImageAnnotationCircle;
}

interface TextTrack {
  readonly position: PointTrack | null;
  readonly previous: ImageAnnotationText;
}

interface PreparedLineGroup {
  readonly label: string | null;
  readonly previousBounds: ImageAnnotationBounds;
  readonly previousPoints: readonly Point2[];
  readonly previousSegments: readonly [Point2, Point2][];
  readonly segmentTracks: readonly [PointTrack, PointTrack][] | null;
}

type PreparedCircles =
  | {
      readonly kind: "interpolate";
      readonly tracks: readonly CircleTrack[];
    }
  | {
      readonly kind: "passthrough";
      readonly value: readonly ImageAnnotationCircle[];
    };

type PreparedPointPrimitive =
  | {
      readonly kind: "indexed";
      readonly pointTracks: readonly PointTrack[];
      readonly previous: ImageAnnotationPoints;
    }
  | {
      readonly groups: readonly PreparedLineGroup[];
      readonly kind: "line-list";
      readonly previous: ImageAnnotationPoints;
    }
  | {
      readonly groups: readonly ImageAnnotationLineListGroup[] | null;
      readonly kind: "passthrough";
      readonly value: ImageAnnotationPoints;
    };

type PreparedPoints =
  | {
      readonly items: readonly PreparedPointPrimitive[];
      readonly kind: "interpolate";
    }
  | {
      readonly kind: "passthrough";
      readonly renderMetadata: ImageAnnotationRenderMetadata;
      readonly value: readonly ImageAnnotationPoints[];
    };

interface SampledPoints {
  readonly lineListGroups: ImageAnnotationRenderMetadata["lineListGroups"];
  readonly points: readonly ImageAnnotationPoints[];
}

interface SampledLineList {
  readonly groups: readonly ImageAnnotationLineListGroup[];
  readonly primitive: ImageAnnotationPoints;
}

export interface SampledImageAnnotationInterpolation {
  readonly frame: ImageAnnotationsVisualization;
  readonly renderMetadata: ImageAnnotationRenderMetadata;
}

/** Fraction-independent render plan for one immutable annotation pair. */
export interface PreparedImageAnnotationInterpolation {
  readonly circles: PreparedCircles;
  readonly kind: ImageAnnotationsVisualization["kind"];
  readonly points: PreparedPoints;
  readonly texts: readonly TextTrack[];
}

/**
 * Performs all topology discovery and object matching once for a source-message
 * pair. The returned plan is immutable and safe to sample from every visual
 * playback tick.
 */
export function prepareImageAnnotationInterpolation(
  previous: ImageAnnotationsVisualization,
  next: ImageAnnotationsVisualization,
): PreparedImageAnnotationInterpolation {
  return {
    circles: prepareCircles(previous.circles, next.circles),
    kind: previous.kind,
    points: preparePoints(previous, next),
    texts: prepareTexts(previous.texts, next.texts),
  };
}

/** Allocates one immutable frame by applying only fraction-dependent lerps. */
export function sampleImageAnnotationInterpolation(
  prepared: PreparedImageAnnotationInterpolation,
  fraction: number,
): SampledImageAnnotationInterpolation {
  const sampledPoints = samplePoints(prepared.points, fraction);
  return {
    frame: {
      kind: prepared.kind,
      circles: sampleCircles(prepared.circles, fraction),
      points: sampledPoints.points,
      texts: sampleTexts(prepared.texts, fraction),
    },
    renderMetadata: {
      lineListGroups: sampledPoints.lineListGroups,
    },
  };
}

function interpolateImageAnnotations(
  prev: ImageAnnotationsVisualization,
  next: ImageAnnotationsVisualization,
  f: number,
): ImageAnnotationsVisualization {
  return sampleImageAnnotationInterpolation(
    prepareImageAnnotationInterpolation(prev, next),
    f,
  ).frame;
}

function prepareCircles(
  previous: readonly ImageAnnotationCircle[],
  next: readonly ImageAnnotationCircle[],
): PreparedCircles {
  if (previous.length !== next.length) {
    return { kind: "passthrough", value: previous };
  }
  return {
    kind: "interpolate",
    tracks: previous.map((circle, index) => ({
      deltaDiameter: next[index].diameter - circle.diameter,
      position: preparePointTrack(circle.position, next[index].position),
      previous: circle,
    })),
  };
}

function sampleCircles(
  prepared: PreparedCircles,
  fraction: number,
): readonly ImageAnnotationCircle[] {
  if (prepared.kind === "passthrough") return prepared.value;
  return prepared.tracks.map(({ deltaDiameter, position, previous }) => ({
    ...previous,
    diameter: previous.diameter + deltaDiameter * fraction,
    position: samplePointTrack(position, fraction),
  }));
}

function interpolateCircles(
  prev: readonly ImageAnnotationCircle[],
  next: readonly ImageAnnotationCircle[],
  f: number,
): readonly ImageAnnotationCircle[] {
  return sampleCircles(prepareCircles(prev, next), f);
}

function prepareTexts(
  previous: readonly ImageAnnotationText[],
  next: readonly ImageAnnotationText[],
): readonly TextTrack[] {
  const tracks: TextTrack[] = [];
  const usedNext = new Set<number>();
  for (const text of previous) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let index = 0; index < next.length; index++) {
      if (usedNext.has(index)) continue;
      const candidate = next[index];
      if (candidate.text !== text.text) continue;
      const distance = squaredDistance(text.position, candidate.position);
      if (distance < bestDist) {
        bestDist = distance;
        bestIdx = index;
      }
    }
    const matched =
      bestIdx !== -1 && bestDist <= MATCH_DISTANCE_PX * MATCH_DISTANCE_PX
        ? next[bestIdx]
        : null;
    if (matched) usedNext.add(bestIdx);
    tracks.push({
      position: matched
        ? preparePointTrack(text.position, matched.position)
        : null,
      previous: text,
    });
  }
  return tracks;
}

function sampleTexts(
  prepared: readonly TextTrack[],
  fraction: number,
): readonly ImageAnnotationText[] {
  return prepared.map(({ position, previous }) =>
    position
      ? { ...previous, position: samplePointTrack(position, fraction) }
      : previous,
  );
}

function interpolateTexts(
  prev: readonly ImageAnnotationText[],
  next: readonly ImageAnnotationText[],
  f: number,
): readonly ImageAnnotationText[] {
  return sampleTexts(prepareTexts(prev, next), f);
}

/**
 * Interpolation for the points array. LINE_LIST primitives usually carry
 * every cuboid in one big segment list; we split each into per-object
 * groups using the same chunking helper as the overlay, match groups between
 * prev and next, then lerp matched pairs. Non-line-list primitives fall back
 * to index-based interpolation.
 */
function interpolatePointsArray(
  prev: ImageAnnotationsVisualization,
  next: ImageAnnotationsVisualization,
  f: number,
): readonly ImageAnnotationPoints[] {
  return samplePoints(preparePoints(prev, next), f).points;
}

function preparePoints(
  previous: ImageAnnotationsVisualization,
  next: ImageAnnotationsVisualization,
): PreparedPoints {
  if (previous.points.length !== next.points.length) {
    return {
      kind: "passthrough",
      renderMetadata: prepareImageAnnotationRenderMetadata(previous),
      value: previous.points,
    };
  }

  return {
    items: previous.points.map((primitive, index) => {
      const nextPrimitive = next.points[index];
      if (primitive.type !== nextPrimitive.type) {
        return {
          groups:
            primitive.type === "line-list"
              ? prepareLineListRenderGroups(primitive, previous.texts)
              : null,
          kind: "passthrough",
          value: primitive,
        };
      }
      if (primitive.type === "line-list") {
        return prepareLineList(
          primitive,
          nextPrimitive,
          previous.texts,
          next.texts,
        );
      }
      if (primitive.points.length !== nextPrimitive.points.length) {
        return { groups: null, kind: "passthrough", value: primitive };
      }
      return {
        kind: "indexed",
        pointTracks: primitive.points.map((point, pointIndex) =>
          preparePointTrack(point, nextPrimitive.points[pointIndex]),
        ),
        previous: primitive,
      };
    }),
    kind: "interpolate",
  };
}

function samplePoints(
  prepared: PreparedPoints,
  fraction: number,
): SampledPoints {
  if (prepared.kind === "passthrough") {
    return {
      lineListGroups: prepared.renderMetadata.lineListGroups,
      points: prepared.value,
    };
  }
  const lineListGroups: (readonly ImageAnnotationLineListGroup[] | null)[] = [];
  const points: ImageAnnotationPoints[] = [];
  for (const item of prepared.items) {
    if (item.kind === "passthrough") {
      points.push(item.value);
      lineListGroups.push(item.groups);
      continue;
    }
    if (item.kind === "line-list") {
      const sampled = sampleLineList(item, fraction);
      points.push(sampled.primitive);
      lineListGroups.push(sampled.groups);
      continue;
    }
    points.push({
      ...item.previous,
      points: item.pointTracks.map((point) =>
        samplePointTrack(point, fraction),
      ),
    });
    lineListGroups.push(null);
  }
  return { lineListGroups, points };
}

function interpolateLineList(
  prevPrim: ImageAnnotationPoints,
  nextPrim: ImageAnnotationPoints,
  prevTexts: readonly ImageAnnotationText[],
  nextTexts: readonly ImageAnnotationText[],
  f: number,
): ImageAnnotationPoints {
  return sampleLineList(
    prepareLineList(prevPrim, nextPrim, prevTexts, nextTexts),
    f,
  ).primitive;
}

function prepareLineList(
  prevPrim: ImageAnnotationPoints,
  nextPrim: ImageAnnotationPoints,
  prevTexts: readonly ImageAnnotationText[],
  nextTexts: readonly ImageAnnotationText[],
): Extract<PreparedPointPrimitive, { readonly kind: "line-list" }> {
  const prevGroups = groupLineList(prevPrim.points, prevTexts);
  const nextGroups = groupLineList(nextPrim.points, nextTexts);
  const matchedPairs = matchLineListGroups(prevGroups, nextGroups);

  return {
    groups: matchedPairs.map(({ prev, next }) => ({
      label: prev.label,
      previousBounds: prev.bounds,
      previousPoints: prev.segments.flatMap(([a, b]) => [a, b]),
      previousSegments: prev.segments,
      segmentTracks:
        next && prev.segments.length === next.segments.length
          ? prev.segments.map(([previousA, previousB], index) => {
              const [nextA, nextB] = next.segments[index];
              return [
                preparePointTrack(previousA, nextA),
                preparePointTrack(previousB, nextB),
              ];
            })
          : null,
    })),
    kind: "line-list",
    previous: prevPrim,
  };
}

function sampleLineList(
  prepared: Extract<PreparedPointPrimitive, { readonly kind: "line-list" }>,
  fraction: number,
): SampledLineList {
  const groups: ImageAnnotationLineListGroup[] = [];
  const out: Point2[] = [];
  for (const {
    label,
    previousBounds,
    previousPoints,
    previousSegments,
    segmentTracks,
  } of prepared.groups) {
    if (!segmentTracks) {
      appendSegments(out, previousSegments);
      groups.push({
        bounds: previousBounds,
        label,
        points: previousPoints,
        segments: previousSegments,
      });
      continue;
    }
    const segments: [Point2, Point2][] = [];
    const points: Point2[] = [];
    for (const [a, b] of segmentTracks) {
      const sampledA = samplePointTrack(a, fraction);
      const sampledB = samplePointTrack(b, fraction);
      out.push(sampledA, sampledB);
      points.push(sampledA, sampledB);
      segments.push([sampledA, sampledB]);
    }
    groups.push({
      bounds: segmentsBounds(segments),
      label,
      points,
      segments,
    });
  }

  return {
    groups,
    primitive: { ...prepared.previous, points: out },
  };
}

interface MatchedGroupPair {
  readonly prev: Group;
  readonly next: Group | null;
}

function matchLineListGroups(
  prevGroups: readonly Group[],
  nextGroups: readonly Group[],
): readonly MatchedGroupPair[] {
  // Per-prev candidate selection:
  //   1. Same label class (hard).
  //   2. Centroid within MATCH_DISTANCE_PX (coarse position filter).
  //   3. AABB IoU above MIN_IOU (rejects gross size mismatches —
  //      e.g. a parked truck near a passing sedan).
  //   4. Among survivors, pick the lowest symmetric Chamfer distance
  //      over the cuboid's unique vertices (shape similarity tiebreak).
  // Greedy: first prev to claim a next wins.
  const usedNext = new Set<number>();
  return prevGroups.map((prev) => {
    const nextIndex = bestNextGroupIndex(prev, nextGroups, usedNext);
    if (nextIndex === -1) return { prev, next: null };
    usedNext.add(nextIndex);
    return { prev, next: nextGroups[nextIndex] };
  });
}

function bestNextGroupIndex(
  prev: Group,
  nextGroups: readonly Group[],
  usedNext: ReadonlySet<number>,
): number {
  let bestIdx = -1;
  let bestScore = Infinity;
  const distSqThreshold = MATCH_DISTANCE_PX * MATCH_DISTANCE_PX;
  for (let i = 0; i < nextGroups.length; i++) {
    if (usedNext.has(i)) continue;
    const next = nextGroups[i];
    if (next.label !== prev.label) continue;
    if (squaredDistance(prev.centroid, next.centroid) > distSqThreshold) {
      continue;
    }
    if (aabbIoU(prev.bounds, next.bounds) < MIN_MATCH_IOU) continue;
    const score = chamferDistance(prev.vertices, next.vertices);
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function appendSegments(
  out: Point2[],
  segments: readonly [Point2, Point2][],
): void {
  for (const [a, b] of segments) {
    out.push(a, b);
  }
}

// ---------------------------------------------------------------------------
// Line-list grouping (mirror of the overlay's render path)
// ---------------------------------------------------------------------------

interface Group {
  readonly segments: readonly [Point2, Point2][];
  readonly centroid: Point2;
  readonly bounds: Bounds;
  readonly vertices: readonly Point2[];
  readonly label: string | null;
}

function groupLineList(
  points: readonly Point2[],
  texts: readonly ImageAnnotationText[],
): readonly Group[] {
  return groupLineSegmentsByLabel(points, texts).map(({ label, segments }) =>
    makeGroup(segments, label),
  );
}

/** Prepares renderer grouping once for a non-interpolated annotation frame. */
export function prepareImageAnnotationRenderMetadata(
  frame: ImageAnnotationsVisualization,
): ImageAnnotationRenderMetadata {
  return {
    lineListGroups: frame.points.map((primitive) =>
      primitive.type === "line-list"
        ? prepareLineListRenderGroups(primitive, frame.texts)
        : null,
    ),
  };
}

function prepareLineListRenderGroups(
  primitive: ImageAnnotationPoints,
  texts: readonly ImageAnnotationText[],
): readonly ImageAnnotationLineListGroup[] {
  return groupLineSegmentsByLabel(primitive.points, texts).map(
    ({ label, segments }) => ({
      bounds: segmentsBounds(segments),
      label,
      points: segments.flatMap(([a, b]) => [a, b]),
      segments,
    }),
  );
}

function makeGroup(
  segments: readonly [Point2, Point2][],
  label: string | null,
): Group {
  const bounds = segmentsBounds(segments);
  const centroid: Point2 = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
  ];
  return {
    segments,
    centroid,
    bounds,
    vertices: uniqueVertices(segments),
    label,
  };
}

function uniqueVertices(
  segments: readonly [Point2, Point2][],
): readonly Point2[] {
  const seen = new Set<string>();
  const out: Point2[] = [];
  for (const [a, b] of segments) {
    for (const p of [a, b]) {
      const k = `${Math.round(p[0] * 100)}|${Math.round(p[1] * 100)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

function aabbIoU(a: Bounds, b: Bounds): number {
  const x1 = Math.max(a.minX, b.minX);
  const y1 = Math.max(a.minY, b.minY);
  const x2 = Math.min(a.maxX, b.maxX);
  const y2 = Math.min(a.maxY, b.maxY);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const areaA = Math.max(0, a.maxX - a.minX) * Math.max(0, a.maxY - a.minY);
  const areaB = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Symmetric Chamfer distance between two point sets — average nearest-
 * neighbour distance from A→B plus from B→A, halved. Small values mean
 * the two cuboid wireframes have similar vertex layouts (good match).
 */
function chamferDistance(a: readonly Point2[], b: readonly Point2[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  let sumAB = 0;
  for (const pa of a) {
    let minD = Infinity;
    for (const pb of b) {
      const d = squaredDistance(pa, pb);
      if (d < minD) minD = d;
    }
    sumAB += Math.sqrt(minD);
  }
  let sumBA = 0;
  for (const pb of b) {
    let minD = Infinity;
    for (const pa of a) {
      const d = squaredDistance(pa, pb);
      if (d < minD) minD = d;
    }
    sumBA += Math.sqrt(minD);
  }
  return (sumAB / a.length + sumBA / b.length) / 2;
}

type Bounds = ImageAnnotationBounds;

function segmentsBounds(segments: readonly [Point2, Point2][]): Bounds {
  if (segments.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [[x1, y1], [x2, y2]] of segments) {
    if (x1 < minX) minX = x1;
    if (x2 < minX) minX = x2;
    if (x1 > maxX) maxX = x1;
    if (x2 > maxX) maxX = x2;
    if (y1 < minY) minY = y1;
    if (y2 < minY) minY = y2;
    if (y1 > maxY) maxY = y1;
    if (y2 > maxY) maxY = y2;
  }
  return { minX, minY, maxX, maxY };
}

function squaredDistance(a: Point2, b: Point2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function preparePointTrack(previous: Point2, next: Point2): PointTrack {
  return {
    deltaX: next[0] - previous[0],
    deltaY: next[1] - previous[1],
    x: previous[0],
    y: previous[1],
  };
}

function samplePointTrack(track: PointTrack, fraction: number): Point2 {
  return [track.x + track.deltaX * fraction, track.y + track.deltaY * fraction];
}

function lowerBoundBigInt(arr: readonly bigint[], target: bigint): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export {
  aabbIoU,
  chamferDistance,
  interpolateCircles,
  interpolateImageAnnotations,
  interpolateLineList,
  interpolatePointsArray,
  interpolateTexts,
  interpolationFraction,
  lowerBoundBigInt,
  makeGroup,
  matchLineListGroups,
  vizOf,
};
export type { Group, Point2 };
