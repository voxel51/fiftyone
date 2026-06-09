import { playheadAtom, usePlaybackStore } from "@fiftyone/playback";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";

import type {
  ImageAnnotationCircle,
  ImageAnnotationPoints,
  ImageAnnotationText,
  ImageAnnotationsVisualization,
} from "../../../decoders";
import { groupLineSegmentsByLabel } from "../line-segment-grouping";
import type { McapDecodedMessage } from "../types";
import { useMcapDataStream } from "./mcap-data-stream-context";

/**
 * Returns the annotation visualization for `topic` at the current playhead,
 * interpolated between the surrounding annotation messages when both are
 * cached. Falls back to the latest available message when the next one
 * isn't cached yet.
 *
 * Annotations arrive ~2 Hz against ~12 Hz camera images. To bridge that
 * gap visually we lerp between the prev and next annotation message by
 * fraction `(now - prev_t) / (next_t - prev_t)`.
 *
 * Foxglove doesn't carry stable instance IDs across messages, so we run a
 * greedy nearest-centroid matching pass between prev and next groups
 * (connected-component clusters of the LINE_LIST segments, keyed by their
 * inferred label) and only lerp matched pairs. Unmatched groups in prev
 * stay put; unmatched groups in next don't appear until the next message
 * becomes current.
 */
export interface UseInterpolatedImageAnnotationsOptions {
  /** When false, returns the current annotation as-is with no lerping. */
  readonly interpolate?: boolean;
}

export function useInterpolatedImageAnnotations(
  topic: string,
  { interpolate = true }: UseInterpolatedImageAnnotationsOptions = {}
): ImageAnnotationsVisualization | null {
  const store = usePlaybackStore();
  const dataStream = useMcapDataStream();

  useEffect(() => {
    if (!topic || !dataStream) return undefined;
    return dataStream.subscribeToTopic(topic);
  }, [topic, dataStream]);

  // Re-render every RAF tick so the lerp tracks the playhead.
  const playhead = useAtomValue(playheadAtom, { store });

  const cache = dataStream?.getTopicCache(topic);
  const timeline = dataStream?.getTimelineIndex() ?? null;

  return useMemo<ImageAnnotationsVisualization | null>(() => {
    if (!cache || !timeline) return null;

    const currentTick = timeline.nearestTick(playhead);
    if (currentTick === undefined) return null;
    const currentMsg = cache.get(currentTick);
    if (!currentMsg) return null;
    const currentViz = vizOf(currentMsg);
    if (!currentViz) return null;
    if (!interpolate) return currentViz;

    // Find next distinct annotation (different timeline time). Cached
    // ticks return the latest <= tick under LATEST sync, so consecutive
    // ticks alias the same source message until the next one lands.
    const ticks = timeline.ticks;
    let lo = 0;
    let hi = ticks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ticks[mid] < currentTick) lo = mid + 1;
      else hi = mid;
    }
    let nextMsg: McapDecodedMessage | null = null;
    for (let i = lo + 1; i < ticks.length; i++) {
      const m = cache.get(ticks[i]);
      if (m && m.timelineTimeNs !== currentMsg.timelineTimeNs) {
        nextMsg = m;
        break;
      }
    }
    if (!nextMsg) return currentViz;
    const nextViz = vizOf(nextMsg);
    if (!nextViz) return currentViz;

    const span = nextMsg.timelineTimeNs - currentMsg.timelineTimeNs;
    if (span <= 0n) return currentViz;
    const playheadNs = timeline.secToNs(playhead);
    const elapsed = playheadNs - currentMsg.timelineTimeNs;
    let f = Number(elapsed) / Number(span);
    if (!Number.isFinite(f) || f <= 0) return currentViz;
    if (f >= 1) f = 1;

    return interpolateImageAnnotations(currentViz, nextViz, f);
  }, [cache, timeline, playhead, interpolate]);
}

function vizOf(msg: McapDecodedMessage): ImageAnnotationsVisualization | null {
  const v = msg.decoded.output.visualization;
  if (!v || v.kind !== "image-annotations") return null;
  return v as ImageAnnotationsVisualization;
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

type Point2 = readonly [number, number];

const MATCH_DISTANCE_PX = 200;
const MIN_MATCH_IOU = 0.15;

function interpolateImageAnnotations(
  prev: ImageAnnotationsVisualization,
  next: ImageAnnotationsVisualization,
  f: number
): ImageAnnotationsVisualization {
  return {
    kind: prev.kind,
    circles: interpolateCircles(prev.circles, next.circles, f),
    points: interpolatePointsArray(prev, next, f),
    texts: interpolateTexts(prev.texts, next.texts, f),
  };
}

function interpolateCircles(
  prev: readonly ImageAnnotationCircle[],
  next: readonly ImageAnnotationCircle[],
  f: number
): readonly ImageAnnotationCircle[] {
  // Index matching is acceptable for circles — they're rare in this data
  // and tend to stay in order; if counts differ we just keep prev.
  if (prev.length !== next.length) return prev;
  return prev.map((p, i) => {
    const n = next[i];
    return {
      ...p,
      position: lerpPoint(p.position, n.position, f),
      diameter: lerp(p.diameter, n.diameter, f),
    };
  });
}

function interpolateTexts(
  prev: readonly ImageAnnotationText[],
  next: readonly ImageAnnotationText[],
  f: number
): readonly ImageAnnotationText[] {
  // Match texts by `text` content + nearest position, greedy per content.
  const out: ImageAnnotationText[] = [];
  const usedNext = new Set<number>();
  for (const p of prev) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < next.length; j++) {
      if (usedNext.has(j)) continue;
      const n = next[j];
      if (n.text !== p.text) continue;
      const d = squaredDistance(p.position, n.position);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }
    if (bestIdx === -1 || bestDist > MATCH_DISTANCE_PX * MATCH_DISTANCE_PX) {
      out.push(p);
      continue;
    }
    usedNext.add(bestIdx);
    const n = next[bestIdx];
    out.push({ ...p, position: lerpPoint(p.position, n.position, f) });
  }
  return out;
}

