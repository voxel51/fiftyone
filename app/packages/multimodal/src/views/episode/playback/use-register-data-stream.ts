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
import { nsDeltaToSeconds } from "../../../utils/nanoseconds";
import {
  createEpisodePlaybackRuntime,
  createTimelineIndex,
  episodeSourceAccessKey,
  type StreamFramePayloadMeasurementQuality,
  type StreamFrameReadEvidence,
  type StreamFrameReadRequest,
  type StreamFrameReadResult,
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
import { EpisodeStreamCache, releaseArrayBuffers } from "../../../runtime";
import type { StreamPlaybackFrame } from "./use-stream-values";
import {
  pointCloudChannelKey,
  readPointCloudChannelWithCache,
} from "./point-cloud-channel-cache";

/**
 * Trailing-throttle interval for republishing buffered ranges to the timeline
 * strip. Compressed cache intervals make each pass cheap, but publishing at
 * RAF-adjacent status cadence would still create needless playback-store work.
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
  /** Streams whose last indexed message is their presentation boundary. */
  endBoundedStreams: readonly string[];
  /** Capture time to open the recording at, ahead of the first-data tick.
   * Set to an embeddings match so opening a matched tile lands on it. */
  initialSeekTimeNs?: bigint | null;
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
  endBoundedStreams,
  initialSeekTimeNs,
  session,
  onPlayheadDataReady,
  source,
  allStreams,
  staleWarningStreams,
  streamNames,
  streamPolicies,
  timelineSamplingRateHz,
}: UseDataStreamOptions): void {
  const { duration, pause, registerStream, seek, subscribeStream } =
    usePlayback();
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

  // Held in a ref, not a dependency: the auto-seek below is wired into the
  // source lifecycle, and closing over this value directly would tear down
  // and reload the whole recording whenever the match changed.
  const initialSeekTimeNsRef = useRef<bigint | null>(null);
  initialSeekTimeNsRef.current = initialSeekTimeNs ?? null;

  // `seek` clamps to the duration known when it is called, and the timeline
  // index resolves before any stream has reported one. Without this the
  // opening seek is silently clamped to zero.
  const durationRef = useRef(duration);
  durationRef.current = duration;

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
  const streamEndTimesNsRef = useRef<Map<string, bigint | null>>(new Map());
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
  const endBoundedStreamsRef = useRef<ReadonlySet<string>>(
    new Set(endBoundedStreams),
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
  useEffect(() => {
    endBoundedStreamsRef.current = new Set(endBoundedStreams);
  }, [endBoundedStreams]);
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
  // startup buffer, so it never asks the worker for another index/read. An
  // embeddings match overrides that target with the matched window, and needs
  // no stream bounds to do it.
  const maybeAutoSeekToFirstData = useCallback(() => {
    const matchNs = initialSeekTimeNsRef.current;
    // Only for a matched open — an ordinary open would log on every tick
    const trace = (outcome: string, detail: Record<string, unknown> = {}) => {
      if (matchNs === null) return;
      console.debug("[multimodal-embeddings] modal match seek:", {
        outcome,
        matchNs: String(matchNs),
        ...detail,
      });
    };

    const currentEpoch = sourceEpochRef.current;
    if (autoSeekSourceEpochRef.current === currentEpoch) {
      return trace("already-seeked-this-source");
    }
    if (getPlayhead(store) !== 0) {
      return trace("playhead-moved", { playhead: getPlayhead(store) });
    }
    if (getIsPlaying(store) || getIsPlayPending(store)) {
      return trace("already-playing");
    }

    const currentIndex = indexRef.current;
    if (!currentIndex) return trace("no-timeline-index");

    let targetNs = matchNs;
    if (targetNs === null) {
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
      targetNs = latestShortStartTimeNs;
    }

    const tick = currentIndex.tickAt(currentIndex.indexAtOrAfter(targetNs));
    if (tick === undefined) {
      return trace("target-past-timeline-end", {
        recordingStartNs: String(currentIndex.startTimeNs),
        recordingEndNs: String(currentIndex.endTimeNs),
      });
    }

    const targetSec = currentIndex.nsToSec(tick);
    if (targetSec <= 0) {
      return trace("target-at-or-before-start", {
        targetSec,
        recordingStartNs: String(currentIndex.startTimeNs),
      });
    }

    // Deliberately unstamped: a seek issued now would clamp to a duration no
    // stream has published yet, so leave the epoch open and let the retry
    // below run once the recording's real length is known.
    if (targetSec > durationRef.current) {
      return trace("awaiting-duration", {
        targetSec,
        duration: durationRef.current,
      });
    }

    autoSeekSourceEpochRef.current = currentEpoch;
    trace("seeking", { targetSec });
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
    streamEndTimesNsRef.current.clear();
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
          streamEndTimesNsRef.current.set(
            bound.streamId,
            bound.lastTimestampNs,
          );
          const startDeltaNs =
            bound.firstTimestampNs === null
              ? null
              : bound.firstTimestampNs - range.startNs;
          const startSec =
            startDeltaNs === null
              ? null
              : nsDeltaToSeconds(startDeltaNs < 0n ? 0n : startDeltaNs);
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
  // committed to React state; stream bounds can resolve first. It also retries
  // on `duration`, which a stream publishes after the index resolves and
  // which bounds how far the engine will let the opening seek travel.
  useEffect(() => {
    if (index) scheduleAutoSeekToFirstData();
  }, [duration, index, scheduleAutoSeekToFirstData]);

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

  // This effect clears every cache owned by the mounted renderer. Individual
  // tile subscriptions normally release their stream cache when the final
  // consumer unmounts, but the renderer is the ownership boundary: a stale
  // subscription or retained callback must not keep hundreds of MiB of
  // transferred frame buffers alive after the modal closes.
  useEffect(
    () => () => {
      if (bufferedRangesTimerRef.current !== null) {
        clearTimeout(bufferedRangesTimerRef.current);
        bufferedRangesTimerRef.current = null;
      }
      clearPausedIdleWarmupTimer();
      resetDataStreamFetchState(fetchState);
      const transferableBuffers = new Set<ArrayBuffer>();
      for (const cache of streamCachesRef.current.values()) {
        for (const buffer of cache.transferableBuffers()) {
          transferableBuffers.add(buffer);
        }
        cache.clear();
      }
      releaseArrayBuffers(transferableBuffers);
      streamCachesRef.current.clear();
      lastFrameRef.current.clear();
      pointCloudChannelReadsRef.current.clear();
      pointCloudColorSubscriptionsRef.current.clear();
      activePointCloudColorByRef.current.clear();
      streamStartTimesNsRef.current.clear();
      streamEndTimesNsRef.current.clear();
    },
    [clearPausedIdleWarmupTimer, fetchState],
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
      activeStreams: getActiveStreams(),
      blockingStreams: getActiveBlockingStreams(),
      budgetBytes: decodedCacheBudgetBytesRef.current,
      caches: streamCachesRef.current,
      currentLookaheadSeconds: backgroundLookaheadSecondsRef.current,
      index: indexRef.current,
      maxLookaheadSeconds: playbackPolicy.lookaheadSeconds,
      minLookaheadSeconds: playbackPolicy.startupLookaheadSeconds,
      placementCeiling: playbackPolicy.cachePlacementCeiling,
      stepSeconds: playbackPolicy.prefetchBatchSeconds,
      store,
    });
  }, [getActiveBlockingStreams, getActiveStreams, playbackPolicy, store]);

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
            isStreamTimeAvailable: (stream, timeNs) => {
              if (!endBoundedStreamsRef.current.has(stream)) return true;
              const endTimeNs = streamEndTimesNsRef.current.get(stream);
              return endTimeNs === undefined || endTimeNs === null
                ? true
                : timeNs <= endTimeNs;
            },
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

  // A source/runtime replacement owns its read cancellation, including the
  // generic fallback path where no adapter-level source switch exists.
  useEffect(() => () => prefetcher?.cancel(), [prefetcher]);

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
    (request: StreamFrameReadRequest) =>
      readStreamFramesWithinBudget(source ? session : null, request),
    [session, source],
  );
  const readPointCloudChannel = useCallback(
    (request: {
      readonly activeColorBy: string;
      readonly capacity: number;
      readonly sampledPointCount: number;
      readonly samplePlanKey: string;
      readonly signal?: AbortSignal;
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
      const key = pointCloudChannelKey(
        sourceKey,
        request.stream,
        request.timestampNs,
        request.samplePlanKey,
        request.activeColorBy,
      );
      return readPointCloudChannelWithCache(
        pointCloudChannelReadsRef.current,
        key,
        request.signal,
        () => capability.readChannel(request),
      );
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

/**
 * Folds chronological session batches without retaining work beyond the
 * request-local message or observed-payload ceilings. The payload ceiling is
 * intentionally evidence-based: exact physical and decompressed source bounds
 * require a future per-request source-budget account rather than the current
 * session-wide boundedRead account.
 */
export async function readStreamFramesWithinBudget(
  session: Pick<EpisodeSession, "read"> | null,
  request: StreamFrameReadRequest,
): Promise<StreamFrameReadResult<DecodedFrame>> {
  const startedAtMs = monotonicNowMs();
  const frames: DecodedFrame[] = [];
  let observedPayloadBytes = 0;
  let scannedMessages = 0;
  let resourceHintMessages = 0;
  let encodedVideoByteMessages = 0;
  let unknownPayloadMessages = 0;
  let deadlineExpired = startedAtMs >= request.budget.deadlineMs;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const removeAbortListener = () =>
    request.signal?.removeEventListener("abort", abortFromCaller);
  request.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (request.signal?.aborted) controller.abort();

  const finish = (
    stopReason: StreamFrameReadResult<DecodedFrame>["stopReason"],
  ): StreamFrameReadResult<DecodedFrame> => {
    const evidence: StreamFrameReadEvidence = {
      elapsedMs: Math.max(0, monotonicNowMs() - startedAtMs),
      measurementQuality: payloadMeasurementQuality(
        resourceHintMessages,
        encodedVideoByteMessages,
        unknownPayloadMessages,
      ),
      observedPayloadByteOvershoot: Math.max(
        0,
        observedPayloadBytes - request.budget.maxObservedPayloadBytes,
      ),
      observedPayloadBytes,
      scannedMessages,
      unknownPayloadMessages,
    };
    return { evidence, frames, stopReason };
  };

  if (controller.signal.aborted) {
    removeAbortListener();
    return finish("aborted");
  }
  if (deadlineExpired) {
    removeAbortListener();
    return finish("wall-time-ceiling");
  }
  if (!session) {
    removeAbortListener();
    return finish("complete");
  }

  const deadlineTimer = setTimeout(
    () => {
      deadlineExpired = true;
      controller.abort();
    },
    Math.max(0, request.budget.deadlineMs - startedAtMs),
  );

  try {
    for await (const batch of session.read({
      priority: "current",
      signal: controller.signal,
      streams: [request.stream],
      window: { endNs: request.endTimeNs, startNs: request.startTimeNs },
    })) {
      for (const frame of batch.frames) {
        if (request.signal?.aborted) {
          controller.abort();
          return finish("aborted");
        }
        if (monotonicNowMs() >= request.budget.deadlineMs) {
          deadlineExpired = true;
          controller.abort();
          return finish("wall-time-ceiling");
        }
        if (scannedMessages >= request.budget.maxMessages) {
          controller.abort();
          return finish("message-ceiling");
        }

        scannedMessages += 1;
        const measurement = observedPayloadSize(frame);
        observedPayloadBytes += measurement.bytes;
        resourceHintMessages += measurement.kind === "resource-hints" ? 1 : 0;
        encodedVideoByteMessages +=
          measurement.kind === "encoded-video-bytes" ? 1 : 0;
        unknownPayloadMessages += measurement.kind === "unknown" ? 1 : 0;
        if (observedPayloadBytes > request.budget.maxObservedPayloadBytes) {
          controller.abort();
          return finish("observed-byte-ceiling");
        }
        frames.push(frame);
      }
    }
    if (request.signal?.aborted || controller.signal.aborted) {
      return finish(deadlineExpired ? "wall-time-ceiling" : "aborted");
    }
    return finish("complete");
  } catch (error) {
    if (isEpisodeReadCancelledError(error)) {
      return finish(deadlineExpired ? "wall-time-ceiling" : "aborted");
    }
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
    removeAbortListener();
  }
}

function observedPayloadSize(frame: DecodedFrame): {
  readonly bytes: number;
  readonly kind: "encoded-video-bytes" | "resource-hints" | "unknown";
} {
  const hintedSize = frame.output.resourceHints?.sizeBytes;
  if (
    hintedSize !== undefined &&
    Number.isFinite(hintedSize) &&
    hintedSize >= 0
  ) {
    return { bytes: hintedSize, kind: "resource-hints" };
  }
  const visualization = frame.output.visualization;
  if (visualization?.kind === "encoded-video") {
    return {
      bytes: visualization.bytes.byteLength,
      kind: "encoded-video-bytes",
    };
  }
  return { bytes: 0, kind: "unknown" };
}

function payloadMeasurementQuality(
  resourceHintMessages: number,
  encodedVideoByteMessages: number,
  unknownPayloadMessages: number,
): StreamFramePayloadMeasurementQuality {
  const evidenceKinds =
    Number(resourceHintMessages > 0) +
    Number(encodedVideoByteMessages > 0) +
    Number(unknownPayloadMessages > 0);
  if (evidenceKinds > 1) return "mixed";
  if (resourceHintMessages > 0) return "resource-hints";
  if (encodedVideoByteMessages > 0) return "encoded-video-bytes";
  return "unknown";
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
