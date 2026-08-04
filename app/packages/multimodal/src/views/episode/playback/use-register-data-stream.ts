import {
  getBufferedRanges,
  getIsPlaying,
  getIsPlayPending,
  getPlayhead,
  setBufferedRanges,
  setSeekFetchDebounceMs,
  setStreamValue,
  useIsPlaying,
  usePlayback,
  usePlaybackStore,
} from "@fiftyone/playback";
import { seekEventAtom } from "@fiftyone/playback/runtime";
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
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
  type ByteTimelinePoint,
  type DecodedFrame,
  type PointCloudRenderChannelPayload,
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
  type StreamSubscriptionOptions,
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
  type DerivedPlaybackPolicy,
  INITIAL_DATA_AUTO_SEEK_THRESHOLD_SECONDS,
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
const REMOTE_SEEK_FETCH_DEBOUNCE_MS = 150;
// Local files need only a current-frame guard before rolling prefetch takes
// over. Keeping this grant short prevents cold multi-image batches from
// monopolizing the foreground worker; remote sources retain the adaptive
// half-second floor and bandwidth cushion.
const LOCAL_STARTUP_BUFFER_SECONDS = 0.1;

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

/** Treats seek-runway cancellation on an already-disposed session as complete. */
export function cancelRunwayReads(
  session: Pick<EpisodeSession, "cancelRunway"> | null,
): void {
  try {
    session?.cancelRunway?.();
  } catch (error) {
    if (!isEpisodeReadCancelledError(error)) throw error;
  }
}

