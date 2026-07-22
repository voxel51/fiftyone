import {
  getBufferedRanges,
  getBufferingDetail,
  getIsBuffering,
  getIsPlayPending,
  getIsPlaying,
  getLoopEnd,
  getLoopStart,
  getPlayhead,
  setBufferedRanges,
  setBufferingDetail,
  setIsBuffering,
  setStreamValue,
  subscribeIsPlayPending,
  subscribePlayhead,
  useIsPlaying,
  usePlayback,
  usePlaybackStore,
  useSeekEvent,
  type PlaybackStore,
  type PlaybackStream,
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
  getEpisodeStreamStatus,
  getEpisodeStreamStaleAgeNs,
  setEpisodeStreamStartTimeSec,
  setEpisodeStreamStaleAgeNs,
  setEpisodeStreamStatus,
  type EpisodeStreamStatus,
} from "./episode-stream-status-state";
import {
  BYTE_SOURCE_READ_PROFILE,
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
  DEFAULT_TIMELINE_TICK_RATE_HZ,
  episodeSourceAccessKey,
  type TimelineIndex,
} from "../../../runtime";
import { useSetEpisodeDataStream } from "./episode-data-stream-context";
import {
  decodedCacheBudgetBytes,
  nextDecodedCacheLookaheadSeconds,
  reportedDeviceMemoryGb,
} from "./episode-decoded-cache-policy";
import {
  getEpisodeNetworkHealth,
  shouldDeferEpisodeIdleWorkForStore,
} from "./episode-network-health";
import {
  activeStreamsInCaches,
  bufferedRangesEqual,
  bufferWindowCoverage,
  contiguousBufferedSecondsFromPlayhead,
  decodeFailuresByStream,
  DEFAULT_EPISODE_PLAYBACK_POLICY,
  deriveEpisodePlaybackPolicy,
  distributeWindowToCaches,
  episodeBatchReadPriority,
  fillMissingLookaheadFrom,
  fillMissingStartupBufferFrom,
  nsToSeconds,
  resetEpisodePlaybackBuffering,
  staleAgeForMessage,
  type EpisodeDataOperation,
} from "./episode-playback-buffering";
import { pushTickToStore } from "./episode-playback-frame-push";
import {
  computeEpisodeStartupCushion,
  MAX_STARTUP_CUSHION_SECONDS,
  MAX_STARTUP_CUSHION_WAIT_SECONDS,
  UNMEASURED_LINK_NOMINAL_WAIT_SECONDS,
  type EpisodeStartupCushion,
} from "./episode-startup-cushion";
import {
  resetEpisodeStartupCushionState,
  setEpisodeStartupCushionState,
} from "./episode-startup-cushion-state";
import { EpisodeStreamCache } from "../../../runtime";
import type { EpisodeStreamPlaybackFrame } from "./use-episode-stream-values";

// One engine stream owns all episode streams so camera/lidar tiles stay on the
// same synchronized timeline and fetch in shared batches.
const STREAM_ID = "episode-data-stream";

/**
 * Consecutive fetch failures per stream before the stream stops retrying
 * the affected ticks. Below the threshold a failure leaves the ticks
 * uncached so the engine's normal prefetch loop retries (covers transient
 * network errors); at the threshold the failed ticks are seeded as
 * "fetched, no message" so one persistently-broken stream can't stall the
 * clock and freeze the whole modal.
 */
const MAX_FETCH_FAILURE_STREAK = 3;

/**
 * Trailing-throttle interval for republishing buffered ranges to the
 * timeline strip. Computing ranges walks every timeline tick, so it must
 * not run at the cadence of status publishes (RAF-adjacent during
 * buffering stalls).
 */
const BUFFERED_RANGES_PUBLISH_INTERVAL_MS = 500;
const PROVISIONAL_REMOTE_START_COVERAGE_SECONDS = 1.5;

const PLAYBACK_POLICY = deriveEpisodePlaybackPolicy(
  DEFAULT_EPISODE_PLAYBACK_POLICY,
);

/**
 * Batches one engine prefetch call may enqueue. The engine widens its
 * pending-start prefetch window to the bandwidth cushion, and the fill
 * must be able to pipeline the whole window — pacing it one batch per
 * buffered-ranges publish would bound filling at ~1 content-second per
 * wall second no matter how fast the link is.
 */
const MAX_ENGINE_PREFETCH_BATCHES_PER_CALL = 8;

const noop = (): void => undefined;

/** Treats cancellation against an already-disposed session as complete. */
export function cancelEpisodeIdleReads(
  session: Pick<EpisodeSession, "cancelIdle"> | null,
): void {
  try {
    session?.cancelIdle?.();
  } catch (error) {
    if (!isEpisodeReadCancelledError(error)) throw error;
  }
}

interface RemoteStartupGateDecision {
  readonly coverageSeconds: number;
  readonly mode: "held" | "provisional";
  readonly playheadSec: number;
  readonly sourceEpoch: number;
}

