import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import type { ImageAnnotationsVisualization } from "../../../decoders";
import type { ImageAnnotationRenderMetadata } from "../../../visualization/image/image-annotation-render-metadata";
import type { DecodedFrame } from "../../../ir";
import type { TimelineIndex } from "../../../runtime";
import {
  interpolationFraction,
  prepareImageAnnotationInterpolation,
  prepareImageAnnotationRenderMetadata,
  sampleImageAnnotationInterpolation,
  type PreparedImageAnnotationInterpolation,
  vizOf,
} from "./interpolate-image-annotations";
import {
  useEpisodeDataStream,
  type EpisodeDataStream,
} from "../playback/episode-data-stream-context";
import type { EpisodeStreamCache } from "../playback/episode-stream-cache";
import { useOptionalPlayhead } from "../playback/use-optional-playhead";

/** Options for the interpolated image-annotation hooks. */
export interface UseInterpolatedImageAnnotationsOptions {
  /** When false, returns the current annotation as-is with no lerping. */
  readonly interpolate?: boolean;
}

const EMPTY_STREAMS: readonly string[] = [];
// Forward-scan budget when searching for the next distinct annotation to lerp
// toward. Coupled to the ~30 Hz timeline tick rate: 120 ticks ≈ 4s, which
// comfortably spans the ~2 Hz annotation cadence. If the tick rate changes,
// revisit this — set too low, sparse annotations silently stop interpolating.
const MAX_NEXT_MESSAGE_SCAN_TICKS = 120;

/**
 * Single-stream convenience wrapper over {@link useInterpolatedImageAnnotationSets}.
 * Returns the interpolated image-annotation visualization for `stream` at the
 * current playhead, or `null` when no frame is available. Pass
 * `{ interpolate: false }` for the current frame at the playhead without lerping.
 */
export function useInterpolatedImageAnnotations(
  stream: string,
  { interpolate = true }: UseInterpolatedImageAnnotationsOptions = {},
): ImageAnnotationsVisualization | null {
  const streams = useMemo(() => (stream ? [stream] : EMPTY_STREAMS), [stream]);
  const sets = useInterpolatedImageAnnotationSets(streams, { interpolate });
  return sets[0]?.frame ?? null;
}

/**
 * Returns decoded image-annotation visualizations for every selected
 * annotation stream, in stream order, omitting streams with no frame at the
 * current playhead.
 */
export function useInterpolatedImageAnnotationSets(
  streams: readonly string[],
  { interpolate = true }: UseInterpolatedImageAnnotationsOptions = {},
): readonly {
  readonly frame: ImageAnnotationsVisualization;
  readonly renderMetadata: ImageAnnotationRenderMetadata;
  readonly stream: string;
}[] {
  const stableStreams = useStableStreams(streams);
  const dataStream = useEpisodeDataStream();
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const streamRef = useRef<EpisodeDataStream | null>(null);
  const streamSet = useMemo(() => new Set(stableStreams), [stableStreams]);

  // This effect syncs stream subscriptions with the data stream and stream list.
  useEffect(() => {
    const subscriptions = subscriptionsRef.current;

    if (streamRef.current !== dataStream) {
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
      streamRef.current = dataStream;
    }
    if (!dataStream) return;

    for (const [stream, unsubscribe] of subscriptions) {
      if (!streamSet.has(stream)) {
        unsubscribe();
        subscriptions.delete(stream);
      }
    }
    for (const stream of stableStreams) {
      if (!subscriptions.has(stream)) {
        subscriptions.set(stream, dataStream.subscribeToStream(stream));
      }
    }
  }, [dataStream, stableStreams, streamSet]);

  // This effect releases all stream subscriptions when the hook unmounts.
  useEffect(
    () => () => {
      for (const unsubscribe of subscriptionsRef.current.values()) {
        unsubscribe();
      }
      subscriptionsRef.current.clear();
    },
    [],
  );

  // Smooth mode tracks every RAF tick. As-recorded mode samples placement time
  // only when stream/cache content renders for another reason.
  const playhead = useOptionalPlayhead(interpolate);
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const cacheSnapshot = useStreamCacheSnapshot(dataStream, stableStreams);
  // Fresh caches whenever the stream or timeline changes so entries keyed by
  // now-unreachable visualization objects don't linger. The deps are the
  // reset triggers, not values the factories read — hence the lint disables.
  const interpolationCache = useMemo<InterpolationCache>(
    () => new WeakMap(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataStream, timeline],
  );
  const nextMessageCache = useMemo<
    WeakMap<EpisodeStreamCache, NextMessageCacheEntry>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  >(() => new WeakMap(), [dataStream, timeline]);
  const renderMetadataCache = useMemo<RenderMetadataCache>(
    () => new WeakMap(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        streams: stableStreams,
      }),
    [
      cacheSnapshot,
      dataStream,
      interpolate,
      interpolationCache,
      nextMessageCache,
      playhead,
      renderMetadataCache,
      stableStreams,
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
  readonly currentMessage: DecodedFrame;
  readonly nextIndex: number | null;
  readonly nextMessage: DecodedFrame | null;
  readonly revision: number;
  readonly timeline: TimelineIndex;
}

type RenderMetadataCache = WeakMap<
  ImageAnnotationsVisualization,
  ImageAnnotationRenderMetadata
>;

interface AnnotationSetsFromCachesArgs {
  /** Invalidation token from `useSyncExternalStore`; frame derivation reads caches below. */
  readonly cacheSnapshot: string;
  readonly dataStream: EpisodeDataStream | null;
  readonly interpolate: boolean;
  readonly interpolationCache: InterpolationCache;
  readonly nextMessageCache: WeakMap<EpisodeStreamCache, NextMessageCacheEntry>;
  readonly playhead: number;
  readonly renderMetadataCache: RenderMetadataCache;
  readonly timeline: TimelineIndex | null;
  readonly streams: readonly string[];
}

function annotationSetsFromCaches({
  dataStream,
  interpolate,
  interpolationCache,
  nextMessageCache,
  playhead,
  renderMetadataCache,
  timeline,
  streams,
}: AnnotationSetsFromCachesArgs): readonly {
  readonly frame: ImageAnnotationsVisualization;
  readonly renderMetadata: ImageAnnotationRenderMetadata;
  readonly stream: string;
}[] {
  if (!dataStream || !timeline) return [];

  const sets: {
    frame: ImageAnnotationsVisualization;
    renderMetadata: ImageAnnotationRenderMetadata;
    stream: string;
  }[] = [];
  for (const stream of streams) {
    const cache = dataStream.getStreamCache(stream);
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
      sets.push({ ...frame, stream });
    }
  }
  return sets;
}

