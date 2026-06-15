import { usePlayhead } from "@fiftyone/playback";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import type {
  ImageAnnotationCircle,
  ImageAnnotationPoints,
  ImageAnnotationText,
  ImageAnnotationsVisualization,
} from "../../../decoders";
import { groupLineSegmentsByLabel } from "../../../utils/line-segment-grouping";
import type { McapDecodedMessage } from "../types";
import {
  useMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import type { McapTopicCache } from "./mcap-topic-cache";

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
 * Foxglove doesn't carry stable instance IDs across messages, so we group
 * LINE_LIST segments into per-object chunks, run a greedy label + geometry
 * matching pass between prev/next groups, and only lerp matched pairs.
 * Unmatched groups in prev stay put; unmatched groups in next don't appear
 * until the next message becomes current.
 */
export interface UseInterpolatedImageAnnotationsOptions {
  /** When false, returns the current annotation as-is with no lerping. */
  readonly interpolate?: boolean;
}

const EMPTY_TOPICS: readonly string[] = [];
// Forward-scan budget when searching for the next distinct annotation to lerp
// toward. Coupled to the ~30 Hz timeline tick rate: 120 ticks ≈ 4s, which
// comfortably spans the ~2 Hz annotation cadence. If the tick rate changes,
// revisit this — set too low, sparse annotations silently stop interpolating.
const MAX_NEXT_MESSAGE_SCAN_TICKS = 120;

export function useInterpolatedImageAnnotations(
  topic: string,
  { interpolate = true }: UseInterpolatedImageAnnotationsOptions = {}
): ImageAnnotationsVisualization | null {
  const topics = useMemo(() => (topic ? [topic] : EMPTY_TOPICS), [topic]);
  const sets = useInterpolatedImageAnnotationSets(topics, { interpolate });
  return sets[0]?.frame ?? null;
}

/**
 * Returns decoded image-annotation visualizations for every selected
 * annotation topic, in topic order, omitting topics with no frame at the
 * current playhead.
 */
export function useInterpolatedImageAnnotationSets(
  topics: readonly string[],
  { interpolate = true }: UseInterpolatedImageAnnotationsOptions = {}
): readonly {
  readonly frame: ImageAnnotationsVisualization;
  readonly topic: string;
}[] {
  const stableTopics = useStableTopics(topics);
  const dataStream = useMcapDataStream();
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const streamRef = useRef<McapDataStream | null>(null);
  const topicSet = useMemo(() => new Set(stableTopics), [stableTopics]);

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;

    if (streamRef.current !== dataStream) {
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
      streamRef.current = dataStream;
    }
    if (!dataStream) return;

    for (const [topic, unsubscribe] of subscriptions) {
      if (!topicSet.has(topic)) {
        unsubscribe();
        subscriptions.delete(topic);
      }
    }
    for (const topic of stableTopics) {
      if (!subscriptions.has(topic)) {
        subscriptions.set(topic, dataStream.subscribeToTopic(topic));
      }
    }
  }, [dataStream, stableTopics, topicSet]);

  useEffect(
    () => () => {
      for (const unsubscribe of subscriptionsRef.current.values()) {
        unsubscribe();
      }
      subscriptionsRef.current.clear();
    },
    []
  );

  // Re-render every RAF tick so the lerp tracks the playhead.
  const playhead = usePlayhead();
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const cacheSnapshot = useTopicCacheSnapshot(dataStream, stableTopics);

  return useMemo(
    () =>
      annotationSetsFromCaches({
        cacheSnapshot,
        dataStream,
        interpolate,
        playhead,
        timeline,
        topics: stableTopics,
      }),
    [cacheSnapshot, dataStream, interpolate, playhead, stableTopics, timeline]
  );
}

interface AnnotationSetsFromCachesArgs {
  /** Invalidation token from `useSyncExternalStore`; frame derivation reads caches below. */
  readonly cacheSnapshot: string;
  readonly dataStream: McapDataStream | null;
  readonly interpolate: boolean;
  readonly playhead: number;
  readonly timeline: McapTimelineIndex | null;
  readonly topics: readonly string[];
}

function annotationSetsFromCaches({
  dataStream,
  interpolate,
  playhead,
  timeline,
  topics,
}: AnnotationSetsFromCachesArgs): readonly {
  readonly frame: ImageAnnotationsVisualization;
  readonly topic: string;
}[] {
  if (!dataStream || !timeline) return [];

  const sets: {
    frame: ImageAnnotationsVisualization;
    topic: string;
  }[] = [];
  for (const topic of topics) {
    const cache = dataStream.getTopicCache(topic);
    const frame = cache
      ? currentAnnotationFrame({
          cache,
          interpolate,
          playhead,
          timeline,
        })
      : null;
    if (frame) {
      sets.push({ frame, topic });
    }
  }
  return sets;
}

function useStableTopics(topics: readonly string[]): readonly string[] {
  // Memoize on the joined contents rather than array identity, so callers can
  // pass a fresh array every render without churning the downstream memo and
  // external-store subscriptions. A newline can't appear in a topic name, so
  // equal lists always yield the same key. Keying here keeps it concurrent-safe,
  // unlike caching it through a ref written during render.
  const normalized = normalizeTopics(topics);
  const key = normalized.join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the content digest of `normalized`
  return useMemo(() => normalized, [key]);
}