/** Inputs for registering the shared episode playback stream. */
export interface UseDataStreamOptions {
  blockingStreams: readonly string[];
  /** Streams admitted first for single-tick current-frame reads. */
  currentFrameFirstStreams: readonly string[];
  session: EpisodeSession | null;
  /** Called whenever every blocking stream covers the current playhead. */
  onPlayheadDataReady?: () => void;
  source: ByteSourceDescriptor | null;
  allStreams: readonly string[];
  staleWarningStreams: readonly string[];
  /** Human-readable names keyed by the stream IDs used for data access. */
  streamNames: ReadonlyMap<string, string>;
  streamPolicies: StreamSyncPolicies;
  /** Presentation cadence for the virtual synchronized-read tick grid. */
  timelineSamplingRateHz: number;
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
  currentFrameFirstStreams,
  session,
  onPlayheadDataReady,
  source,
  allStreams,
  staleWarningStreams,
  streamNames,
  streamPolicies,
  timelineSamplingRateHz,
}: UseDataStreamOptions): void {
  const { pause, registerStream, seek, subscribeStream } = usePlayback();
  const store = usePlaybackStore();
  const isPlaying = useIsPlaying();
  const setDataStream = useSetDataStream();
  const playback = useMemo(
    () => (session ? createEpisodePlaybackRuntime(session) : null),
    [session],
  );
  // Per-recording discriminator for cross-tile caches and source lifecycle.
  const sourceKey = useMemo(
    () => (source ? episodeSourceAccessKey(source) : ""),
    [source],
  );
  const sourceReadProfile = source?.readProfile;
  const playbackPolicy = useMemo(() => {
    const policy = derivePlaybackPolicy(
      DEFAULT_PLAYBACK_POLICY,
      timelineSamplingRateHz,
    );
    if (sourceReadProfile !== BYTE_SOURCE_READ_PROFILE.LOCAL) return policy;
    return {
      ...policy,
      startupLookaheadSeconds: LOCAL_STARTUP_BUFFER_SECONDS,
      startupMaxPrefetchBatch: Math.max(
        1,
        Math.ceil(timelineSamplingRateHz * LOCAL_STARTUP_BUFFER_SECONDS),
      ),
      startupMinTicks: 1,
    } satisfies DerivedPlaybackPolicy;
  }, [sourceReadProfile, timelineSamplingRateHz]);
  // Only explicitly remote sources coalesce scrub targets; generic and local
  // playback stay immediate. settleSeek still releases the final target
  // immediately on pointer-up.
  const seekFetchDebounceMs =
    sourceReadProfile === BYTE_SOURCE_READ_PROFILE.REMOTE
      ? REMOTE_SEEK_FETCH_DEBOUNCE_MS
      : 0;
  const lifecycleSeekInProgressRef = useRef(false);

  // This layout effect resets recording-local time before paint while the
  // playback store—and therefore the modal workspace—survives navigation. It
  // also applies source-local fetch policy before the reset seek: generic and
  // local playback remain immediate, while explicitly remote sources coalesce
  // missing-data admission during rapid scrubbing.
  useLayoutEffect(() => {
    setSeekFetchDebounceMs(store, seekFetchDebounceMs);
    pause();
    lifecycleSeekInProgressRef.current = true;
    try {
      seek(0);
    } finally {
      lifecycleSeekInProgressRef.current = false;
    }
    return () => setSeekFetchDebounceMs(store, 0);
  }, [pause, seek, seekFetchDebounceMs, sourceKey, store]);

  const [index, setIndex] = useState<TimelineIndex | null>(null);

  // Stable refs — read in RAF/subscribe callbacks without closure capture.
  const streamCachesRef = useRef<Map<string, EpisodeStreamCache>>(new Map());
  const decodedCacheBudgetBytesRef = useRef(0);
  if (decodedCacheBudgetBytesRef.current === 0) {
    decodedCacheBudgetBytesRef.current = decodedCacheBudgetBytes(
      reportedDeviceMemoryGb(),
    );
  }
  const backgroundLookaheadSecondsRef = useRef(playbackPolicy.lookaheadSeconds);
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
  const pointCloudColorSubscriptionsRef = useRef<
    Map<string, Map<string, number>>
  >(new Map());
  const activePointCloudColorByRef = useRef<Map<string, string>>(new Map());
  const pointCloudChannelReadsRef = useRef<
    Map<string, Promise<PointCloudRenderChannelPayload>>
  >(new Map());
  const autoSeekSourceEpochRef = useRef<number | null>(null);
  const autoSeekScheduleEpochRef = useRef<number | null>(null);
  const deferredBatchAdmissionRef = useRef(false);
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
  const currentFrameFirstStreamsRef = useRef<ReadonlySet<string>>(
    new Set(currentFrameFirstStreams),
  );
  const staleWarningStreamsRef = useRef<ReadonlySet<string>>(
    new Set(staleWarningStreams),
  );
  const streamPoliciesRef = useRef(streamPolicies);
  const streamNamesRef = useRef(streamNames);
  const onPlayheadDataReadyRef = useRef(onPlayheadDataReady);
  // This effect keeps active stream discovery current without rebuilding streams.
  useEffect(() => {
    allStreamsRef.current = allStreams;
  }, [allStreams]);
  // This effect keeps readiness gating aligned with the latest blocking streams.
  useEffect(() => {
    blockingStreamsRef.current = new Set(blockingStreams);
  }, [blockingStreams]);
  useEffect(() => {
    currentFrameFirstStreamsRef.current = new Set(currentFrameFirstStreams);
  }, [currentFrameFirstStreams]);
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
  // This effect keeps buffering diagnostics human-readable without rebuilding
  // the registered playback stream when inventory labels change.
  useEffect(() => {
    streamNamesRef.current = streamNames;
  }, [streamNames]);

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
  const resolveStartupCushion = useCallback(
    (): StartupCushion =>
      startupCushionPlanner.resolve({
        activeBlockingStreams: getActiveBlockingStreams(),
        byteTimeline: byteTimelineRef.current,
        caches: streamCachesRef.current,
        index: indexRef.current,
        policy: playbackPolicy,
        sourceEpoch: sourceEpochRef.current,
        sourceReadProfile,
        store,
      }),
    [
      getActiveBlockingStreams,
      playbackPolicy,
      sourceReadProfile,
      startupCushionPlanner,
      store,
    ],
  );

  // If a recording's selected renderable streams begin just after the episode
  // timeline start, land the initial playhead on the first sampled tick that
  // resolves every short-skew stream. Later-starting and empty streams remain
  // at their honest gaps instead of pulling the whole recording forward. This
  // consumes the bounds already loaded for status copy and stays inside the
  // startup buffer, so it never asks the worker for another index/read.
  const maybeAutoSeekToFirstData = useCallback(() => {
    const currentEpoch = sourceEpochRef.current;
    if (autoSeekSourceEpochRef.current === currentEpoch) return;
    if (getPlayhead(store) !== 0) return;
    if (getIsPlaying(store) || getIsPlayPending(store)) return;

    const currentIndex = indexRef.current;
    if (!currentIndex) return;

    const activeStreams = getActiveStreams();
    if (activeStreams.length === 0) return;

    let latestShortStartTimeNs: bigint | null = null;
    for (const stream of activeStreams) {
      const streamStart = streamStartTimesNsRef.current.get(stream);
      if (streamStart === null || streamStart === undefined) continue;
      const startSec = currentIndex.nsToSec(streamStart);
      if (
        startSec <= 0 ||
        startSec > INITIAL_DATA_AUTO_SEEK_THRESHOLD_SECONDS
      ) {
        continue;
      }
      if (
        latestShortStartTimeNs === null ||
        streamStart > latestShortStartTimeNs
      ) {
        latestShortStartTimeNs = streamStart;
      }
    }
    if (latestShortStartTimeNs === null) return;

    const tick = currentIndex.tickAt(
      currentIndex.indexAtOrAfter(latestShortStartTimeNs),
    );
    if (tick === undefined) return;

    const targetSec = currentIndex.nsToSec(tick);
    if (targetSec <= 0) return;

    autoSeekSourceEpochRef.current = currentEpoch;
    lifecycleSeekInProgressRef.current = true;
    try {
      seek(targetSec);
    } finally {
      lifecycleSeekInProgressRef.current = false;
    }
  }, [getActiveStreams, seek, store]);

  // Stream subscriptions mount as one React effect batch. Coalescing their
  // auto-seek checks lets the target consider the complete visible set instead
  // of committing to whichever short-skew stream subscribes first.
  const scheduleAutoSeekToFirstData = useCallback(() => {
    const currentEpoch = sourceEpochRef.current;
    if (autoSeekScheduleEpochRef.current === currentEpoch) return;
    autoSeekScheduleEpochRef.current = currentEpoch;
    void Promise.resolve().then(() => {
      if (autoSeekScheduleEpochRef.current === currentEpoch) {
        autoSeekScheduleEpochRef.current = null;
      }
      if (sourceEpochRef.current === currentEpoch) {
        maybeAutoSeekToFirstData();
      }
    });
  }, [maybeAutoSeekToFirstData]);

  // This effect ensures a cache exists for every known stream.
  useEffect(() => {
    for (const stream of allStreams) {
      const cache = streamCachesRef.current.get(stream);
      if (cache) {
        cache.resize(playbackPolicy.streamCacheMaxEntries);
      } else {
        streamCachesRef.current.set(
          stream,
          new EpisodeStreamCache(playbackPolicy.streamCacheMaxEntries),
        );
      }
    }
  }, [allStreams, playbackPolicy.streamCacheMaxEntries]);

  // This effect rebuilds the timeline when the source or sampling rate changes.
  // Reset every piece of cached state synchronously so fetches and lookups never
  // combine a new timeline with old ticks or stale frames while the async range
  // load is in flight.
  useEffect(() => {
    sourceEpochRef.current += 1;
    const sourceEpoch = sourceEpochRef.current;
    setIndex(null);
    byteTimelineRef.current = null;
    resetDataStreamFetchState(fetchState);
    lastFrameRef.current.clear();
    pointCloudChannelReadsRef.current.clear();
    streamStartTimesNsRef.current.clear();
    autoSeekSourceEpochRef.current = null;
    autoSeekScheduleEpochRef.current = null;
    deferredBatchAdmissionRef.current = false;
    lastSeekAtMsRef.current = null;
    startupCushionPlanner.resetPendingPlan();
    backgroundLookaheadSecondsRef.current = playbackPolicy.lookaheadSeconds;
    clearPausedIdleWarmupTimer();
    // Advancing the source epoch makes every in-flight result stale; cancel
    // speculative idle work as well so the old cadence stops consuming I/O.
    cancelIdleReads(session);
    for (const cache of streamCachesRef.current.values()) {
      cache.resize(playbackPolicy.streamCacheMaxEntries);
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
    const nextIndex = createTimelineIndex(range, timelineSamplingRateHz);
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
        scheduleAutoSeekToFirstData();
      })
      .catch(noop);
    return () => {
      cancelled = true;
    };
  }, [
    clearPausedIdleWarmupTimer,
    fetchState,
    playback,
    playbackPolicy.lookaheadSeconds,
    playbackPolicy.streamCacheMaxEntries,
    scheduleAutoSeekToFirstData,
    session,
    source,
    startupCushionPlanner,
    store,
    timelineSamplingRateHz,
  ]);

  // This effect retries the initial auto-seek once the timeline index is
  // committed to React state; stream bounds can resolve first.
  useEffect(() => {
    if (index) scheduleAutoSeekToFirstData();
  }, [index, scheduleAutoSeekToFirstData]);

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
      policy: playbackPolicy,
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
      streamNames: streamNamesRef.current,
      store,
    });
  }, [
    fetchState,
    getActiveBlockingStreams,
    getActiveStreams,
    publishBufferedRangesNow,
    playbackPolicy,
    resolveStartupCushion,
    scheduleBufferedRangesPublish,
    store,
  ]);

  const rebalanceDecodedCaches = useCallback(() => {
    backgroundLookaheadSecondsRef.current = applyDecodedCachePolicy({
      backwardCushionSeconds: playbackPolicy.prefetchBatchSeconds,
      budgetBytes: decodedCacheBudgetBytesRef.current,
      caches: streamCachesRef.current,
      currentLookaheadSeconds: backgroundLookaheadSecondsRef.current,
      index: indexRef.current,
      maxLookaheadSeconds: playbackPolicy.lookaheadSeconds,
      minLookaheadSeconds: playbackPolicy.startupLookaheadSeconds,
      stepSeconds: playbackPolicy.prefetchBatchSeconds,
      store,
    });
  }, [playbackPolicy, store]);

  const prefetcher = useMemo(
    () =>
      source && playback
        ? createDataStreamPrefetcher({
            caches: streamCachesRef.current,
            fetchState,
            getIndex: () => indexRef.current,
            getPointCloudColorBy: () =>
              Object.fromEntries(activePointCloudColorByRef.current),
            getSourceEpoch: () => sourceEpochRef.current,
            getStreamPolicies: () => streamPoliciesRef.current,
            lastFrames: lastFrameRef.current,
            playback,
            publishStreamStatuses,
            rebalanceDecodedCaches,
            // Once a discontinuous seek has occurred, a fully paused target
            // owns only its current frame. No speculative lane may readmit
            // nearby runway: play-pending is the explicit ownership transfer
            // that restores required startup/playback batches.
            shouldAdmitBatch: () => {
              const shouldAdmit =
                lastSeekAtMsRef.current === null ||
                getIsPlaying(store) ||
                getIsPlayPending(store);
              deferredBatchAdmissionRef.current = !shouldAdmit;
              return shouldAdmit;
            },
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
            cancelIdle: () => cancelIdleReads(session),
            computeBufferedRanges,
            failedStreams: fetchState.failedStreams,
            getActiveBlockingStreams,
            getActiveStreams,
            getBackgroundLookaheadSeconds: () =>
              backgroundLookaheadSecondsRef.current,
            getByteTimeline: () =>
              sourceReadProfile === BYTE_SOURCE_READ_PROFILE.REMOTE
                ? byteTimelineRef.current
                : null,
            getBlockingStreams: () => blockingStreamsRef.current,
            getCurrentFrameFanoutDebounceMs: () => seekFetchDebounceMs,
            getCurrentFrameFirstStreams: () =>
              currentFrameFirstStreamsRef.current,
            getIndex: () => indexRef.current,
            getLastSeekAtMs: () => lastSeekAtMsRef.current,
            hasDeferredBatchAdmission: () => deferredBatchAdmissionRef.current,
            isSourceAvailable: () => source !== null,
            lastFrames: lastFrameRef.current,
            policy: playbackPolicy,
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
      playbackPolicy,
      publishStreamStatuses,
      resolveStartupCushion,
      seekFetchDebounceMs,
      source,
      startupCushionPlanner,
      store,
      session,
      sourceReadProfile,
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
            playbackPolicy.prefetchRefreshSeconds * 1000,
          );
          return;
        }
        const queuedFetch = runPausedIdleWarmup();
        if (queuedFetch) {
          schedulePausedIdleWarmupRef.current?.(
            playbackPolicy.prefetchRefreshSeconds * 1000,
          );
        }
      }, delayMs);
    },
    [playbackPolicy.prefetchRefreshSeconds, runPausedIdleWarmup, store],
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

  // Paused warmup is speculative. The scheduler cancels in-flight idle work
  // synchronously when play becomes pending; this effect only owns its timer.
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

  // Subscribe directly so cancellation runs synchronously after seek intent
  // publishes and before the playback engine can admit work for the new target.
  useEffect(() => {
    return store.sub(seekEventAtom, () => {
      deferredBatchAdmissionRef.current = false;
      // Source reset and first-data alignment establish the initial playhead;
      // they are not user discontinuities and must retain startup warmup.
      if (!lifecycleSeekInProgressRef.current) {
        lastSeekAtMsRef.current = monotonicNowMs();
      }
      startupCushionPlanner.resetPendingPlan();
      // Preference is derived from the current playhead rather than owned by
      // cached entries. Rebalance synchronously so a far seek immediately
      // demotes the old neighborhood before new foreground reads arrive.
      rebalanceDecodedCaches();
      // A source transition can dispose the previous session before this
      // subscription observes its reset seek. Cancellation on that session is
      // already satisfied, so do not surface it through the error boundary.
      cancelIdleReads(session);
      cancelRunwayReads(session);
      // Retain the previous frame while an uncovered target loads. Stream
      // loading state lets scene tiles mark the retained snapshot as previous,
      // and the target frame replaces it as soon as the foreground fetch
      // lands. Source changes and stream unsubscription still clear retained
      // frames at their ownership boundaries.
    });
  }, [rebalanceDecodedCaches, session, startupCushionPlanner, store]);

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
    (stream: string, options?: StreamSubscriptionOptions): (() => void) => {
      const cache = streamCachesRef.current.get(stream);
      if (!cache) return noop;

      const colorBy = options?.pointCloudColorBy;
      if (colorBy) {
        const subscriptions =
          pointCloudColorSubscriptionsRef.current.get(stream) ?? new Map();
        subscriptions.set(colorBy, (subscriptions.get(colorBy) ?? 0) + 1);
        pointCloudColorSubscriptionsRef.current.set(stream, subscriptions);
        activePointCloudColorByRef.current.set(
          stream,
          preferredPointCloudColorBy(subscriptions),
        );
      }
      const cleanup = cache.subscribe();
      scheduleAutoSeekToFirstData();
      prefetchLookaheadFrom(getPlayhead(store));
      return () => {
        cleanup();
        if (colorBy) {
          const subscriptions =
            pointCloudColorSubscriptionsRef.current.get(stream);
          const count = subscriptions?.get(colorBy) ?? 0;
          if (count <= 1) subscriptions?.delete(colorBy);
          else subscriptions?.set(colorBy, count - 1);
          if (!subscriptions || subscriptions.size === 0) {
            pointCloudColorSubscriptionsRef.current.delete(stream);
            activePointCloudColorByRef.current.delete(stream);
          } else {
            activePointCloudColorByRef.current.set(
              stream,
              preferredPointCloudColorBy(subscriptions),
            );
          }
        }
        // Cache cleared itself in its own cleanup once the count hit 0;
        // also drop the held-last-frame so a future re-subscribe can't
        // flash stale content from the previous session.
        if (!cache.isActive) {
          lastFrameRef.current.delete(stream);
          // Batches are source-session shared. Keep them alive while another
          // tile still consumes the result; the final consumer releases all
          // speculative ownership.
          if (getActiveStreams().length === 0) {
            cancelIdleReads(session);
            cancelRunwayReads(session);
          }
        }
      };
    },
    [
      getActiveStreams,
      prefetchLookaheadFrom,
      scheduleAutoSeekToFirstData,
      session,
      store,
    ],
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
  const readPointCloudChannel = useCallback(
    (request: {
      readonly activeColorBy: string;
      readonly capacity: number;
      readonly sampledPointCount: number;
      readonly samplePlanKey: string;
      readonly sourceIndices: Uint32Array;
      readonly stream: string;
      readonly timestampNs: bigint;
    }) => {
      const capability = session?.pointCloudProjection;
      if (!capability) {
        return Promise.resolve<PointCloudRenderChannelPayload>({
          kind: "none",
          samplePlanKey: request.samplePlanKey,
        });
      }
      const key = [
        sourceKey,
        request.stream,
        request.timestampNs.toString(),
        request.samplePlanKey,
        request.activeColorBy,
      ].join("\0");
      const cached = pointCloudChannelReadsRef.current.get(key);
      if (cached) return cached;

      const read = capability.readChannel(request).catch((error) => {
        pointCloudChannelReadsRef.current.delete(key);
        throw error;
      });
      pointCloudChannelReadsRef.current.set(key, read);
      while (pointCloudChannelReadsRef.current.size > 64) {
        const oldest = pointCloudChannelReadsRef.current.keys().next().value;
        if (oldest === undefined) break;
        pointCloudChannelReadsRef.current.delete(oldest);
      }
      return read;
    },
    [session, sourceKey],
  );
  // This effect publishes the current recording stream through React context.
  useEffect(() => {
    setDataStream({
      getTimelineIndex,
      getStreamCache,
      ...(session?.pointCloudProjection ? { readPointCloudChannel } : {}),
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
    readPointCloudChannel,
    session?.pointCloudProjection,
  ]);
}

function preferredPointCloudColorBy(
  subscriptions: ReadonlyMap<string, number>,
): string {
  let selected = "auto";
  let selectedCount = -1;
  for (const [colorBy, count] of subscriptions) {
    if (count > selectedCount) {
      selected = colorBy;
      selectedCount = count;
    }
  }
  return selected;
}
