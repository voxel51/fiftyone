import {
  getBufferedRanges,
  getPlayhead,
  setBufferedRanges,
  setStreamValue,
  useIsPlaying,
  usePlayback,
  usePlaybackStore,
  useSeekEvent,
} from "@fiftyone/playback";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  publishDataStreamStatuses,
  setStreamContentTimeSec,
  setStreamStartTimeSec,
  setStreamStaleAgeNs,
  setStreamStatus,
} from "./stream-status-state";
import {
  type ByteSourceDescriptor,
  type ByteTimelinePoint,
  type DecodedFrame,
  type StreamSyncPolicies,
} from "../../../ir";
import {
  isEpisodeReadCancelledError,
  type EpisodeSession,
} from "../../../ports";
import { monotonicNowMs } from "../../../utils/monotonic-time";
import {
  createEpisodePlaybackRuntime,
  createTimelineIndex,
  episodeSourceAccessKey,
  type TimelineIndex,
} from "../../../runtime";
import { useSetDataStream } from "./data-stream-context";
import {
  decodedCacheBudgetBytes,
  rebalanceDecodedCaches as applyDecodedCachePolicy,
  reportedDeviceMemoryGb,
} from "./decoded-cache-policy";
import { shouldDeferIdleWorkForStore } from "./network-health";
import {
  bufferedRangesEqual,
  computeBufferedRanges as deriveBufferedRanges,
  DEFAULT_PLAYBACK_POLICY,
  derivePlaybackPolicy,
  nsToSeconds,
  resetPlaybackBuffering,
} from "./playback-buffering";
import {
  createDataStreamFetchState,
  createDataStreamPrefetcher,
  DataStreamScheduler,
  resetDataStreamFetchState,
} from "./data-stream-prefetch";
import { pushTickToStore } from "./playback-frame-push";
import { StartupCushionPlanner, type StartupCushion } from "./startup-cushion";
import { resetStartupCushionState } from "./startup-cushion-state";
import { EpisodeStreamCache } from "../../../runtime";
import type { StreamPlaybackFrame } from "./use-stream-values";

/**
 * Trailing-throttle interval for republishing buffered ranges to the
 * timeline strip. Computing ranges walks every timeline tick, so it must
 * not run at the cadence of status publishes (RAF-adjacent during
 * buffering stalls).
 */
const BUFFERED_RANGES_PUBLISH_INTERVAL_MS = 500;
const PLAYBACK_POLICY = derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY);

const noop = (): void => undefined;

/** Treats cancellation against an already-disposed session as complete. */
export function cancelIdleReads(
  session: Pick<EpisodeSession, "cancelIdle"> | null,
): void {
  try {
    session?.cancelIdle?.();
  } catch (error) {
    if (!isEpisodeReadCancelledError(error)) throw error;
  }
}

/** Inputs for registering the shared episode playback stream. */
export interface UseDataStreamOptions {
  blockingStreams: readonly string[];
  session: EpisodeSession | null;
  /** Called whenever every blocking stream covers the current playhead. */
  onPlayheadDataReady?: () => void;
  source: ByteSourceDescriptor | null;
  allStreams: readonly string[];
  staleWarningStreams: readonly string[];
  streamPolicies: StreamSyncPolicies;
}

/**
 * Registers one PlaybackStream that manages all episode streams together.
 *
 * - Fetches only the streams that have at least one active subscriber (open
 *   tile). Closed tiles stop counting — their streams are skipped in all
 *   batch requests, saving network bandwidth.
 * - Fetches a small startup window first, then warms the longer background
 *   lookahead in bounded batches. Per-stream caches deduplicate concurrent
 *   requests for the same tick.
 * - Publishes `{ subscribeToStream }` into the surrounding
 *   `DataStreamProvider` so tile bodies can subscribe to
 *   individual stream caches without going through an atom.
 */
