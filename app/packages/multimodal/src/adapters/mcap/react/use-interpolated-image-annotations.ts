import { usePlayhead } from "@fiftyone/playback";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import type { ImageAnnotationsVisualization } from "../../../decoders";
import type { ImageAnnotationRenderMetadata } from "../../../visualization/panels/image-annotation-render-metadata";
import type { McapDecodedMessage } from "../types";
import {
  interpolationFraction,
  prepareImageAnnotationInterpolation,
  prepareImageAnnotationRenderMetadata,
  sampleImageAnnotationInterpolation,
  type PreparedImageAnnotationInterpolation,
  vizOf,
} from "./interpolate-image-annotations";
import {
  useMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import type { McapTopicCache } from "./mcap-topic-cache";

/** Options for the interpolated image-annotation hooks. */
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

/**
 * Single-topic convenience wrapper over {@link useInterpolatedImageAnnotationSets}.
 * Returns the interpolated image-annotation visualization for `topic` at the
 * current playhead, or `null` when no frame is available. Pass
 * `{ interpolate: false }` for the current frame at the playhead without lerping.
 */
export function useInterpolatedImageAnnotations(
  topic: string,
  { interpolate = true }: UseInterpolatedImageAnnotationsOptions = {},
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
  { interpolate = true }: UseInterpolatedImageAnnotationsOptions = {},
): readonly {
  readonly frame: ImageAnnotationsVisualization;
  readonly renderMetadata: ImageAnnotationRenderMetadata;
  readonly topic: string;
}[] {
  const stableTopics = useStableTopics(topics);
  const dataStream = useMcapDataStream();
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const streamRef = useRef<McapDataStream | null>(null);
  const topicSet = useMemo(() => new Set(stableTopics), [stableTopics]);

  // This effect syncs topic subscriptions with the data stream and topic list.
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

  // This effect releases all topic subscriptions when the hook unmounts.
  useEffect(
    () => () => {
      for (const unsubscribe of subscriptionsRef.current.values()) {
        unsubscribe();
      }
      subscriptionsRef.current.clear();
    },
    [],
  );

  // Re-render every RAF tick so the lerp tracks the playhead.
  const playhead = usePlayhead();
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const cacheSnapshot = useTopicCacheSnapshot(dataStream, stableTopics);
  // Fresh caches whenever the stream or timeline changes so entries keyed by
  // now-unreachable visualization objects don't linger.
  const interpolationCache = useMemo<InterpolationCache>(
    () => new WeakMap(),
    [dataStream, timeline],
  );
  const nextMessageCache = useMemo<
    WeakMap<McapTopicCache, NextMessageCacheEntry>
  >(() => new WeakMap(), [dataStream, timeline]);
  const renderMetadataCache = useMemo<RenderMetadataCache>(
    () => new WeakMap(),
    [dataStream, timeline],
  );

  return useMemo(
    () =>
      annotationSetsFromCaches({
        cacheSnapshot,
        dataStream,
        interpolate,
        interpolationCache,
        nextMessageCache,
        playhead,
        renderMetadataCache,
        timeline,
        topics: stableTopics,
      }),
    [
      cacheSnapshot,
      dataStream,
      interpolate,
      interpolationCache,
      nextMessageCache,
      playhead,
      renderMetadataCache,
      stableTopics,
      timeline,
    ],
  );
}

type InterpolationCache = WeakMap<
  ImageAnnotationsVisualization,
  WeakMap<ImageAnnotationsVisualization, PreparedImageAnnotationInterpolation>
>;

interface NextMessageCacheEntry {
  readonly currentIndex: number;
  readonly currentMessage: McapDecodedMessage;
  readonly nextIndex: number | null;
  readonly nextMessage: McapDecodedMessage | null;
  readonly revision: number;
  readonly timeline: McapTimelineIndex;
}

type RenderMetadataCache = WeakMap<
  ImageAnnotationsVisualization,
  ImageAnnotationRenderMetadata
>;

interface AnnotationSetsFromCachesArgs {
  /** Invalidation token from `useSyncExternalStore`; frame derivation reads caches below. */
  readonly cacheSnapshot: string;
  readonly dataStream: McapDataStream | null;
  readonly interpolate: boolean;
  readonly interpolationCache: InterpolationCache;
  readonly nextMessageCache: WeakMap<McapTopicCache, NextMessageCacheEntry>;
  readonly playhead: number;
  readonly renderMetadataCache: RenderMetadataCache;
  readonly timeline: McapTimelineIndex | null;
  readonly topics: readonly string[];
}

function annotationSetsFromCaches({
  dataStream,
  interpolate,
  interpolationCache,
  nextMessageCache,
  playhead,
  renderMetadataCache,
  timeline,
  topics,
}: AnnotationSetsFromCachesArgs): readonly {
  readonly frame: ImageAnnotationsVisualization;
  readonly renderMetadata: ImageAnnotationRenderMetadata;
  readonly topic: string;
}[] {
  if (!dataStream || !timeline) return [];

  const sets: {
    frame: ImageAnnotationsVisualization;
    renderMetadata: ImageAnnotationRenderMetadata;
    topic: string;
  }[] = [];
  for (const topic of topics) {
    const cache = dataStream.getTopicCache(topic);
    const frame = cache
      ? currentAnnotationFrame({
          cache,
          interpolate,
          interpolationCache,
          nextMessageCache,
          playhead,
          renderMetadataCache,
          timeline,
        })
      : null;
    if (frame) {
      sets.push({ ...frame, topic });
    }
  }
  return sets;
}

/**
 * Returns a referentially stable, empty-topic-free copy of `topics` that only
 * changes identity when the topic *contents* change. Lets callers pass a fresh
 * array each render without re-triggering the subscription effects or the
 * `useSyncExternalStore` snapshot below.
 */
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

/**
 * Subscribes to the per-topic cache revisions via `useSyncExternalStore` and
 * returns a `"topic:revision|"` digest string. The digest changes whenever a
 * watched cache bumps its revision (frames arrive, change, or are cleared),
 * which is what drives the hook to re-derive annotation frames as data streams in.
 * Shared with `use-interpolated-scene-updates`.
 */
export function useTopicCacheSnapshot(
  dataStream: McapDataStream | null,
  topics: readonly string[],
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
    [dataStream, topics],
  );

  const getSnapshot = useCallback(
    () => topicCacheSnapshot(dataStream, topics),
    [dataStream, topics],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function topicCacheSnapshot(
  dataStream: McapDataStream | null,
  topics: readonly string[],
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
  const normalized: string[] = [];
  const seen = new Set<string>();
  let changed = false;
  for (const topic of topics) {
    if (!topic) {
      changed = true;
      continue;
    }
    if (seen.has(topic)) {
      changed = true;
      continue;
    }
    seen.add(topic);
    normalized.push(topic);
  }
  if (!changed) return topics;
  return normalized.length > 0 ? normalized : EMPTY_TOPICS;
}

function currentAnnotationFrame({
  cache,
  interpolate,
  interpolationCache,
  nextMessageCache,
  playhead,
  renderMetadataCache,
  timeline,
}: {
  readonly cache: McapTopicCache;
  readonly interpolate: boolean;
  readonly interpolationCache: InterpolationCache;
  readonly nextMessageCache: WeakMap<McapTopicCache, NextMessageCacheEntry>;
  readonly playhead: number;
  readonly renderMetadataCache: RenderMetadataCache;
  readonly timeline: McapTimelineIndex;
}): {
  readonly frame: ImageAnnotationsVisualization;
  readonly renderMetadata: ImageAnnotationRenderMetadata;
} | null {
  const currentTick = timeline.nearestTick(playhead);
  if (currentTick === undefined) return null;
  const currentMsg = cache.get(currentTick);
  if (!currentMsg) return null;
  const currentViz = vizOf(currentMsg);
  if (!currentViz) return null;
  if (!interpolate) {
    return annotationFrameWithMetadata(renderMetadataCache, currentViz);
  }

  const nextMsg = nextDistinctCachedMessage({
    cache,
    currentTick,
    currentTimelineTimeNs: currentMsg.timelineTimeNs,
    lookupCache: nextMessageCache,
    currentMessage: currentMsg,
    timeline,
  });
  if (!nextMsg) {
    return annotationFrameWithMetadata(renderMetadataCache, currentViz);
  }
  const nextViz = vizOf(nextMsg);
  if (!nextViz) {
    return annotationFrameWithMetadata(renderMetadataCache, currentViz);
  }

  const f = interpolationFraction({
    nextTimelineTimeNs: nextMsg.timelineTimeNs,
    playheadNs: timeline.secToNs(playhead),
    previousTimelineTimeNs: currentMsg.timelineTimeNs,
  });
  if (f === null) {
    return annotationFrameWithMetadata(renderMetadataCache, currentViz);
  }

  const prepared = preparedImageAnnotationInterpolation(
    interpolationCache,
    currentViz,
    nextViz,
  );
  return sampleImageAnnotationInterpolation(prepared, f);
}

function annotationFrameWithMetadata(
  cache: RenderMetadataCache,
  frame: ImageAnnotationsVisualization,
): {
  readonly frame: ImageAnnotationsVisualization;
  readonly renderMetadata: ImageAnnotationRenderMetadata;
} {
  let renderMetadata = cache.get(frame);
  if (!renderMetadata) {
    renderMetadata = prepareImageAnnotationRenderMetadata(frame);
    cache.set(frame, renderMetadata);
  }
  return { frame, renderMetadata };
}

export function preparedImageAnnotationInterpolation(
  cache: InterpolationCache,
  previous: ImageAnnotationsVisualization,
  next: ImageAnnotationsVisualization,
): PreparedImageAnnotationInterpolation {
  let byNext = cache.get(previous);
  if (!byNext) {
    byNext = new WeakMap();
    cache.set(previous, byNext);
  }
  let prepared = byNext.get(next);
  if (!prepared) {
    prepared = prepareImageAnnotationInterpolation(previous, next);
    byNext.set(next, prepared);
  }
  return prepared;
}

/**
 * Finds the next cached source message strictly after `currentTick` whose
 * timeline time differs from the current message's. Decoder-agnostic; shared
 * by the 2D image-annotation and 3D scene-update interpolation hooks.
 */
export function nextDistinctCachedMessage({
  cache,
  currentTick,
  currentTimelineTimeNs,
  currentMessage,
  lookupCache,
  timeline,
}: {
  readonly cache: McapTopicCache;
  readonly currentTick: bigint;
  readonly currentTimelineTimeNs: bigint;
  readonly currentMessage?: McapDecodedMessage;
  readonly lookupCache?: WeakMap<McapTopicCache, NextMessageCacheEntry>;
  readonly timeline: McapTimelineIndex;
}): McapDecodedMessage | null {
  // Ticks are synchronized with LATEST semantics, so several cached ticks can
  // point to the same source annotation. Walk forward only far enough to find
  // the next cached source message; if lookahead is missing, staying on the
  // current frame is cheaper and visually safer than scanning the full file.
  const currentIndex = timeline.indexOfTick(currentTick);
  if (currentIndex === undefined) return null;
  const cached = lookupCache?.get(cache);
  if (
    currentMessage &&
    cached?.timeline === timeline &&
    cached.revision === cache.revision &&
    cached.currentMessage === currentMessage
  ) {
    if (
      cached.nextMessage &&
      cached.nextIndex !== null &&
      currentIndex >= cached.currentIndex &&
      currentIndex < cached.nextIndex
    ) {
      return cached.nextMessage;
    }
    // A miss is only reusable at the exact scan frontier. As the playhead
    // advances, the bounded search window slides and can expose a sparse next
    // message without any cache revision or current-message change.
    if (!cached.nextMessage && currentIndex === cached.currentIndex) {
      return null;
    }
  }
  const startIndex = currentIndex + 1;
  const endIndex = Math.min(
    timeline.tickCount,
    startIndex + MAX_NEXT_MESSAGE_SCAN_TICKS,
  );
  for (let i = startIndex; i < endIndex; i++) {
    const tick = timeline.tickAt(i);
    if (tick === undefined) break;
    const msg = cache.get(tick);
    if (msg && msg.timelineTimeNs !== currentTimelineTimeNs) {
      if (lookupCache && currentMessage) {
        lookupCache.set(cache, {
          currentIndex,
          currentMessage,
          nextIndex: i,
          nextMessage: msg,
          revision: cache.revision,
          timeline,
        });
      }
      return msg;
    }
  }
  if (lookupCache && currentMessage) {
    lookupCache.set(cache, {
      currentIndex,
      currentMessage,
      nextIndex: null,
      nextMessage: null,
      revision: cache.revision,
      timeline,
    });
  }
  return null;
}
