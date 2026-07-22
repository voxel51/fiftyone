import { useEffect, useMemo, useRef } from "react";

import type { ImageAnnotationsVisualization } from "../../../ir";
import type { ImageAnnotationRenderMetadata } from "../../../visualization/media-2d/image-annotation-render-metadata";
import type { TimelineIndex } from "../../../runtime";
import {
  prepareImageAnnotationInterpolation,
  prepareImageAnnotationRenderMetadata,
  sampleImageAnnotationInterpolation,
  type PreparedImageAnnotationInterpolation,
  vizOf,
} from "./interpolate-image-annotations";
import {
  interpolationFraction,
  nextDistinctCachedMessage,
  useStreamCacheSnapshot,
  type NextMessageCacheEntry,
} from "../playback/cache-sampling";
import {
  useDataStream,
  type DataStream,
} from "../playback/data-stream-context";
import type { EpisodeStreamCache } from "../../../runtime";
import { useOptionalPlayhead } from "../playback/use-optional-playhead";

/** Options for the interpolated image-annotation hooks. */
export interface UseInterpolatedImageAnnotationsOptions {
  /** When false, returns the current annotation as-is with no lerping. */
  readonly interpolate?: boolean;
}

const EMPTY_STREAMS: readonly string[] = [];

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
  const dataStream = useDataStream();
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const streamRef = useRef<DataStream | null>(null);
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

type RenderMetadataCache = WeakMap<
  ImageAnnotationsVisualization,
  ImageAnnotationRenderMetadata
>;

interface AnnotationSetsFromCachesArgs {
  /** Invalidation token from `useSyncExternalStore`; frame derivation reads caches below. */
  readonly cacheSnapshot: string;
  readonly dataStream: DataStream | null;
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