/**
 * Interpolation for the points array. LINE_LIST primitives carry every
 * cuboid in one big segment list; we split each into per-object groups
 * via connected components, match groups between prev and next by label
 * + centroid proximity, then lerp matched pairs. Non-line-list primitives
 * fall back to index-based interpolation.
 */
function interpolatePointsArray(
  prev: ImageAnnotationsVisualization,
  next: ImageAnnotationsVisualization,
  f: number
): readonly ImageAnnotationPoints[] {
  if (prev.points.length !== next.points.length) return prev.points;
  return prev.points.map((pp, idx) => {
    const np = next.points[idx];
    if (pp.type !== np.type) return pp;
    if (pp.type === "line-list") {
      return interpolateLineList(pp, np, prev.texts, next.texts, f);
    }
    if (pp.points.length !== np.points.length) return pp;
    return {
      ...pp,
      points: pp.points.map((pt, j) => lerpPoint(pt, np.points[j], f)),
    };
  });
}

function interpolateLineList(
  prevPrim: ImageAnnotationPoints,
  nextPrim: ImageAnnotationPoints,
  prevTexts: readonly ImageAnnotationText[],
  nextTexts: readonly ImageAnnotationText[],
  f: number
): ImageAnnotationPoints {
  const prevGroups = groupLineList(prevPrim.points, prevTexts);
  const nextGroups = groupLineList(nextPrim.points, nextTexts);

  // Per-prev candidate selection:
  //   1. Same label class (hard).
  //   2. Centroid within MATCH_DISTANCE_PX (coarse position filter).
  //   3. AABB IoU above MIN_IOU (rejects gross size mismatches —
  //      e.g. a parked truck near a passing sedan).
  //   4. Among survivors, pick the lowest symmetric Chamfer distance
  //      over the cuboid's unique vertices (shape similarity tiebreak).
  // Greedy: first prev to claim a next wins.
  const usedNext = new Set<number>();
  const matchedPairs: { prev: Group; next: Group | null }[] = prevGroups.map(
    (pg) => {
      let bestIdx = -1;
      let bestScore = Infinity;
      const distSqThreshold = MATCH_DISTANCE_PX * MATCH_DISTANCE_PX;
      for (let j = 0; j < nextGroups.length; j++) {
        if (usedNext.has(j)) continue;
        const ng = nextGroups[j];
        if (ng.label !== pg.label) continue;
        if (squaredDistance(pg.centroid, ng.centroid) > distSqThreshold) {
          continue;
        }
        if (aabbIoU(pg.bounds, ng.bounds) < MIN_MATCH_IOU) continue;
        const score = chamferDistance(pg.vertices, ng.vertices);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = j;
        }
      }
      if (bestIdx === -1) return { prev: pg, next: null };
      usedNext.add(bestIdx);
      return { prev: pg, next: nextGroups[bestIdx] };
    }
  );

  const out: Point2[] = [];
  for (const { prev, next } of matchedPairs) {
    if (!next || prev.segments.length !== next.segments.length) {
      for (const [a, b] of prev.segments) {
        out.push(a, b);
      }
      continue;
    }
    for (let i = 0; i < prev.segments.length; i++) {
      const [pa, pb] = prev.segments[i];
      const [na, nb] = next.segments[i];
      out.push(lerpPoint(pa, na, f), lerpPoint(pb, nb, f));
    }
  }

  return { ...prevPrim, points: out };
}

// ---------------------------------------------------------------------------
// Connected-component grouping (mirror of the overlay's render path)
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
  texts: readonly ImageAnnotationText[]
): readonly Group[] {
  return groupLineSegmentsByLabel(points, texts).map(({ label, segments }) =>
    makeGroup(segments, label)
  );
}

function makeGroup(
  segments: readonly [Point2, Point2][],
  label: string | null
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
  segments: readonly [Point2, Point2][]
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

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function segmentsBounds(segments: readonly [Point2, Point2][]): Bounds {
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

function lerpPoint(a: Point2, b: Point2, f: number): Point2 {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}