function useTopicCacheSnapshot(
  dataStream: McapDataStream | null,
  topics: readonly string[]
): string {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!dataStream || topics.length === 0) return () => undefined;
      // Only caches that already exist are observed. This is safe because the
      // data stream creates every topic cache before it publishes itself, so by
      // the time `dataStream` is non-null the caches exist. If a topic's cache
      // could appear *after* this subscription runs, its revision bumps would go
      // unseen — bump a dependency here to re-subscribe in that case.
      const unsubscribeFns: (() => void)[] = [];
      for (const topic of topics) {
        const cache = dataStream.getTopicCache(topic);
        if (cache) {
          unsubscribeFns.push(cache.subscribeToChanges(onStoreChange));
        }
      }
      return () => {
        for (const unsubscribe of unsubscribeFns) unsubscribe();
      };
    },
    [dataStream, topics]
  );

  const getSnapshot = useCallback(
    () => topicCacheSnapshot(dataStream, topics),
    [dataStream, topics]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function topicCacheSnapshot(
  dataStream: McapDataStream | null,
  topics: readonly string[]
): string {
  if (!dataStream || topics.length === 0) return "";
  let snapshot = "";
  for (const topic of topics) {
    const revision = dataStream.getTopicCache(topic)?.revision ?? -1;
    snapshot += `${topic}:${revision}|`;
  }
  return snapshot;
}

function normalizeTopics(topics: readonly string[]): readonly string[] {
  if (topics.length === 0) return EMPTY_TOPICS;
  let hasEmptyTopic = false;
  for (const topic of topics) {
    if (!topic) {
      hasEmptyTopic = true;
      break;
    }
  }
  if (!hasEmptyTopic) return topics;

  const normalized: string[] = [];
  for (const topic of topics) {
    if (topic) normalized.push(topic);
  }
  return normalized.length > 0 ? normalized : EMPTY_TOPICS;
}

function currentAnnotationFrame({
  cache,
  interpolate,
  playhead,
  timeline,
}: {
  readonly cache: McapTopicCache;
  readonly interpolate: boolean;
  readonly playhead: number;
  readonly timeline: McapTimelineIndex;
}): ImageAnnotationsVisualization | null {
  const currentTick = timeline.nearestTick(playhead);
  if (currentTick === undefined) return null;
  const currentMsg = cache.get(currentTick);
  if (!currentMsg) return null;
  const currentViz = vizOf(currentMsg);
  if (!currentViz) return null;
  if (!interpolate) return currentViz;

  const nextMsg = nextDistinctAnnotationMessage({
    cache,
    currentTick,
    currentTimelineTimeNs: currentMsg.timelineTimeNs,
    timeline,
  });
  if (!nextMsg) return currentViz;
  const nextViz = vizOf(nextMsg);
  if (!nextViz) return currentViz;

  const f = interpolationFraction({
    nextTimelineTimeNs: nextMsg.timelineTimeNs,
    playheadNs: timeline.secToNs(playhead),
    previousTimelineTimeNs: currentMsg.timelineTimeNs,
  });
  if (f === null) return currentViz;

  return interpolateImageAnnotations(currentViz, nextViz, f);
}

function nextDistinctAnnotationMessage({
  cache,
  currentTick,
  currentTimelineTimeNs,
  timeline,
}: {
  readonly cache: McapTopicCache;
  readonly currentTick: bigint;
  readonly currentTimelineTimeNs: bigint;
  readonly timeline: McapTimelineIndex;
}): McapDecodedMessage | null {
  // Ticks are synchronized with LATEST semantics, so several cached ticks can
  // point to the same source annotation. Walk forward only far enough to find
  // the next cached source message; if lookahead is missing, staying on the
  // current frame is cheaper and visually safer than scanning the full file.
  const startIndex = lowerBoundBigInt(timeline.ticks, currentTick) + 1;
  const endIndex = Math.min(
    timeline.ticks.length,
    startIndex + MAX_NEXT_MESSAGE_SCAN_TICKS
  );
  for (let i = startIndex; i < endIndex; i++) {
    const msg = cache.get(timeline.ticks[i]);
    if (msg && msg.timelineTimeNs !== currentTimelineTimeNs) return msg;
  }
  return null;
}

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
 * Interpolation for the points array. LINE_LIST primitives usually carry
 * every cuboid in one big segment list; we split each into per-object
 * groups using the same chunking helper as the overlay, match groups between
 * prev and next, then lerp matched pairs. Non-line-list primitives fall back
 * to index-based interpolation.
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
  const matchedPairs = matchLineListGroups(prevGroups, nextGroups);

  const out: Point2[] = [];
  for (const { prev, next } of matchedPairs) {
    appendInterpolatedSegments(out, prev, next, f);
  }

  return { ...prevPrim, points: out };
}

interface MatchedGroupPair {
  readonly prev: Group;
  readonly next: Group | null;
}

function matchLineListGroups(
  prevGroups: readonly Group[],
  nextGroups: readonly Group[]
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
  usedNext: ReadonlySet<number>
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

function appendInterpolatedSegments(
  out: Point2[],
  prev: Group,
  next: Group | null,
  f: number
): void {
  if (!next || prev.segments.length !== next.segments.length) {
    appendSegments(out, prev.segments);
    return;
  }
  for (let i = 0; i < prev.segments.length; i++) {
    const [pa, pb] = prev.segments[i];
    const [na, nb] = next.segments[i];
    out.push(lerpPoint(pa, na, f), lerpPoint(pb, nb, f));
  }
}

function appendSegments(
  out: Point2[],
  segments: readonly [Point2, Point2][]
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