/**
 * Returns a referentially stable, empty-stream-free copy of `streams` that only
 * changes identity when the stream *contents* change. Lets callers pass a fresh
 * array each render without re-triggering the subscription effects or the
 * `useSyncExternalStore` snapshot below.
 */
function useStableStreams(streams: readonly string[]): readonly string[] {
  // Memoize on the joined contents rather than array identity, so callers can
  // pass a fresh array every render without churning the downstream memo and
  // external-store subscriptions. A newline can't appear in a stream name, so
  // equal lists always yield the same key. Keying here keeps it concurrent-safe,
  // unlike caching it through a ref written during render.
  const normalized = normalizeStreams(streams);
  const key = normalized.join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the content digest of `normalized`
  return useMemo(() => normalized, [key]);
}

/**
 * Subscribes to the per-stream cache revisions via `useSyncExternalStore` and
 * returns a `"stream:revision|"` digest string. The digest changes whenever a
 * watched cache bumps its revision (frames arrive, change, or are cleared),
 * which is what drives the hook to re-derive annotation frames as data streams in.
 * Shared with `use-interpolated-scene-updates`.
 */
export function useStreamCacheSnapshot(
  dataStream: EpisodeDataStream | null,
  streams: readonly string[],
): string {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!dataStream || streams.length === 0) return () => undefined;
      // Only caches that already exist are observed. This is safe because the
      // data stream creates every stream cache before it publishes itself, so by
      // the time `dataStream` is non-null the caches exist. If a stream's cache
      // could appear *after* this subscription runs, its revision bumps would go
      // unseen — bump a dependency here to re-subscribe in that case.
      const unsubscribeFns: (() => void)[] = [];
      for (const stream of streams) {
        const cache = dataStream.getStreamCache(stream);
        if (cache) {
          unsubscribeFns.push(cache.subscribeToChanges(onStoreChange));
        }
      }
      return () => {
        for (const unsubscribe of unsubscribeFns) unsubscribe();
      };
    },
    [dataStream, streams],
  );

  const getSnapshot = useCallback(
    () => streamCacheSnapshot(dataStream, streams),
    [dataStream, streams],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function streamCacheSnapshot(
  dataStream: EpisodeDataStream | null,
  streams: readonly string[],
): string {
  if (!dataStream || streams.length === 0) return "";
  let snapshot = "";
  for (const stream of streams) {
    const revision = dataStream.getStreamCache(stream)?.revision ?? -1;
    snapshot += `${stream}:${revision}|`;
  }
  return snapshot;
}

function normalizeStreams(streams: readonly string[]): readonly string[] {
  if (streams.length === 0) return EMPTY_STREAMS;
  const normalized: string[] = [];
  const seen = new Set<string>();
  let changed = false;
  for (const stream of streams) {
    if (!stream) {
      changed = true;
      continue;
    }
    if (seen.has(stream)) {
      changed = true;
      continue;
    }
    seen.add(stream);
    normalized.push(stream);
  }
  if (!changed) return streams;
  return normalized.length > 0 ? normalized : EMPTY_STREAMS;
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
  readonly cache: EpisodeStreamCache;
  readonly interpolate: boolean;
  readonly interpolationCache: InterpolationCache;
  readonly nextMessageCache: WeakMap<EpisodeStreamCache, NextMessageCacheEntry>;
  readonly playhead: number;
  readonly renderMetadataCache: RenderMetadataCache;
  readonly timeline: TimelineIndex;
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
    currentTimelineTimeNs: currentMsg.timestampNs,
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
    nextTimelineTimeNs: nextMsg.timestampNs,
    playheadNs: timeline.secToNs(playhead),
    previousTimelineTimeNs: currentMsg.timestampNs,
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
  readonly cache: EpisodeStreamCache;
  readonly currentTick: bigint;
  readonly currentTimelineTimeNs: bigint;
  readonly currentMessage?: DecodedFrame;
  readonly lookupCache?: WeakMap<EpisodeStreamCache, NextMessageCacheEntry>;
  readonly timeline: TimelineIndex;
}): DecodedFrame | null {
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
    if (msg && msg.timestampNs !== currentTimelineTimeNs) {
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