/** Inputs for registering the shared episode playback stream. */
export interface UseEpisodeDataStreamOptions {
  blockingStreams: readonly string[];
  session: EpisodeSession | null;
  /** Called whenever every blocking stream covers the current playhead. */
  onPlayheadDataReady?: () => void;
  source: ByteSourceDescriptor | null;
  allStreams: readonly string[];
  staleMediaWarningNs: bigint;
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
 *   `EpisodeDataStreamProvider` so tile bodies can subscribe to
 *   individual stream caches without going through an atom.
 */
export function useRegisterEpisodeDataStream({
  blockingStreams,
  session,
  onPlayheadDataReady,
  source,
  allStreams,
  staleMediaWarningNs,
  staleWarningStreams,
  streamPolicies,
}: UseEpisodeDataStreamOptions): void {
  const { pause, registerStream, seek, subscribeStream } = usePlayback();
  const store = usePlaybackStore();
  const isPlaying = useIsPlaying();
  const setDataStream = useSetEpisodeDataStream();
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
  // Pending fetches keyed by tick → set of streams each in-flight request
  // is covering. Per-stream so a request that omits a newly-subscribed
  // stream doesn't make collectMissingTicks think that stream is in flight.
  const pendingTicksRef = useRef<Map<string, Set<string>>>(new Map());
  const lastFrameRef = useRef<Map<string, EpisodeStreamPlaybackFrame<unknown>>>(
    new Map(),
  );
  // Consecutive fetch failures per stream; reset on the first success.
  const failureStreakRef = useRef<Map<string, number>>(new Map());
  // Streams currently in the "failed" state (streak hit the cap). Sticky
  // until a later fetch covering the stream succeeds.
  const failedStreamsRef = useRef<Set<string>>(new Set());
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
  // Pessimistic link-rate envelope for the press currently held by the
  // start gate; null outside a pending session. See resolveStartupCushion.
  const pendingPlanThroughputFloorRef = useRef<number | null>(null);
  const remoteStartupGateDecisionRef = useRef<RemoteStartupGateDecision | null>(
    null,
  );
  const nextLookaheadRefreshTimeRef = useRef(0);
  const lastObservedPlayheadSecRef = useRef<number | null>(null);
  const loopRunwayStartTickKeyRef = useRef<string | null>(null);
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
  const staleMediaWarningNsRef = useRef(staleMediaWarningNs);
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
  // This effect keeps stale-age evaluation current inside stable callbacks.
  useEffect(() => {
    staleMediaWarningNsRef.current = staleMediaWarningNs;
  }, [staleMediaWarningNs]);
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
  const resolveStartupCushion = useCallback((): EpisodeStartupCushion => {
    const currentIndex = indexRef.current;
    if (!currentIndex) {
      return {
        cushionSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
        estimatedWaitSeconds: 0,
      };
    }
    const loopStartSec = getLoopStart(store);
    const loopEndSec = getLoopEnd(store);
    const horizonSec =
      loopEndSec > loopStartSec
        ? Math.min(currentIndex.durationSec, loopEndSec)
        : currentIndex.durationSec;
    const playheadSec = getPlayhead(store);
    const health = getEpisodeNetworkHealth(store);

    // A remote press with no planning-grade measurement must not resolve
    // to the floor: the estimator at press time reads idle spans and first
    // bursts, and both a stale-low figure (wall-cap walk-down) and a
    // burst-high one (no-deficit) collapse the gate before the link is
    // known. Hold at the ceiling instead — the pending prefetch this
    // triggers delivers real samples within a fetch round-trip, and the
    // live getter re-resolves to the measured plan (fast links: the
    // floor; coverage already banked clears the gate untouched).
    const spanSeconds = horizonSec - playheadSec;
    if (
      sourceReadProfile === BYTE_SOURCE_READ_PROFILE.REMOTE &&
      !health.throughputPlannable &&
      byteTimelineRef.current !== null &&
      byteTimelineRef.current.length > 0 &&
      spanSeconds > PLAYBACK_POLICY.startupLookaheadSeconds
    ) {
      const sourceEpoch = sourceEpochRef.current;
      let decision = remoteStartupGateDecisionRef.current;
      if (decision?.sourceEpoch !== sourceEpoch) {
        decision = null;
        remoteStartupGateDecisionRef.current = null;
      }
      if (decision === null) {
        const coverageSeconds = contiguousBufferedSecondsFromPlayhead({
          activeStreams: getActiveBlockingStreams(),
          caches: streamCachesRef.current,
          index: currentIndex,
          maxSeconds: PROVISIONAL_REMOTE_START_COVERAGE_SECONDS,
          timeSec: playheadSec,
        });
        decision = {
          coverageSeconds,
          mode:
            coverageSeconds >= PROVISIONAL_REMOTE_START_COVERAGE_SECONDS
              ? "provisional"
              : "held",
          playheadSec,
          sourceEpoch,
        };
        remoteStartupGateDecisionRef.current = decision;
      }
      if (decision.mode === "provisional") {
        return {
          cushionSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
          estimatedWaitSeconds: 0,
        };
      }
      return {
        cushionSeconds: Math.min(MAX_STARTUP_CUSHION_SECONDS, spanSeconds),
        estimatedWaitSeconds: UNMEASURED_LINK_NOMINAL_WAIT_SECONDS,
      };
    }

    // Plan from transfer-busy throughput: the wall-window figure decays
    // across idle spans and would walk the cushion down on a link that
    // was merely quiet, not slow.
    let planThroughput =
      health.busyThroughputBytesPerSec ?? health.throughputBytesPerSec;
    // Until the press commits, the link estimate may only ratchet down:
    // the estimator re-reads bursts as the window turns over, and one
    // 48ms-optimistic evaluation would otherwise release a gate that the
    // previous evaluation had sized seconds of coverage for. The envelope
    // must capture the press-time evaluation too — it runs before the
    // pending flag flips — so it tracks every non-playing evaluation and
    // resets when the pending session ends. Pipelined pending fills load
    // the link exactly like playback will, so the pessimistic envelope
    // converges to the sustainable rate.
    if (planThroughput !== null && !getIsPlaying(store)) {
      planThroughput = Math.min(
        pendingPlanThroughputFloorRef.current ?? planThroughput,
        planThroughput,
      );
      pendingPlanThroughputFloorRef.current = planThroughput;
    }

    return computeEpisodeStartupCushion({
      byteTimeline: byteTimelineRef.current,
      horizonSec,
      minimumSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
      playheadSec,
      startTimeNs: currentIndex.startTimeNs,
      throughputBytesPerSec: planThroughput,
    });
  }, [getActiveBlockingStreams, sourceReadProfile, store]);

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

  // Pending helpers — wrap the per-tick stream sets so call sites read
  // like simple predicates instead of repeating the get/has dance.
  const isStreamPending = (tickKey: string, stream: string): boolean =>
    pendingTicksRef.current.get(tickKey)?.has(stream) ?? false;
  const markStreamsPending = (
    tickKeys: readonly string[],
    streams: readonly string[],
  ): void => {
    const pending = pendingTicksRef.current;
    for (const key of tickKeys) {
      let covered = pending.get(key);
      if (!covered) {
        covered = new Set();
        pending.set(key, covered);
      }
      for (const t of streams) covered.add(t);
    }
  };
  const clearStreamsPending = (
    tickKeys: readonly string[],
    streams: readonly string[],
  ): void => {
    const pending = pendingTicksRef.current;
    for (const key of tickKeys) {
      const covered = pending.get(key);
      if (!covered) continue;
      for (const t of streams) covered.delete(t);
      if (covered.size === 0) pending.delete(key);
    }
  };

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
    pendingTicksRef.current.clear();
    lastFrameRef.current.clear();
    failureStreakRef.current.clear();
    failedStreamsRef.current.clear();
    streamStartTimesNsRef.current.clear();
    autoSeekSourceEpochRef.current = null;
    pendingPlanThroughputFloorRef.current = null;
    remoteStartupGateDecisionRef.current = null;
    nextLookaheadRefreshTimeRef.current = 0;
    backgroundLookaheadSecondsRef.current = PLAYBACK_POLICY.lookaheadSeconds;
    lastObservedPlayheadSecRef.current = null;
    loopRunwayStartTickKeyRef.current = null;
    clearPausedIdleWarmupTimer();
    for (const cache of streamCachesRef.current.values()) {
      cache.clear();
    }
    for (const stream of streamCachesRef.current.keys()) {
      setStreamValue(store, stream, null);
      setEpisodeStreamStatus(store, stream, "loading");
      setEpisodeStreamStaleAgeNs(store, stream, null);
      setEpisodeStreamStartTimeSec(store, stream, null);
    }
    resetEpisodePlaybackBuffering(store);
    resetEpisodeStartupCushionState(store);
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
          setEpisodeStreamStartTimeSec(store, bound.streamId, startSec);
        }
        maybeAutoSeekToFirstData();
      })
      .catch(noop);
    return () => {
      cancelled = true;
    };
  }, [
    clearPausedIdleWarmupTimer,
    maybeAutoSeekToFirstData,
    playback,
    source,
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
    const currentIndex = indexRef.current;
    if (!currentIndex) return [];
    const activeStreams = getActiveBlockingStreams();
    if (activeStreams.length === 0) return [];
    const caches = streamCachesRef.current;
    const firstCache = caches.get(activeStreams[0]);
    if (!firstCache) return [];
    const { durationSec } = currentIndex;
    const nominalTickSec = 1 / DEFAULT_TIMELINE_TICK_RATE_HZ;

    const ranges: Array<[number, number]> = [];
    const indexes: number[] = [];
    const seenIndexes = new Set<number>();
    for (const tick of firstCache.cachedTicks()) {
      const tickIndex = currentIndex.indexOfTick(tick);
      if (tickIndex === undefined || seenIndexes.has(tickIndex)) continue;
      let covered = true;
      for (const stream of activeStreams) {
        if (!caches.get(stream)?.has(tick)) {
          covered = false;
          break;
        }
      }
      if (covered) {
        seenIndexes.add(tickIndex);
        indexes.push(tickIndex);
      }
    }
    if (indexes.length === 0) return ranges;

    indexes.sort((a, b) => a - b);

    const pushRange = (startIndex: number, endIndex: number): void => {
      const startTick = currentIndex.tickAt(startIndex);
      const endTick = currentIndex.tickAt(endIndex);
      if (startTick === undefined || endTick === undefined) return;
      ranges.push([
        currentIndex.nsToSec(startTick),
        Math.min(currentIndex.nsToSec(endTick) + nominalTickSec, durationSec),
      ]);
    };

    let runStartIndex = indexes[0];
    let runEndIndex = runStartIndex;
    for (let i = 1; i < indexes.length; i++) {
      const nextIndex = indexes[i];
      if (nextIndex === runEndIndex + 1) {
        runEndIndex = nextIndex;
        continue;
      }
      pushRange(runStartIndex, runEndIndex);
      runStartIndex = nextIndex;
      runEndIndex = nextIndex;
    }
    pushRange(runStartIndex, runEndIndex);
    return ranges;
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
    pendingPlanThroughputFloorRef.current = null;
    remoteStartupGateDecisionRef.current = null;
  }, [isPlaying]);

  // Recompute per-stream status at the current playhead tick and the
  // aggregate buffering detail ("N/M streams"). Same-value atom writes are
  // no-ops, so calling this from RAF-adjacent paths (stream.prefetch,
  // onCommit) only wakes React on actual transitions.
  const publishStreamStatuses = useCallback(() => {
    const activeStreams = getActiveStreams();
    const activeBlockingStreams = getActiveBlockingStreams();
    const blockingStreamSet = new Set(activeBlockingStreams);
    const caches = streamCachesRef.current;
    const failed = failedStreamsRef.current;
    const tick = indexRef.current?.nearestTick(getPlayhead(store)) ?? null;

    let blockingCovered = 0;
    for (const stream of activeStreams) {
      const cache = caches.get(stream);

      let status: EpisodeStreamStatus;
      let staleAgeNs: bigint | null = null;
      if (tick === null || !cache?.has(tick)) {
        status = failed.has(stream) ? "failed" : "loading";
      } else {
        if (blockingStreamSet.has(stream)) {
          blockingCovered += 1;
        }
        if (failed.has(stream)) {
          status = "failed";
        } else {
          const msg = cache.get(tick);
          if (!msg) {
            status = "gap";
          } else if (staleWarningStreamsRef.current.has(stream)) {
            staleAgeNs = staleAgeForMessage(
              tick,
              msg,
              staleMediaWarningNsRef.current,
            );
            status = staleAgeNs === null ? "ready" : "stale";
          } else {
            status = "ready";
          }
        }
      }
      if (getEpisodeStreamStaleAgeNs(store, stream) !== staleAgeNs) {
        setEpisodeStreamStaleAgeNs(store, stream, staleAgeNs);
      }
      if (getEpisodeStreamStatus(store, stream) !== status) {
        setEpisodeStreamStatus(store, stream, status);
      }
    }

    const blockingTotal = activeBlockingStreams.length;
    const detail =
      tick !== null && blockingTotal > 0 && blockingCovered < blockingTotal
        ? `${blockingCovered}/${blockingTotal} streams`
        : null;
    if (getBufferingDetail(store) !== detail) {
      setBufferingDetail(store, detail);
    }

    // Paused catch-up completion: the engine flags buffering on a
    // seek/step into uncached data but has no tick to clear it while
    // paused — once every active stream covers the playhead tick, the
    // wait is over. (Never *set* the flag here; the engine owns that.)
    if (
      tick !== null &&
      blockingTotal > 0 &&
      blockingCovered === blockingTotal &&
      getIsBuffering(store)
    ) {
      setIsBuffering(store, false);
      // The stall is over — re-push the playhead tick so values held
      // through it re-resolve, and a fetched tick with genuinely no
      // message settles to its honest empty state.
      pushTickToStore(
        activeStreams,
        tick,
        caches,
        lastFrameRef.current,
        store,
        failed,
      );
    }

    const playheadSec = getPlayhead(store);
    const startupCoverage =
      tick !== null && blockingTotal > 0
        ? bufferWindowCoverage({
            activeStreams: activeBlockingStreams,
            caches,
            index: indexRef.current,
            lookaheadSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
            maxTicks: PLAYBACK_POLICY.startupMaxPrefetchBatch,
            timeSec: playheadSec,
          })
        : null;
    const startupReady =
      !!startupCoverage?.total &&
      startupCoverage.covered === startupCoverage.total;

    publishStartupCushionProgress({
      activeBlockingStreams,
      caches,
      index: indexRef.current,
      playheadSec,
      resolveStartupCushion,
      store,
      tick,
    });

    if (
      tick !== null &&
      blockingTotal > 0 &&
      blockingCovered === blockingTotal
    ) {
      onPlayheadDataReadyRef.current?.();
    }

    // Every data-flow event that can change statuses can also change
    // coverage — refresh the timeline's buffered shading (throttled).
    if (startupReady && getIsPlayPending(store)) {
      publishBufferedRangesNow();
    } else {
      scheduleBufferedRangesPublish();
    }

    if (startupReady && !getIsPlaying(store) && !getIsPlayPending(store)) {
      schedulePausedIdleWarmupRef.current?.(
        PLAYBACK_POLICY.prefetchRefreshSeconds * 1000,
      );
    }
  }, [
    getActiveStreams,
    getActiveBlockingStreams,
    publishBufferedRangesNow,
    resolveStartupCushion,
    scheduleBufferedRangesPublish,
    store,
  ]);

  // This effect updates stale/ready badges after sidebar threshold changes,
  // including while the playhead is paused.
  useEffect(() => {
    publishStreamStatuses();
  }, [publishStreamStatuses, staleMediaWarningNs]);

  // Failure bookkeeping for one rejected fetch. Below the streak cap the
  // ticks stay uncached so the engine retries; at the cap the requested
  // ticks are sealed as "no message" so playback can move past the
  // failure, and the stream surfaces as "failed" until a fetch succeeds.
  const handleFetchFailure = useCallback(
    (error: unknown, ticks: readonly bigint[], streams: readonly string[]) => {
      const newlyFailed: string[] = [];
      for (const stream of streams) {
        const streak = (failureStreakRef.current.get(stream) ?? 0) + 1;
        failureStreakRef.current.set(stream, streak);
        if (streak < MAX_FETCH_FAILURE_STREAK) continue;
        if (!failedStreamsRef.current.has(stream)) {
          failedStreamsRef.current.add(stream);
          newlyFailed.push(stream);
        }
        const cache = streamCachesRef.current.get(stream);
        if (cache?.isActive) {
          for (const tick of ticks) {
            if (!cache.has(tick)) cache.set(tick, null);
          }
        }
      }
      if (newlyFailed.length > 0) {
        console.warn(
          `[episode] giving up on streams after ${MAX_FETCH_FAILURE_STREAK} failed fetches:`,
          newlyFailed,
          error,
        );
      }
      // Statuses are republished by the caller's `.finally`, after the
      // pending bookkeeping for this fetch is cleared.
    },
    [],
  );

  const handleFetchSuccess = useCallback((streams: readonly string[]) => {
    for (const stream of streams) {
      failureStreakRef.current.delete(stream);
      failedStreamsRef.current.delete(stream);
    }
  }, []);

  const rebalanceDecodedCaches = useCallback(
    (pruneSpeculative: boolean) => {
      const currentIndex = indexRef.current;
      if (!currentIndex) return;

      const caches = streamCachesRef.current;
      let decodedBytes = 0;
      for (const cache of caches.values()) {
        decodedBytes += cache.decodedBytes;
      }

      const budgetBytes = decodedCacheBudgetBytesRef.current;
      backgroundLookaheadSecondsRef.current = nextDecodedCacheLookaheadSeconds({
        budgetBytes,
        currentSeconds: backgroundLookaheadSecondsRef.current,
        decodedBytes,
        maxSeconds: PLAYBACK_POLICY.lookaheadSeconds,
        minSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
        stepSeconds: PLAYBACK_POLICY.prefetchBatchSeconds,
      });

      if (decodedBytes <= budgetBytes || !pruneSpeculative) return;

      const playheadSec = getPlayhead(store);
      const protectedStartTick = currentIndex.nearestTick(
        Math.max(0, playheadSec - PLAYBACK_POLICY.startupLookaheadSeconds),
      );
      const protectedEndTick = currentIndex.nearestTick(
        Math.min(
          currentIndex.durationSec,
          playheadSec + backgroundLookaheadSecondsRef.current,
        ),
      );
      if (protectedStartTick === undefined || protectedEndTick === undefined) {
        return;
      }

      for (const cache of caches.values()) {
        cache.pruneOutside(protectedStartTick, protectedEndTick);
      }
    },
    [store],
  );

  // Core batch-fetch helper. Fetches ticks for the active stream set, fills
  // per-stream caches, and (since the engine doesn't tick when paused) also
  // pushes any fetched frame at the current playhead to atoms so paused
  // tiles render their first frame as soon as the network resolves.
  const fetchBatch = useCallback(
    (
      ticks: bigint[],
      activeStreams: string[],
      operation: EpisodeDataOperation,
    ) => {
      if (
        ticks.length === 0 ||
        activeStreams.length === 0 ||
        !source ||
        !playback
      ) {
        return false;
      }
      const sourceEpoch = sourceEpochRef.current;
      const caches = streamCachesRef.current;

      // Only include a tick if at least one active stream needs it (not
      // already pending for that stream). A tick that's fully covered by
      // in-flight requests across every active stream is dropped.
      const toFetch = ticks.filter((tick) => {
        const tickKey = tick.toString();
        return activeStreams.some((t) => !isStreamPending(tickKey, t));
      });
      if (toFetch.length === 0) return false;

      const keys = toFetch.map((t) => t.toString());
      const streamsToFetch = activeStreams.filter((stream) =>
        toFetch.some((tick) => {
          const tickKey = tick.toString();
          return (
            !caches.get(stream)?.has(tick) && !isStreamPending(tickKey, stream)
          );
        }),
      );
      if (streamsToFetch.length === 0) return false;

      const batchPriority = episodeBatchReadPriority(operation);

      markStreamsPending(keys, streamsToFetch);

      playback
        .readSynchronizedBatch(
          {
            streamPolicies: streamPoliciesRef.current,
            streams: streamsToFetch,
            timeNs: toFetch,
          },
          {
            priority: batchPriority,
          },
        )
        .then((windows) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          const decodeFailures = decodeFailuresByStream(windows);
          handleFetchSuccess(
            streamsToFetch.filter((stream) => !decodeFailures.has(stream)),
          );

          const activeFetchedStreams = activeStreamsInCaches(
            caches,
            streamsToFetch,
          );
          if (activeFetchedStreams.length === 0) return;

          for (const window of windows) {
            distributeWindowToCaches(
              window,
              caches,
              activeFetchedStreams.filter(
                (stream) => !window.diagnosticsByStream?.[stream],
              ),
              {
                pinned: operation === "loopback-lookahead",
              },
            );
          }
          for (const [stream, failure] of decodeFailures) {
            handleFetchFailure(
              new Error(failure.messages.join("; ")),
              failure.ticks,
              [stream],
            );
          }
          rebalanceDecodedCaches(operation === "background-lookahead");
          const currentIndex = indexRef.current;
          if (!currentIndex) return;
          const tick = currentIndex.nearestTick(getPlayhead(store));
          const stillActiveStreams = activeStreamsInCaches(
            caches,
            activeStreams,
          );
          // Explicit undefined check — `0n` is falsy but a valid tick.
          if (tick !== undefined) {
            pushTickToStore(
              stillActiveStreams,
              tick,
              caches,
              lastFrameRef.current,
              store,
              failedStreamsRef.current,
            );
          }
        })
        .catch((error) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          // Deliberate cancellation (seek reclaiming the link) is benign:
          // no failure streaks — the ticks simply stay unfetched, and the
          // caller's `.finally` still clears pending bookkeeping so future
          // passes can re-request them.
          if (isEpisodeReadCancelledError(error)) {
            return;
          }
          handleFetchFailure(error, toFetch, streamsToFetch);
        })
        .finally(() => {
          if (sourceEpochRef.current !== sourceEpoch) return;

          clearStreamsPending(keys, streamsToFetch);
          publishStreamStatuses();
        });

      return true;
    },
    [
      playback,
      source,
      store,
      handleFetchFailure,
      handleFetchSuccess,
      publishStreamStatuses,
      rebalanceDecodedCaches,
    ],
  );

  // Fetch the nearest target frame through the worker's current-frame lane so
  // mount, seek, subscription, and buffering recovery do not wait behind a
  // larger background lookahead batch.
  const fetchCurrentFrame = useCallback(
    (tick: bigint, activeStreams: string[]) => {
      if (activeStreams.length === 0 || !source || !playback) {
        return false;
      }

      const sourceEpoch = sourceEpochRef.current;
      const caches = streamCachesRef.current;
      const tickKey = tick.toString();
      const streamsToFetch = activeStreams.filter(
        (stream) =>
          !caches.get(stream)?.has(tick) && !isStreamPending(tickKey, stream),
      );
      if (streamsToFetch.length === 0) return false;

      markStreamsPending([tickKey], streamsToFetch);

      playback
        .readSynchronized({
          streamPolicies: streamPoliciesRef.current,
          streams: streamsToFetch,
          timeNs: tick,
        })
        .then((window) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          const decodeFailures = decodeFailuresByStream([window]);
          handleFetchSuccess(
            streamsToFetch.filter((stream) => !decodeFailures.has(stream)),
          );

          const activeFetchedStreams = activeStreamsInCaches(
            caches,
            streamsToFetch,
          );
          if (activeFetchedStreams.length === 0) return;

          distributeWindowToCaches(
            window,
            caches,
            activeFetchedStreams.filter(
              (stream) => !window.diagnosticsByStream?.[stream],
            ),
          );
          for (const [stream, failure] of decodeFailures) {
            handleFetchFailure(
              new Error(failure.messages.join("; ")),
              failure.ticks,
              [stream],
            );
          }
          rebalanceDecodedCaches(false);
          pushTickToStore(
            activeStreamsInCaches(caches, activeStreams),
            tick,
            caches,
            lastFrameRef.current,
            store,
            failedStreamsRef.current,
          );
        })
        .catch((error) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          if (isEpisodeReadCancelledError(error)) return;
          handleFetchFailure(error, [tick], streamsToFetch);
        })
        .finally(() => {
          if (sourceEpochRef.current !== sourceEpoch) return;

          clearStreamsPending([tickKey], streamsToFetch);
          publishStreamStatuses();
        });

      return true;
    },
    [
      playback,
      source,
      store,
      handleFetchFailure,
      handleFetchSuccess,
      publishStreamStatuses,
      rebalanceDecodedCaches,
    ],
  );

  // Collect ticks in [startSec, endSec] where at least one requested stream
  // still needs the data — i.e. not cached and not already pending for
  // that specific stream. Capped by the resolved playback policy.
  const collectMissingTicksForStreams = useCallback(
    (
      startSec: number,
      endSec: number,
      maxTicks: number,
      streams: readonly string[],
    ): bigint[] => {
      const currentIndex = indexRef.current;
      if (!currentIndex) return [];
      if (streams.length === 0) return [];
      const caches = streamCachesRef.current;
      const startNs = currentIndex.secToNs(startSec);
      const endNs = currentIndex.secToNs(endSec);
      // Jump to the first tick >= startNs so this runs in O(window) per RAF
      // prefetch without materializing the global tick grid.
      const startIdx = currentIndex.indexAtOrAfter(startNs);
      const toFetch: bigint[] = [];
      for (let i = startIdx; i < currentIndex.tickCount; i++) {
        const tick = currentIndex.tickAt(i);
        if (tick === undefined) break;
        if (tick > endNs) break;
        const tickKey = tick.toString();
        const needsFetch = streams.some(
          (t) => !caches.get(t)?.has(tick) && !isStreamPending(tickKey, t),
        );
        if (needsFetch) toFetch.push(tick);
        if (toFetch.length >= maxTicks) break;
      }
      return toFetch;
    },
    [],
  );

  const warmLoopStartRunway = useCallback(
    (timeSec: number, activeStreams: string[]): boolean => {
      const currentIndex = indexRef.current;
      if (!currentIndex || activeStreams.length === 0) return false;

      const loopStartSec = getLoopStart(store);
      const loopEndSec = getLoopEnd(store);
      if (loopEndSec <= loopStartSec) return false;
      if (timeSec <= loopStartSec + PLAYBACK_POLICY.startupLookaheadSeconds) {
        return false;
      }

      const secondsToLoopEnd = loopEndSec - timeSec;
      const lookaheadSeconds = backgroundLookaheadSecondsRef.current;
      if (secondsToLoopEnd < 0 || secondsToLoopEnd > lookaheadSeconds) {
        return false;
      }

      const loopStartTick = currentIndex.nearestTick(loopStartSec);
      if (loopStartTick === undefined) return false;

      const loopStartTickKey = loopStartTick.toString();
      if (loopRunwayStartTickKeyRef.current !== loopStartTickKey) {
        loopRunwayStartTickKeyRef.current = loopStartTickKey;
        for (const cache of streamCachesRef.current.values()) {
          cache.clearPinned();
        }
      }

      const missing = collectMissingTicksForStreams(
        loopStartSec,
        loopStartSec + lookaheadSeconds,
        PLAYBACK_POLICY.maxPrefetchBatch,
        activeStreams,
      );

      if (missing.length === 0) {
        return false;
      }

      return fetchBatch(missing, activeStreams, "loopback-lookahead");
    },
    [collectMissingTicksForStreams, fetchBatch, store],
  );

  const runPausedIdleWarmup = useCallback((): boolean => {
    const currentIndex = indexRef.current;
    if (
      !currentIndex ||
      !source ||
      getIsPlaying(store) ||
      getIsPlayPending(store)
    ) {
      return false;
    }

    const timeSec = getPlayhead(store);
    const activeStreams = getActiveStreams();
    const activeBlockingStreams = getActiveBlockingStreams();
    if (activeStreams.length === 0 || activeBlockingStreams.length === 0) {
      return false;
    }

    const startupCoverage = bufferWindowCoverage({
      activeStreams: activeBlockingStreams,
      caches: streamCachesRef.current,
      index: currentIndex,
      lookaheadSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
      maxTicks: PLAYBACK_POLICY.startupMaxPrefetchBatch,
      timeSec,
    });
    if (
      !startupCoverage?.total ||
      startupCoverage.covered < startupCoverage.total
    ) {
      return false;
    }

    if (warmLoopStartRunway(timeSec, activeStreams)) {
      return true;
    }

    const endSec =
      timeSec +
      Math.min(
        PLAYBACK_POLICY.pausedWarmupRunwaySeconds,
        backgroundLookaheadSecondsRef.current,
      );
    const blockingMissing = collectMissingTicksForStreams(
      timeSec,
      endSec,
      PLAYBACK_POLICY.maxPrefetchBatch,
      activeBlockingStreams,
    );
    if (
      blockingMissing.length > 0 &&
      fetchBatch(blockingMissing, activeBlockingStreams, "background-lookahead")
    ) {
      return true;
    }

    const allMissing = collectMissingTicksForStreams(
      timeSec,
      endSec,
      PLAYBACK_POLICY.maxPrefetchBatch,
      activeStreams,
    );
    if (
      allMissing.length > 0 &&
      fetchBatch(allMissing, activeStreams, "background-lookahead")
    ) {
      return true;
    }

    return false;
  }, [
    collectMissingTicksForStreams,
    fetchBatch,
    getActiveBlockingStreams,
    getActiveStreams,
    source,
    store,
    warmLoopStartRunway,
  ]);

  const schedulePausedIdleWarmup = useCallback(
    (delayMs = 0) => {
      if (pausedIdleWarmupTimerRef.current !== null) return;

      pausedIdleWarmupTimerRef.current = setTimeout(() => {
        pausedIdleWarmupTimerRef.current = null;
        // A gated pass must keep the loop alive: retry on the same cadence
        // so warmup resumes the moment the constrained wait clears.
        if (
          shouldDeferEpisodeIdleWorkForStore(
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

  // Push cached current frame for the active set, request a missing current
  // frame on the priority lane, and then enqueue bounded background lookahead
  // so mount, tile subscribe, and seek paint before bulk prefetch completes.
  const prefetchLookaheadFrom = useCallback(
    (timeSec: number) => {
      const currentIndex = indexRef.current;
      if (!currentIndex) return;
      const activeStreams = getActiveStreams();
      if (activeStreams.length === 0) return;
      nextLookaheadRefreshTimeRef.current = timeSec;

      // One all-active batch monopolizes the serial worker lane. Fetch the
      // blocking visual set first so a large non-blocking static overlay (the
      // NuScenes /map message is ~19 MB) cannot sit in front of cameras and
      // point clouds. Non-blocking overlays still get their own immediate
      // request, but it queues behind the content that removes the poster.
      const blockingSet = blockingStreamsRef.current;
      const activeBlockingStreams = activeStreams.filter((stream) =>
        blockingSet.has(stream),
      );
      const overlayStreams =
        activeBlockingStreams.length > 0
          ? activeStreams.filter((stream) => !blockingSet.has(stream))
          : [];
      const heavyStreams =
        activeBlockingStreams.length > 0
          ? activeBlockingStreams
          : activeStreams;

      const tick = currentIndex.nearestTick(timeSec);
      // Explicit undefined check — `0n` is falsy but a valid tick.
      if (tick !== undefined) {
        pushTickToStore(
          activeStreams,
          tick,
          streamCachesRef.current,
          lastFrameRef.current,
          store,
          failedStreamsRef.current,
        );
        fetchCurrentFrame(tick, heavyStreams);
        if (overlayStreams.length > 0) {
          fetchCurrentFrame(tick, overlayStreams);
        }
      }

      // The startup gate measures coverage over blocking streams, so its
      // fill matches that set; overlay lookahead arrives through the
      // regular background top-ups.
      fillMissingStartupBufferFrom({
        activeStreams: heavyStreams,
        collectMissingTicks: (startSec, endSec, maxTicks) =>
          collectMissingTicksForStreams(
            startSec,
            endSec,
            maxTicks,
            heavyStreams,
          ),
        fetchBatch,
        policy: PLAYBACK_POLICY,
        timeSec,
      });

      // Surface "loading" immediately on seek/mount/subscribe — the
      // fetches kicked off above republish when they settle.
      publishStreamStatuses();
    },
    [
      collectMissingTicksForStreams,
      fetchBatch,
      fetchCurrentFrame,
      getActiveStreams,
      publishStreamStatuses,
      store,
    ],
  );

  // This effect registers the engine stream and proactive lookahead subscription.
  useEffect(() => {
    if (!index || !source) return undefined;

    const nativeStep = 1 / DEFAULT_TIMELINE_TICK_RATE_HZ;
    const caches = streamCachesRef.current;
    const lastFrame = lastFrameRef.current;
    let lastCommittedTickKey: string | null = null;

    const stream: PlaybackStream = {
      id: STREAM_ID,
      blocking: true,
      duration: index.durationSec,
      nativeStepSeconds: nativeStep,
      // Bandwidth-aware start gate: the engine reads these on every pending
      // evaluation, so the getters keep the required runway (and the window
      // its pending prefetches fill) sized to live link throughput. On
      // healthy links both resolve to the static policy floor.
      // Message-only layouts have no playback-stream caches to warm, so
      // report zero runway instead of waiting on empty buffered ranges.
      get lookaheadSeconds() {
        if (getActiveBlockingStreams().length === 0) return 0;
        return resolveStartupCushion().cushionSeconds;
      },
      get startupBufferSeconds() {
        if (getActiveBlockingStreams().length === 0) return 0;
        return resolveStartupCushion().cushionSeconds;
      },
      startupBufferMaxWaitSeconds: MAX_STARTUP_CUSHION_WAIT_SECONDS,
      bufferedRanges: computeBufferedRanges,

      bufferState: (timeSec) => {
        const tick = index.nearestTick(timeSec);
        // Explicit undefined check — `0n` is falsy but a valid tick
        // (files with relative log times start at exactly 0n, and a
        // falsy check here wedges the engine at t=0 forever).
        if (tick === undefined) {
          return "missing";
        }
        const activeStreams = getActiveBlockingStreams();
        if (activeStreams.length === 0) return "ready";
        const tickKey = tick.toString();
        let missingStreams = 0;
        let pendingStreams = 0;
        for (const t of activeStreams) {
          if (caches.get(t)?.has(tick)) {
            continue;
          }
          if (isStreamPending(tickKey, t)) {
            pendingStreams++;
          } else {
            missingStreams++;
          }
        }
        const state =
          missingStreams > 0
            ? "missing"
            : pendingStreams > 0
              ? "loading"
              : "ready";
        return state;
      },

      prefetch: ([startSec, endSec]) => {
        const activeStreams = getActiveStreams();
        const tick = index.nearestTick(startSec);
        // Explicit undefined check — `0n` is falsy but a valid tick.
        if (tick !== undefined) fetchCurrentFrame(tick, activeStreams);
        // Fill the whole requested window in bounded batches: with the
        // bandwidth cushion the engine can ask for several seconds here,
        // and the batches must be in flight together to pipeline the
        // link. Pending-tick bookkeeping keeps repeat calls idempotent.
        for (let i = 0; i < MAX_ENGINE_PREFETCH_BATCHES_PER_CALL; i++) {
          const missing = collectMissingTicksForStreams(
            startSec,
            endSec,
            PLAYBACK_POLICY.maxPrefetchBatch,
            activeStreams,
          );
          if (missing.length === 0) break;
          if (!fetchBatch(missing, activeStreams, "playback-prefetch")) break;
        }
        // Mid-playback stall: keep per-stream statuses and the "N/M
        // streams" detail fresh while the engine waits. Same-value
        // writes are no-ops, so RAF-rate calls stay cheap.
        publishStreamStatuses();
      },

      onCommit: (timeSec, commitStore) => {
        const tick = index.nearestTick(timeSec);
        // Explicit undefined check — `0n` is falsy but a valid tick.
        if (tick === undefined) return;
        const tickKey = tick.toString();
        if (lastCommittedTickKey === tickKey) return;
        lastCommittedTickKey = tickKey;
        const activeStreams = getActiveStreams();
        pushTickToStore(
          activeStreams,
          tick,
          caches,
          lastFrame,
          commitStore,
          failedStreamsRef.current,
        );
        // The committed tick changed — gaps/ready flips happen here
        // during normal playback.
        publishStreamStatuses();
      },
    };

    const unregister = registerStream(stream);
    // Keep the stream permanently active — subscriber count is managed
    // per-stream via EpisodeStreamCache, not at the engine stream level.
    const unsubscribe = subscribeStream(STREAM_ID);

    // Pending-play flips re-evaluate statuses immediately: the gated-start
    // progress (chip ETA) appears with the press and clears the moment
    // playback starts, instead of waiting for the next fetch to settle.
    // A session end (press committed or cancelled) also closes the plan's
    // pessimistic link-rate envelope; the next press re-seeds it from its
    // own press-time evaluation.
    const unsubPlayPending = subscribeIsPlayPending(store, () => {
      if (!getIsPlayPending(store)) {
        pendingPlanThroughputFloorRef.current = null;
        remoteStartupGateDecisionRef.current = null;
      }
      publishStreamStatuses();
    });

    // Proactive lookahead: fill the buffer ahead of the playhead in larger
    // chunks instead of creating one tiny worker request per source tick.
    const unsubPlayhead = subscribePlayhead(store, () => {
      const timeSec = getPlayhead(store);
      const previousPlayheadSec = lastObservedPlayheadSecRef.current;
      const movedBackward =
        previousPlayheadSec !== null &&
        timeSec + nativeStep < previousPlayheadSec;
      lastObservedPlayheadSecRef.current = timeSec;
      if (movedBackward) {
        nextLookaheadRefreshTimeRef.current = 0;
      }
      // A committed frame while playing means any held press has resolved
      // (instant starts never flip the pending flag, so the falling-edge
      // reset can miss); stale envelopes must not pin future presses.
      if (getIsPlaying(store)) {
        pendingPlanThroughputFloorRef.current = null;
        remoteStartupGateDecisionRef.current = null;
      }
      if (timeSec < nextLookaheadRefreshTimeRef.current) return;
      nextLookaheadRefreshTimeRef.current =
        timeSec + PLAYBACK_POLICY.prefetchRefreshSeconds;
      const activeStreams = getActiveStreams();
      if (activeStreams.length === 0) return;
      const activeBlockingStreams = getActiveBlockingStreams();

      const startupCoverage = bufferWindowCoverage({
        activeStreams: activeBlockingStreams,
        caches,
        index,
        lookaheadSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
        maxTicks: PLAYBACK_POLICY.startupMaxPrefetchBatch,
        timeSec,
      });
      if (
        startupCoverage?.total &&
        startupCoverage.covered < startupCoverage.total
      ) {
        fillMissingStartupBufferFrom({
          activeStreams: activeBlockingStreams,
          collectMissingTicks: (startSec, endSec, maxTicks) =>
            collectMissingTicksForStreams(
              startSec,
              endSec,
              maxTicks,
              activeBlockingStreams,
            ),
          fetchBatch,
          policy: PLAYBACK_POLICY,
          timeSec,
        });
        // While the clock runs on an unconstrained link, keep building the
        // runway in this same pass: the hole just means an in-flight batch
        // hasn't landed, and returning would strand playback at zero margin
        // (each pass fills only the window the playhead is about to eat, so
        // every late batch stalls the clock). Stand down when a limited
        // link makes lookahead bytes compete with the playhead-critical
        // fill, and outside committed playback (paused seeks land here via
        // playhead writes; their runway comes from the seek prefetch and
        // the paused idle warmup, not this pass).
        if (!getIsPlaying(store) || getEpisodeNetworkHealth(store).limited) {
          return;
        }
      }

      // The startup fill above is playback-critical and never yields; the
      // speculative lookahead below stands down while a constrained network
      // is the reason playback is waiting.
      if (
        shouldDeferEpisodeIdleWorkForStore(
          store,
          lastSeekAtMsRef.current === null
            ? null
            : monotonicNowMs() - lastSeekAtMsRef.current,
        )
      ) {
        return;
      }

      if (warmLoopStartRunway(timeSec, activeStreams)) {
        return;
      }

      // Periodic top-up only fills missing lookahead; current-frame publication
      // stays in prefetchLookaheadFrom for mount, seek, and subscription paths.
      fillMissingLookaheadFrom({
        activeStreams,
        collectMissingTicks: (startSec, endSec, maxTicks) =>
          collectMissingTicksForStreams(
            startSec,
            endSec,
            maxTicks,
            activeStreams,
          ),
        fetchBatch,
        lookaheadSeconds: backgroundLookaheadSecondsRef.current,
        policy: PLAYBACK_POLICY,
        timeSec,
      });
    });

    return () => {
      unregister();
      unsubscribe();
      unsubPlayPending();
      unsubPlayhead();
    };
  }, [
    index,
    source,
    registerStream,
    subscribeStream,
    store,
    fetchBatch,
    fetchCurrentFrame,
    collectMissingTicksForStreams,
    computeBufferedRanges,
    getActiveBlockingStreams,
    getActiveStreams,
    publishStreamStatuses,
    resolveStartupCushion,
    warmLoopStartRunway,
  ]);

  // This effect fetches and publishes a paused seek's target tick and window.
  useEffect(() => {
    if (seekEvent) {
      // Stamp seeks so the idle-work gate can hold speculative reads while
      // the foreground catch-up fetch owns a constrained link, and reclaim
      // it immediately from speculative transfers already in flight.
      lastSeekAtMsRef.current = monotonicNowMs();
      pendingPlanThroughputFloorRef.current = null;
      remoteStartupGateDecisionRef.current = null;
      // A source transition can dispose the previous session before this
      // seek effect runs. Cancelling idle work on that session is already
      // satisfied, so do not surface its deliberate cancellation through
      // the episode error boundary.
      cancelEpisodeIdleReads(session);
      // Retain the previous frame while an uncovered target loads. Stream
      // loading state lets scene tiles mark the retained snapshot as previous,
      // and the target frame replaces it as soon as the foreground fetch
      // lands. Source changes and stream unsubscription still clear retained
      // frames at their ownership boundaries.
      prefetchLookaheadFrom(seekEvent.time);
    }
  }, [session, seekEvent, prefetchLookaheadFrom]);

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

/**
 * Publishes gated-start progress for modal chrome while a play press waits
 * on the bandwidth cushion: the runway target and a wall-clock estimate
 * that shrinks as coverage fills. Cleared whenever no press is pending or
 * the cushion is just the static floor.
 */
function publishStartupCushionProgress({
  activeBlockingStreams,
  caches,
  index,
  playheadSec,
  resolveStartupCushion,
  store,
  tick,
}: {
  readonly activeBlockingStreams: readonly string[];
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly index: TimelineIndex | null;
  readonly playheadSec: number;
  readonly resolveStartupCushion: () => EpisodeStartupCushion;
  readonly store: PlaybackStore;
  readonly tick: bigint | null;
}): void {
  if (
    !getIsPlayPending(store) ||
    tick === null ||
    activeBlockingStreams.length === 0
  ) {
    setEpisodeStartupCushionState(store, null);
    return;
  }

  const cushion = resolveStartupCushion();
  if (
    cushion.cushionSeconds <= PLAYBACK_POLICY.startupLookaheadSeconds ||
    cushion.estimatedWaitSeconds <= 0
  ) {
    setEpisodeStartupCushionState(store, null);
    return;
  }

  const coverage = bufferWindowCoverage({
    activeStreams: activeBlockingStreams,
    caches,
    index,
    lookaheadSeconds: cushion.cushionSeconds,
    maxTicks: Math.max(
      PLAYBACK_POLICY.startupMinTicks,
      Math.ceil(DEFAULT_TIMELINE_TICK_RATE_HZ * cushion.cushionSeconds),
    ),
    timeSec: playheadSec,
  });
  const missingFraction = coverage?.total
    ? (coverage.total - coverage.covered) / coverage.total
    : 1;
  setEpisodeStartupCushionState(store, {
    estimatedWaitSeconds: cushion.estimatedWaitSeconds * missingFraction,
    progressFraction: 1 - missingFraction,
    targetSeconds: cushion.cushionSeconds,
  });
}