export function useRegisterDataStream({
  blockingStreams,
  session,
  onPlayheadDataReady,
  source,
  allStreams,
  staleWarningStreams,
  streamPolicies,
}: UseDataStreamOptions): void {
  const { pause, registerStream, seek, subscribeStream } = usePlayback();
  const store = usePlaybackStore();
  const isPlaying = useIsPlaying();
  const setDataStream = useSetDataStream();
  const seekEvent = useSeekEvent();
  const playback = useMemo(
    () => (session ? createEpisodePlaybackRuntime(session) : null),
    [session],
  );
  // Per-recording discriminator for cross-tile caches and source lifecycle.
  const sourceKey = useMemo(
    () => (source ? episodeSourceAccessKey(source) : ""),
    [source],
  );

  // This layout effect resets recording-local time before paint while the
  // playback store—and therefore the modal workspace—survives navigation.
  // The stream-bounds path below may then advance zero to the first data tick.
  useLayoutEffect(() => {
    pause();
    seek(0);
  }, [pause, seek, sourceKey]);

  const [index, setIndex] = useState<TimelineIndex | null>(null);

  // Stable refs — read in RAF/subscribe callbacks without closure capture.
  const streamCachesRef = useRef<Map<string, EpisodeStreamCache>>(new Map());
  const decodedCacheBudgetBytesRef = useRef(0);
  if (decodedCacheBudgetBytesRef.current === 0) {
    decodedCacheBudgetBytesRef.current = decodedCacheBudgetBytes(
      reportedDeviceMemoryGb(),
    );
  }
  const backgroundLookaheadSecondsRef = useRef(
    PLAYBACK_POLICY.lookaheadSeconds,
  );
  const [fetchState] = useState(createDataStreamFetchState);
  const lastFrameRef = useRef<Map<string, StreamPlaybackFrame<unknown>>>(
    new Map(),
  );
  // Pending trailing-throttle timer for the buffered-ranges publish.
  const bufferedRangesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pausedIdleWarmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const schedulePausedIdleWarmupRef = useRef<
    ((delayMs?: number) => void) | null
  >(null);
  const streamStartTimesNsRef = useRef<Map<string, bigint | null>>(new Map());
  const autoSeekSourceEpochRef = useRef<number | null>(null);
  const lastSeekAtMsRef = useRef<number | null>(null);
  const [startupCushionPlanner] = useState(() => new StartupCushionPlanner());
  const indexRef = useRef<TimelineIndex | null>(null);
  const byteTimelineRef = useRef<readonly ByteTimelinePoint[] | null>(null);
  const sourceEpochRef = useRef(0);
  indexRef.current = index;
  // Hold the most recent `allStreams` / `streamPolicies` in refs so the
  // stable callbacks below read fresh values without listing them as
  // deps (which would invalidate the registered stream every render).
  const allStreamsRef = useRef(allStreams);
  const blockingStreamsRef = useRef<ReadonlySet<string>>(
    new Set(blockingStreams),
  );
  const staleWarningStreamsRef = useRef<ReadonlySet<string>>(
    new Set(staleWarningStreams),
  );
  const streamPoliciesRef = useRef(streamPolicies);
  const onPlayheadDataReadyRef = useRef(onPlayheadDataReady);
  // This effect keeps active stream discovery current without rebuilding streams.
  useEffect(() => {
    allStreamsRef.current = allStreams;
  }, [allStreams]);
  // This effect keeps readiness gating aligned with the latest blocking streams.
  useEffect(() => {
    blockingStreamsRef.current = new Set(blockingStreams);
  }, [blockingStreams]);
  // This effect keeps the readiness callback current without rebuilding streams.
  useEffect(() => {
    onPlayheadDataReadyRef.current = onPlayheadDataReady;
  }, [onPlayheadDataReady]);
  // This effect keeps stale-warning stream membership current inside callbacks.
  useEffect(() => {
    staleWarningStreamsRef.current = new Set(staleWarningStreams);
  }, [staleWarningStreams]);
  // This effect keeps per-stream sync policies current without stream churn.
  useEffect(() => {
    streamPoliciesRef.current = streamPolicies;
  }, [streamPolicies]);

  const getActiveStreams = useCallback(
    (): string[] =>
      allStreamsRef.current.filter(
        (t) => streamCachesRef.current.get(t)?.isActive,
      ),
    [],
  );
  const getActiveBlockingStreams = useCallback((): string[] => {
    const activeStreams = getActiveStreams();
    const blockingStreams = activeStreams.filter((stream) =>
      blockingStreamsRef.current.has(stream),
    );
    return blockingStreams.length > 0 ? blockingStreams : activeStreams;
  }, [getActiveStreams]);

  const clearPausedIdleWarmupTimer = useCallback(() => {
    if (pausedIdleWarmupTimerRef.current === null) return;
    clearTimeout(pausedIdleWarmupTimerRef.current);
    pausedIdleWarmupTimerRef.current = null;
  }, []);

  // Bandwidth-aware start gate: how much blocking-stream runway this play
  // press must cover before the engine may start. On links that outrun the
  // content bitrate (and whenever throughput or the byte curve is unknown)
  // this is exactly the static policy floor; on slower links it grows to
  // the smallest cushion that plays through to the horizon without
  // draining, so one honest buffering wait replaces repeated mid-play
  // freezes.
  const sourceReadProfile = source?.readProfile;
  const resolveStartupCushion = useCallback(
    (): StartupCushion =>
      startupCushionPlanner.resolve({
        activeBlockingStreams: getActiveBlockingStreams(),
        byteTimeline: byteTimelineRef.current,
        caches: streamCachesRef.current,
        index: indexRef.current,
        policy: PLAYBACK_POLICY,
        sourceEpoch: sourceEpochRef.current,
        sourceReadProfile,
        store,
      }),
    [getActiveBlockingStreams, sourceReadProfile, startupCushionPlanner, store],
  );

  // If a recording's selected renderable streams begin just after the episode
  // timeline start, land the initial playhead on the first sampled tick that
  // can actually resolve data. This consumes the stream bounds already loaded
  // for status copy; it never asks the worker for another index/read.
  const maybeAutoSeekToFirstData = useCallback(() => {
    const currentEpoch = sourceEpochRef.current;
    if (autoSeekSourceEpochRef.current === currentEpoch) return;
    if (getPlayhead(store) !== 0) return;

    const currentIndex = indexRef.current;
    if (!currentIndex) return;

    const activeStreams = getActiveStreams();
    if (activeStreams.length === 0) return;

    let firstMessageTimeNs: bigint | null = null;
    for (const stream of activeStreams) {
      if (!streamStartTimesNsRef.current.has(stream)) return;
      const streamStart = streamStartTimesNsRef.current.get(stream);
      if (streamStart === null || streamStart === undefined) return;
      if (firstMessageTimeNs === null || streamStart < firstMessageTimeNs) {
        firstMessageTimeNs = streamStart;
      }
    }
    if (firstMessageTimeNs === null) return;

    const tick = currentIndex.tickAt(
      currentIndex.indexAtOrAfter(firstMessageTimeNs),
    );
    if (tick === undefined) return;

    const targetSec = currentIndex.nsToSec(tick);
    if (targetSec <= 0) return;

    autoSeekSourceEpochRef.current = currentEpoch;
    seek(targetSec);
  }, [getActiveStreams, seek, store]);

  // This effect ensures a cache exists for every known stream.
  useEffect(() => {
    for (const stream of allStreams) {
      if (!streamCachesRef.current.has(stream)) {
        streamCachesRef.current.set(
          stream,
          new EpisodeStreamCache(PLAYBACK_POLICY.streamCacheMaxEntries),
        );
      }
    }
  }, [allStreams]);

  // This effect loads the timeline range once the source is available. On source
  // change, reset every piece of cached state synchronously so we
  // don't run fetches/lookups against the new source with old ticks
  // or stale frames while the async range load is in flight.
  useEffect(() => {
    sourceEpochRef.current += 1;
    const sourceEpoch = sourceEpochRef.current;
    setIndex(null);
    byteTimelineRef.current = null;
    resetDataStreamFetchState(fetchState);
    lastFrameRef.current.clear();
    streamStartTimesNsRef.current.clear();
    autoSeekSourceEpochRef.current = null;
    startupCushionPlanner.resetPendingPlan();
    backgroundLookaheadSecondsRef.current = PLAYBACK_POLICY.lookaheadSeconds;
    clearPausedIdleWarmupTimer();
    for (const cache of streamCachesRef.current.values()) {
      cache.clear();
    }
    for (const stream of streamCachesRef.current.keys()) {
      setStreamValue(store, stream, null);
      setStreamContentTimeSec(store, stream, null);
      setStreamStatus(store, stream, "loading");
      setStreamStaleAgeNs(store, stream, null);
      setStreamStartTimeSec(store, stream, null);
    }
    resetPlaybackBuffering(store);
    resetStartupCushionState(store);
    if (bufferedRangesTimerRef.current !== null) {
      clearTimeout(bufferedRangesTimerRef.current);
      bufferedRangesTimerRef.current = null;
    }
    if (!source || !playback) return undefined;
    let cancelled = false;
    const range = playback.timeline;
    byteTimelineRef.current = range.byteTimeline ?? null;
    const nextIndex = createTimelineIndex(range);
    // Publish the data-stream subscription surface before committing the
    // timeline. Tiles can then register as one active set, preserving the
    // proven all-pane startup batch and blocking-before-overlay ordering.
    void Promise.resolve().then(() => {
      if (!cancelled && sourceEpochRef.current === sourceEpoch) {
        setIndex(nextIndex);
      }
    });
    // Auxiliary: per-stream first-message times feed the "No data until
    // 0:12" tile copy. Best-effort — failures never block playback.
    void playback
      .readStreamTimeBounds(allStreamsRef.current)
      .then((bounds) => {
        if (cancelled || sourceEpochRef.current !== sourceEpoch) return;
        for (const bound of bounds) {
          streamStartTimesNsRef.current.set(
            bound.streamId,
            bound.firstTimestampNs,
          );
          const startSec =
            bound.firstTimestampNs === null
              ? null
              : nsToSeconds(bound.firstTimestampNs - range.startNs);
          setStreamStartTimeSec(store, bound.streamId, startSec);
        }
        maybeAutoSeekToFirstData();
      })
      .catch(noop);
    return () => {
      cancelled = true;
    };
  }, [
    clearPausedIdleWarmupTimer,
    fetchState,
    maybeAutoSeekToFirstData,
    playback,
    source,
    startupCushionPlanner,
    store,
  ]);

  // This effect retries the initial auto-seek once the timeline index is
  // committed to React state; stream bounds can resolve first.
  useEffect(() => {
    if (index) maybeAutoSeekToFirstData();
  }, [index, maybeAutoSeekToFirstData]);

  // Contiguous [startSec, endSec] ranges where every active stream has the
  // tick cached — i.e. the stretches playback can run through without
  // stalling. Derived from cache keys so this stays bounded by cache size,
  // not recording duration.
  const computeBufferedRanges = useCallback((): Array<[number, number]> => {
    return deriveBufferedRanges({
      activeStreams: getActiveBlockingStreams(),
      caches: streamCachesRef.current,
      index: indexRef.current,
    });
  }, [getActiveBlockingStreams]);

  const publishBufferedRangesNow = useCallback(() => {
    if (bufferedRangesTimerRef.current !== null) {
      clearTimeout(bufferedRangesTimerRef.current);
      bufferedRangesTimerRef.current = null;
    }
    const next = computeBufferedRanges();
    if (!bufferedRangesEqual(getBufferedRanges(store), next)) {
      setBufferedRanges(store, next);
    }
  }, [computeBufferedRanges, store]);

  const scheduleBufferedRangesPublish = useCallback(() => {
    if (bufferedRangesTimerRef.current !== null) return;
    bufferedRangesTimerRef.current = setTimeout(() => {
      bufferedRangesTimerRef.current = null;
      const next = computeBufferedRanges();
      if (!bufferedRangesEqual(getBufferedRanges(store), next)) {
        setBufferedRanges(store, next);
      }
    }, BUFFERED_RANGES_PUBLISH_INTERVAL_MS);
  }, [computeBufferedRanges, store]);

  // This effect clears deferred range publishing and idle warmup on unmount.
  useEffect(
    () => () => {
      if (bufferedRangesTimerRef.current !== null) {
        clearTimeout(bufferedRangesTimerRef.current);
        bufferedRangesTimerRef.current = null;
      }
      clearPausedIdleWarmupTimer();
    },
    [clearPausedIdleWarmupTimer],
  );

  // This effect retires the pending-start plan once playback begins.
  useEffect(() => {
    if (!isPlaying) return;
    startupCushionPlanner.resetPendingPlan();
  }, [isPlaying, startupCushionPlanner]);

  const publishStreamStatuses = useCallback(() => {
    publishDataStreamStatuses({
      activeBlockingStreams: getActiveBlockingStreams(),
      activeStreams: getActiveStreams(),
      caches: streamCachesRef.current,
      failedStreams: fetchState.failedStreams,
      index: indexRef.current,
      onPlayheadDataReady: onPlayheadDataReadyRef.current,
      policy: PLAYBACK_POLICY,
      publishBufferedRangesNow,
      pushCurrentTick: (activeStreams, tick) =>
        pushTickToStore(
          [...activeStreams],
          tick,
          streamCachesRef.current,
          lastFrameRef.current,
          store,
          fetchState.failedStreams,
        ),
      resolveStartupCushion,
      scheduleBufferedRangesPublish,
      schedulePausedIdleWarmup: (delayMs) =>
        schedulePausedIdleWarmupRef.current?.(delayMs),
      staleWarningStreams: staleWarningStreamsRef.current,
      store,
    });
  }, [
    fetchState,
    getActiveBlockingStreams,
    getActiveStreams,
    publishBufferedRangesNow,
    resolveStartupCushion,
    scheduleBufferedRangesPublish,
    store,
  ]);

  const rebalanceDecodedCaches = useCallback(
    (pruneSpeculative: boolean) => {
      backgroundLookaheadSecondsRef.current = applyDecodedCachePolicy({
        budgetBytes: decodedCacheBudgetBytesRef.current,
        caches: streamCachesRef.current,
        currentLookaheadSeconds: backgroundLookaheadSecondsRef.current,
        index: indexRef.current,
        maxLookaheadSeconds: PLAYBACK_POLICY.lookaheadSeconds,
        minLookaheadSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
        pruneSpeculative,
        stepSeconds: PLAYBACK_POLICY.prefetchBatchSeconds,
        store,
      });
    },
    [store],
  );

  const prefetcher = useMemo(
    () =>
      source && playback
        ? createDataStreamPrefetcher({
            caches: streamCachesRef.current,
            fetchState,
            getIndex: () => indexRef.current,
            getSourceEpoch: () => sourceEpochRef.current,
            getStreamPolicies: () => streamPoliciesRef.current,
            lastFrames: lastFrameRef.current,
            playback,
            publishStreamStatuses,
            rebalanceDecodedCaches,
            store,
          })
        : null,
    [
      fetchState,
      playback,
      publishStreamStatuses,
      rebalanceDecodedCaches,
      source,
      store,
    ],
  );

  const scheduler = useMemo(
    () =>
      prefetcher
        ? new DataStreamScheduler({
            caches: streamCachesRef.current,
            computeBufferedRanges,
            failedStreams: fetchState.failedStreams,
            getActiveBlockingStreams,
            getActiveStreams,
            getBackgroundLookaheadSeconds: () =>
              backgroundLookaheadSecondsRef.current,
            getBlockingStreams: () => blockingStreamsRef.current,
            getIndex: () => indexRef.current,
            getLastSeekAtMs: () => lastSeekAtMsRef.current,
            isSourceAvailable: () => source !== null,
            lastFrames: lastFrameRef.current,
            policy: PLAYBACK_POLICY,
            prefetcher,
            publishStreamStatuses,
            resolveStartupCushion,
            startupCushionPlanner,
            store,
          })
        : null,
    [
      computeBufferedRanges,
      fetchState,
      getActiveBlockingStreams,
      getActiveStreams,
      prefetcher,
      publishStreamStatuses,
      resolveStartupCushion,
      source,
      startupCushionPlanner,
      store,
    ],
  );

  const runPausedIdleWarmup = useCallback(
    () => scheduler?.runPausedIdleWarmup() ?? false,
    [scheduler],
  );

  const schedulePausedIdleWarmup = useCallback(
    (delayMs = 0) => {
      if (pausedIdleWarmupTimerRef.current !== null) return;

      pausedIdleWarmupTimerRef.current = setTimeout(() => {
        pausedIdleWarmupTimerRef.current = null;
        // A gated pass must keep the loop alive: retry on the same cadence
        // so warmup resumes the moment the constrained wait clears.
        if (
          shouldDeferIdleWorkForStore(
            store,
            lastSeekAtMsRef.current === null
              ? null
              : monotonicNowMs() - lastSeekAtMsRef.current,
          )
        ) {
          schedulePausedIdleWarmupRef.current?.(
            PLAYBACK_POLICY.prefetchRefreshSeconds * 1000,
          );
          return;
        }
        const queuedFetch = runPausedIdleWarmup();
        if (queuedFetch) {
          schedulePausedIdleWarmupRef.current?.(
            PLAYBACK_POLICY.prefetchRefreshSeconds * 1000,
          );
        }
      }, delayMs);
    },
    [runPausedIdleWarmup, store],
  );

  // This effect exposes the current idle-warmup scheduler to timer callbacks.
  useEffect(() => {
    schedulePausedIdleWarmupRef.current = schedulePausedIdleWarmup;
    return () => {
      if (schedulePausedIdleWarmupRef.current === schedulePausedIdleWarmup) {
        schedulePausedIdleWarmupRef.current = null;
      }
    };
  }, [schedulePausedIdleWarmup]);

  // This effect starts paused warmup and cancels it while playback is active.
  useEffect(() => {
    if (isPlaying) {
      clearPausedIdleWarmupTimer();
      return;
    }

    schedulePausedIdleWarmup(0);
  }, [
    clearPausedIdleWarmupTimer,
    index,
    isPlaying,
    schedulePausedIdleWarmup,
    source,
  ]);

  const prefetchLookaheadFrom = useCallback(
    (timeSec: number) => scheduler?.prefetchLookaheadFrom(timeSec),
    [scheduler],
  );

  // This effect registers the engine stream and proactive lookahead subscription.
  useEffect(() => {
    return scheduler?.register(registerStream, subscribeStream);
  }, [index, registerStream, scheduler, source, subscribeStream]);

  // This effect fetches and publishes a paused seek's target tick and window.
  useEffect(() => {
    if (seekEvent) {
      // Stamp seeks so the idle-work gate can hold speculative reads while
      // the foreground catch-up fetch owns a constrained link, and reclaim
      // it immediately from speculative transfers already in flight.
      lastSeekAtMsRef.current = monotonicNowMs();
      startupCushionPlanner.resetPendingPlan();
      // A source transition can dispose the previous session before this
      // seek effect runs. Cancelling idle work on that session is already
      // satisfied, so do not surface its deliberate cancellation through
      // the episode error boundary.
      cancelIdleReads(session);
      // Retain the previous frame while an uncovered target loads. Stream
      // loading state lets scene tiles mark the retained snapshot as previous,
      // and the target frame replaces it as soon as the foreground fetch
      // lands. Source changes and stream unsubscription still clear retained
      // frames at their ownership boundaries.
      prefetchLookaheadFrom(seekEvent.time);
    }
  }, [session, seekEvent, prefetchLookaheadFrom, startupCushionPlanner]);

  // This effect kicks off lookahead so the buffer fills before play or seek.
  // (May be a no-op if no tile has subscribed yet — subscribeToStream also
  // triggers this for the same reason.)
  useEffect(() => {
    if (index) prefetchLookaheadFrom(getPlayhead(store));
  }, [index, prefetchLookaheadFrom, store]);

  // Expose subscribeToStream via the playback store so tiles can subscribe
  // without a React context hierarchy constraint. The first subscription for
  // a stream flips its cache to active, which is what gates lookahead — so we
  // also trigger a prefetch here so buffering starts the moment a tile mounts.
  const subscribeToStream = useCallback(
    (stream: string): (() => void) => {
      const cache = streamCachesRef.current.get(stream);
      if (!cache) return noop;

      const cleanup = cache.subscribe();
      maybeAutoSeekToFirstData();
      prefetchLookaheadFrom(getPlayhead(store));
      return () => {
        cleanup();
        // Cache cleared itself in its own cleanup once the count hit 0;
        // also drop the held-last-frame so a future re-subscribe can't
        // flash stale content from the previous session.
        if (!cache.isActive) lastFrameRef.current.delete(stream);
      };
    },
    [maybeAutoSeekToFirstData, prefetchLookaheadFrom, store],
  );

  const getStreamCache = useCallback(
    (stream: string) => streamCachesRef.current.get(stream),
    [],
  );
  const getTimelineIndex = useCallback(() => index, [index]);
  const readStreamFrames = useCallback(
    async ({
      endTimeNs,
      startTimeNs,
      stream,
    }: {
      readonly endTimeNs: bigint;
      readonly startTimeNs: bigint;
      readonly stream: string;
    }) => {
      if (!source || !session) return [];
      const messages: DecodedFrame[] = [];
      for await (const batch of session.read({
        priority: "current",
        streams: [stream],
        window: { endNs: endTimeNs, startNs: startTimeNs },
      })) {
        messages.push(...batch.frames);
      }
      return messages;
    },
    [session, source],
  );
  // This effect publishes the current recording stream through React context.
  useEffect(() => {
    setDataStream({
      getTimelineIndex,
      getStreamCache,
      readStreamFrames,
      sourceKey,
      subscribeToStream,
    });
    return () => {
      setDataStream(null);
    };
  }, [
    setDataStream,
    sourceKey,
    subscribeToStream,
    getStreamCache,
    getTimelineIndex,
    readStreamFrames,
  ]);
}
