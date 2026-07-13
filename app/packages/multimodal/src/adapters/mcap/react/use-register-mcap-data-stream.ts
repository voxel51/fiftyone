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
import { markModalLoadingLatencyEvent } from "@fiftyone/utilities";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getMcapTopicStatus,
  getMcapTopicStaleAgeNs,
  setMcapTopicStartTimeSec,
  setMcapTopicStaleAgeNs,
  setMcapTopicStatus,
  type McapTopicStatus,
} from "./mcap-stream-status-state";
import {
  BYTE_SOURCE_READ_PROFILE,
  byteSourceAccessKey,
  type ByteSourceDescriptor,
} from "../../../query/bytes";
import { durationMsSince, monotonicNowMs } from "../../../time";
import { DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ } from "../timeline";
import type {
  McapByteTimelinePoint,
  McapDecodedMessage,
  McapResourceClient,
  McapStreamSyncPolicies,
  McapSynchronizedMessageWindow,
} from "../types";
import { isMcapReadCancelledError } from "../errors";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import { useSetMcapDataStream } from "./mcap-data-stream-context";
import {
  decodedCacheBudgetBytes,
  nextDecodedCacheLookaheadSeconds,
} from "./mcap-decoded-cache-policy";
import {
  getMcapNetworkHealth,
  shouldDeferMcapIdleWorkForStore,
} from "./mcap-network-health";
import { resetMcapPlaybackBuffering } from "./mcap-playback-buffering";
import { pushTickToStore } from "./mcap-playback-frame-push";
import {
  computeMcapStartupCushion,
  MAX_STARTUP_CUSHION_SECONDS,
  UNMEASURED_LINK_NOMINAL_WAIT_SECONDS,
  type McapStartupCushion,
} from "./mcap-startup-cushion";
import {
  resetMcapStartupCushionState,
  setMcapStartupCushionState,
} from "./mcap-startup-cushion-state";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import { createMcapTimelineIndex } from "./mcap-timeline-index";
import { McapTopicCache } from "./mcap-topic-cache";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

// One engine stream owns all MCAP topics so camera/lidar tiles stay on the
// same synchronized timeline and fetch in shared batches.
const STREAM_ID = "mcap-data-stream";

type McapDataOperation =
  | "background-lookahead"
  | "loopback-lookahead"
  | "playback-prefetch"
  | "startup-lookahead";

interface McapPlaybackPolicy {
  /**
   * Background buffer horizon. This is intentionally larger than startup
   * readiness: once playback is moving, keep enough decoded data ahead of the
   * playhead to absorb normal worker latency.
   */
  readonly lookaheadSeconds: number;

  /**
   * First-play readiness target. Mount/seek/engine prefetch fill only this
   * small adaptive window so the UI can start moving before the full lookahead
   * is warm.
   */
  readonly startupBufferSeconds: number;

  /**
   * Minimum/maximum ticks in the first-play window. The time target is clamped
   * through these bounds so sparse and dense recordings both get a sensible
   * cushion.
   */
  readonly startupMaxTicks: number;
  readonly startupMinTicks: number;

  /**
   * Paused warmup horizon. While the user is looking at a loaded sample but
   * playback is not moving, warm just enough render-blocking data to make
   * Play feel instant. Active playback still uses the larger rolling
   * `lookaheadSeconds` horizon.
   */
  readonly pausedWarmupRunwaySeconds: number;

  /**
   * Per-worker-request time cap. A single full-lookahead request can decode too
   * much at once and create a large response, so the lookahead is filled by
   * multiple bounded requests.
   */
  readonly prefetchBatchSeconds: number;

  /**
   * Maximum number of background prefetch batches to enqueue in one pass.
   * Keeping this lower than the full lookahead lets the current-frame request
   * win worker time on mount, seek, and subscription while still filling the
   * buffer through periodic top-ups.
   */
  readonly prefetchBatchesPerPass: number;

  /**
   * Cadence for topping up lookahead while playback advances. This should be
   * much slower than RAF but comfortably faster than the buffer can drain.
   */
  readonly prefetchRefreshSeconds: number;

  /**
   * Cache room relative to one full lookahead window. Values above 1 leave room
   * for overlap during refreshes, seeks, and in-flight batch completion, so
   * future prefetches do not evict near-playhead ticks before playback reaches
   * them.
   */
  readonly topicCacheLookaheadMultiplier: number;
}

/**
 * Playback policy after converting human-scale seconds/multipliers into the
 * concrete tick counts used by the prefetch loop and per-topic caches.
 */
interface DerivedMcapPlaybackPolicy extends McapPlaybackPolicy {
  /**
   * Maximum number of timeline ticks to request in one worker batch, derived
   * from the timeline tick rate and `prefetchBatchSeconds`.
   */
  readonly maxPrefetchBatch: number;

  /**
   * Concrete first-play window after clamping `startupBufferSeconds` through
   * `startupMinTicks` / `startupMaxTicks`.
   */
  readonly startupLookaheadSeconds: number;

  /** Maximum number of ticks to request in the startup window. */
  readonly startupMaxPrefetchBatch: number;

  /**
   * Maximum entries retained per topic cache, derived from tick rate,
   * lookahead window, and `topicCacheLookaheadMultiplier`.
   */
  readonly topicCacheMaxEntries: number;
}

const DEFAULT_MCAP_PLAYBACK_POLICY: McapPlaybackPolicy = {
  lookaheadSeconds: 4,
  pausedWarmupRunwaySeconds: 1.5,
  prefetchBatchSeconds: 1,
  prefetchBatchesPerPass: 1,
  prefetchRefreshSeconds: 0.5,
  startupBufferSeconds: 0.5,
  startupMaxTicks: 15,
  startupMinTicks: 3,
  topicCacheLookaheadMultiplier: 2,
} as const;

/**
 * Consecutive fetch failures per topic before the stream stops retrying
 * the affected ticks. Below the threshold a failure leaves the ticks
 * uncached so the engine's normal prefetch loop retries (covers transient
 * network errors); at the threshold the failed ticks are seeded as
 * "fetched, no message" so one persistently-broken topic can't stall the
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

const PLAYBACK_POLICY = deriveMcapPlaybackPolicy(DEFAULT_MCAP_PLAYBACK_POLICY);

/**
 * Batches one engine prefetch call may enqueue. The engine widens its
 * pending-start prefetch window to the bandwidth cushion, and the fill
 * must be able to pipeline the whole window — pacing it one batch per
 * buffered-ranges publish would bound filling at ~1 content-second per
 * wall second no matter how fast the link is.
 */
const MAX_ENGINE_PREFETCH_BATCHES_PER_CALL = 8;

const noop = (): void => undefined;

interface RemoteStartupGateDecision {
  readonly coverageSeconds: number;
  readonly mode: "held" | "provisional";
  readonly playheadSec: number;
  readonly sourceEpoch: number;
}

export interface UseMcapDataStreamOptions {
  blockingTopics: readonly string[];
  client: McapResourceClient;
  /** Called whenever every blocking topic covers the current playhead. */
  onPlayheadDataReady?: () => void;
  source: ByteSourceDescriptor | null;
  allTopics: readonly string[];
  staleMediaWarningNs: bigint;
  staleWarningTopics: readonly string[];
  streamPolicies: McapStreamSyncPolicies;
}

/**
 * Registers one PlaybackStream that manages all MCAP topics together.
 *
 * - Fetches only the topics that have at least one active subscriber (open
 *   tile). Closed tiles stop counting — their topics are skipped in all
 *   batch requests, saving network bandwidth.
 * - Fetches a small startup window first, then warms the longer background
 *   lookahead in bounded batches. Per-topic caches deduplicate concurrent
 *   requests for the same tick.
 * - Publishes `{ subscribeToTopic }` into the surrounding
 *   `McapDataStreamProvider` so tile bodies can subscribe to
 *   individual topic caches without going through an atom.
 */
export function useRegisterMcapDataStream({
  blockingTopics,
  client,
  onPlayheadDataReady,
  source,
  allTopics,
  staleMediaWarningNs,
  staleWarningTopics,
  streamPolicies,
}: UseMcapDataStreamOptions): void {
  const { registerStream, seek, subscribeStream } = usePlayback();
  const store = usePlaybackStore();
  const isPlaying = useIsPlaying();
  const setDataStream = useSetMcapDataStream();
  const seekEvent = useSeekEvent();

  const [index, setIndex] = useState<McapTimelineIndex | null>(null);

  // Stable refs — read in RAF/subscribe callbacks without closure capture.
  const topicCachesRef = useRef<Map<string, McapTopicCache>>(new Map());
  const decodedCacheBudgetBytesRef = useRef(0);
  if (decodedCacheBudgetBytesRef.current === 0) {
    decodedCacheBudgetBytesRef.current = decodedCacheBudgetBytes(
      reportedDeviceMemoryGb(),
    );
  }
  const backgroundLookaheadSecondsRef = useRef(
    PLAYBACK_POLICY.lookaheadSeconds,
  );
  // Pending fetches keyed by tick → set of topics each in-flight request
  // is covering. Per-topic so a request that omits a newly-subscribed
  // topic doesn't make collectMissingTicks think that topic is in flight.
  const pendingTicksRef = useRef<Map<string, Set<string>>>(new Map());
  const lastFrameRef = useRef<Map<string, McapTopicPlaybackFrame<unknown>>>(
    new Map(),
  );
  // Consecutive fetch failures per topic; reset on the first success.
  const failureStreakRef = useRef<Map<string, number>>(new Map());
  // Topics currently in the "failed" state (streak hit the cap). Sticky
  // until a later fetch covering the topic succeeds.
  const failedTopicsRef = useRef<Set<string>>(new Set());
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
  const topicStartTimesNsRef = useRef<Map<string, bigint | null>>(new Map());
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
  const indexRef = useRef<McapTimelineIndex | null>(null);
  const byteTimelineRef = useRef<readonly McapByteTimelinePoint[] | null>(null);
  const sourceEpochRef = useRef(0);
  indexRef.current = index;
  // Hold the most recent `allTopics` / `streamPolicies` in refs so the
  // stable callbacks below read fresh values without listing them as
  // deps (which would invalidate the registered stream every render).
  const allTopicsRef = useRef(allTopics);
  const blockingTopicsRef = useRef<ReadonlySet<string>>(
    new Set(blockingTopics),
  );
  const staleMediaWarningNsRef = useRef(staleMediaWarningNs);
  const staleWarningTopicsRef = useRef<ReadonlySet<string>>(
    new Set(staleWarningTopics),
  );
  const streamPoliciesRef = useRef(streamPolicies);
  const onPlayheadDataReadyRef = useRef(onPlayheadDataReady);
  // This effect keeps active topic discovery current without rebuilding streams.
  useEffect(() => {
    allTopicsRef.current = allTopics;
  }, [allTopics]);
  // This effect keeps readiness gating aligned with the latest blocking topics.
  useEffect(() => {
    blockingTopicsRef.current = new Set(blockingTopics);
  }, [blockingTopics]);
  // This effect keeps the readiness callback current without rebuilding streams.
  useEffect(() => {
    onPlayheadDataReadyRef.current = onPlayheadDataReady;
  }, [onPlayheadDataReady]);
  // This effect keeps stale-age evaluation current inside stable callbacks.
  useEffect(() => {
    staleMediaWarningNsRef.current = staleMediaWarningNs;
  }, [staleMediaWarningNs]);
  // This effect keeps stale-warning topic membership current inside callbacks.
  useEffect(() => {
    staleWarningTopicsRef.current = new Set(staleWarningTopics);
  }, [staleWarningTopics]);
  // This effect keeps per-topic sync policies current without stream churn.
  useEffect(() => {
    streamPoliciesRef.current = streamPolicies;
  }, [streamPolicies]);

  const getActiveTopics = useCallback(
    (): string[] =>
      allTopicsRef.current.filter(
        (t) => topicCachesRef.current.get(t)?.isActive,
      ),
    [],
  );
  const getActiveBlockingTopics = useCallback((): string[] => {
    const activeTopics = getActiveTopics();
    const blockingTopics = activeTopics.filter((topic) =>
      blockingTopicsRef.current.has(topic),
    );
    return blockingTopics.length > 0 ? blockingTopics : activeTopics;
  }, [getActiveTopics]);

  const clearPausedIdleWarmupTimer = useCallback(() => {
    if (pausedIdleWarmupTimerRef.current === null) return;
    clearTimeout(pausedIdleWarmupTimerRef.current);
    pausedIdleWarmupTimerRef.current = null;
  }, []);

  // Bandwidth-aware start gate: how much blocking-topic runway this play
  // press must cover before the engine may start. On links that outrun the
  // content bitrate (and whenever throughput or the byte curve is unknown)
  // this is exactly the static policy floor; on slower links it grows to
  // the smallest cushion that plays through to the horizon without
  // draining, so one honest buffering wait replaces repeated mid-play
  // freezes.
  const sourceReadProfile = source?.readProfile;
  const resolveStartupCushion = useCallback((): McapStartupCushion => {
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
    const health = getMcapNetworkHealth(store);

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
          activeTopics: getActiveBlockingTopics(),
          caches: topicCachesRef.current,
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

    return computeMcapStartupCushion({
      byteTimeline: byteTimelineRef.current,
      horizonSec,
      minimumSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
      playheadSec,
      startTimeNs: currentIndex.startTimeNs,
      throughputBytesPerSec: planThroughput,
    });
  }, [getActiveBlockingTopics, sourceReadProfile, store]);

  // If a recording's selected renderable topics begin just after the MCAP
  // timeline start, land the initial playhead on the first sampled tick that
  // can actually resolve data. This consumes the topic bounds already loaded
  // for status copy; it never asks the worker for another index/read.
  const maybeAutoSeekToFirstData = useCallback(() => {
    const currentEpoch = sourceEpochRef.current;
    if (autoSeekSourceEpochRef.current === currentEpoch) return;
    if (getPlayhead(store) !== 0) return;

    const currentIndex = indexRef.current;
    if (!currentIndex) return;

    const activeTopics = getActiveTopics();
    if (activeTopics.length === 0) return;

    let firstMessageTimeNs: bigint | null = null;
    for (const topic of activeTopics) {
      if (!topicStartTimesNsRef.current.has(topic)) return;
      const topicStart = topicStartTimesNsRef.current.get(topic);
      if (topicStart === null || topicStart === undefined) return;
      if (firstMessageTimeNs === null || topicStart < firstMessageTimeNs) {
        firstMessageTimeNs = topicStart;
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
  }, [getActiveTopics, seek, store]);

  // Pending helpers — wrap the per-tick topic sets so call sites read
  // like simple predicates instead of repeating the get/has dance.
  const isTopicPending = (tickKey: string, topic: string): boolean =>
    pendingTicksRef.current.get(tickKey)?.has(topic) ?? false;
  const markTopicsPending = (
    tickKeys: readonly string[],
    topics: readonly string[],
  ): void => {
    const pending = pendingTicksRef.current;
    for (const key of tickKeys) {
      let covered = pending.get(key);
      if (!covered) {
        covered = new Set();
        pending.set(key, covered);
      }
      for (const t of topics) covered.add(t);
    }
  };
  const clearTopicsPending = (
    tickKeys: readonly string[],
    topics: readonly string[],
  ): void => {
    const pending = pendingTicksRef.current;
    for (const key of tickKeys) {
      const covered = pending.get(key);
      if (!covered) continue;
      for (const t of topics) covered.delete(t);
      if (covered.size === 0) pending.delete(key);
    }
  };

  // Ensure a cache exists for every known topic.
  useEffect(() => {
    for (const topic of allTopics) {
      if (!topicCachesRef.current.has(topic)) {
        topicCachesRef.current.set(
          topic,
          new McapTopicCache(PLAYBACK_POLICY.topicCacheMaxEntries),
        );
      }
    }
  }, [allTopics]);

  // Load the timeline range once the source is available. On source
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
    failedTopicsRef.current.clear();
    topicStartTimesNsRef.current.clear();
    autoSeekSourceEpochRef.current = null;
    pendingPlanThroughputFloorRef.current = null;
    remoteStartupGateDecisionRef.current = null;
    nextLookaheadRefreshTimeRef.current = 0;
    backgroundLookaheadSecondsRef.current = PLAYBACK_POLICY.lookaheadSeconds;
    lastObservedPlayheadSecRef.current = null;
    loopRunwayStartTickKeyRef.current = null;
    clearPausedIdleWarmupTimer();
    for (const cache of topicCachesRef.current.values()) {
      cache.clear();
    }
    for (const topic of topicCachesRef.current.keys()) {
      setStreamValue(store, topic, null);
      setMcapTopicStatus(store, topic, "loading");
      setMcapTopicStaleAgeNs(store, topic, null);
      setMcapTopicStartTimeSec(store, topic, null);
    }
    resetMcapPlaybackBuffering(store);
    resetMcapStartupCushionState(store);
    if (bufferedRangesTimerRef.current !== null) {
      clearTimeout(bufferedRangesTimerRef.current);
      bufferedRangesTimerRef.current = null;
    }
    if (!source) return undefined;
    let cancelled = false;
    const timelineRangeStartMs = monotonicNowMs();
    const rangeRead = client.readTimelineRange({
      source,
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    });
    rangeRead
      .then((range) => {
        if (!cancelled && sourceEpochRef.current === sourceEpoch) {
          byteTimelineRef.current = range.byteTimeline ?? null;
          const nextIndex = createMcapTimelineIndex(range);
          const detail = {
            durationMs: durationMsSince(timelineRangeStartMs),
            durationSec: Number(nextIndex.durationSec.toFixed(3)),
            ticks: nextIndex.tickCount,
          };
          markModalLoadingLatencyEvent("mcap timeline ready", detail, {
            onceKey: "mcap-timeline-ready",
          });
          setIndex(nextIndex);
        }
      })
      .catch(noop);
    // Auxiliary: per-topic first-message times feed the "No data until
    // 0:12" tile copy. Best-effort — failures never block playback.
    rangeRead
      .then(async (range) => {
        const bounds = await client.readTopicTimeBounds({
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          source,
          topics: allTopicsRef.current,
        });
        if (cancelled || sourceEpochRef.current !== sourceEpoch) return;
        for (const bound of bounds) {
          topicStartTimesNsRef.current.set(
            bound.topic,
            bound.firstMessageTimeNs,
          );
          const startSec =
            bound.firstMessageTimeNs === null
              ? null
              : nsToSeconds(bound.firstMessageTimeNs - range.startTimeNs);
          setMcapTopicStartTimeSec(store, bound.topic, startSec);
        }
        maybeAutoSeekToFirstData();
      })
      .catch(noop);
    return () => {
      cancelled = true;
    };
    // client is a stable singleton — re-running on its identity would
    // discard the loaded timeline range for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maybeAutoSeekToFirstData, source, store]);

  // This effect retries the initial auto-seek once the timeline index is
  // committed to React state; topic bounds can resolve first.
  useEffect(() => {
    if (index) maybeAutoSeekToFirstData();
  }, [index, maybeAutoSeekToFirstData]);

  // Contiguous [startSec, endSec] ranges where every active topic has the
  // tick cached — i.e. the stretches playback can run through without
  // stalling. Derived from cache keys so this stays bounded by cache size,
  // not recording duration.
  const computeBufferedRanges = useCallback((): Array<[number, number]> => {
    const currentIndex = indexRef.current;
    if (!currentIndex) return [];
    const activeTopics = getActiveBlockingTopics();
    if (activeTopics.length === 0) return [];
    const caches = topicCachesRef.current;
    const firstCache = caches.get(activeTopics[0]);
    if (!firstCache) return [];
    const { durationSec } = currentIndex;
    const nominalTickSec = 1 / DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ;

    const ranges: Array<[number, number]> = [];
    const indexes: number[] = [];
    const seenIndexes = new Set<number>();
    for (const tick of firstCache.cachedTicks()) {
      const tickIndex = currentIndex.indexOfTick(tick);
      if (tickIndex === undefined || seenIndexes.has(tickIndex)) continue;
      let covered = true;
      for (const topic of activeTopics) {
        if (!caches.get(topic)?.has(tick)) {
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
  }, [getActiveBlockingTopics]);

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

  // Recompute per-topic status at the current playhead tick and the
  // aggregate buffering detail ("N/M streams"). Same-value atom writes are
  // no-ops, so calling this from RAF-adjacent paths (stream.prefetch,
  // onCommit) only wakes React on actual transitions.
  const publishStreamStatuses = useCallback(() => {
    const activeTopics = getActiveTopics();
    const activeBlockingTopics = getActiveBlockingTopics();
    const blockingTopicSet = new Set(activeBlockingTopics);
    const caches = topicCachesRef.current;
    const failed = failedTopicsRef.current;
    const tick = indexRef.current?.nearestTick(getPlayhead(store)) ?? null;

    let blockingCovered = 0;
    for (const topic of activeTopics) {
      const cache = caches.get(topic);

      let status: McapTopicStatus;
      let staleAgeNs: bigint | null = null;
      if (tick === null || !cache?.has(tick)) {
        status = failed.has(topic) ? "failed" : "loading";
      } else {
        if (blockingTopicSet.has(topic)) {
          blockingCovered += 1;
        }
        if (failed.has(topic)) {
          status = "failed";
        } else {
          const msg = cache.get(tick);
          if (!msg) {
            status = "gap";
          } else if (staleWarningTopicsRef.current.has(topic)) {
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
      if (getMcapTopicStaleAgeNs(store, topic) !== staleAgeNs) {
        setMcapTopicStaleAgeNs(store, topic, staleAgeNs);
      }
      if (getMcapTopicStatus(store, topic) !== status) {
        setMcapTopicStatus(store, topic, status);
      }
    }

    const blockingTotal = activeBlockingTopics.length;
    const detail =
      tick !== null && blockingTotal > 0 && blockingCovered < blockingTotal
        ? `${blockingCovered}/${blockingTotal} streams`
        : null;
    if (getBufferingDetail(store) !== detail) {
      setBufferingDetail(store, detail);
    }

    // Paused catch-up completion: the engine flags buffering on a
    // seek/step into uncached data but has no tick to clear it while
    // paused — once every active topic covers the playhead tick, the
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
        activeTopics,
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
            activeTopics: activeBlockingTopics,
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
      activeBlockingTopics,
      caches,
      index: indexRef.current,
      playheadSec,
      resolveStartupCushion,
      store,
      tick,
    });

    if (tick !== null && blockingTotal > 0) {
      if (blockingCovered === blockingTotal) {
        onPlayheadDataReadyRef.current?.();
        markModalLoadingLatencyEvent(
          "mcap playhead data ready",
          {
            playheadSec: Number(playheadSec.toFixed(3)),
            streams: blockingTotal,
            tickNs: tick,
          },
          { onceKey: "mcap-playhead-data-ready" },
        );
      }

      if (startupReady) {
        markModalLoadingLatencyEvent(
          "mcap startup buffer ready",
          {
            lookaheadSec: Number(
              PLAYBACK_POLICY.startupLookaheadSeconds.toFixed(3),
            ),
            playheadSec: Number(playheadSec.toFixed(3)),
            streams: blockingTotal,
            tickNs: tick,
            ticks: startupCoverage.total,
          },
          { onceKey: "mcap-startup-buffer-ready" },
        );
      }
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
    getActiveTopics,
    getActiveBlockingTopics,
    publishBufferedRangesNow,
    resolveStartupCushion,
    scheduleBufferedRangesPublish,
    store,
  ]);

  // Sidebar threshold changes should update stale/ready badges even when the
  // playhead is paused and no stream commit is happening.
  useEffect(() => {
    publishStreamStatuses();
  }, [publishStreamStatuses, staleMediaWarningNs]);

  // Failure bookkeeping for one rejected fetch. Below the streak cap the
  // ticks stay uncached so the engine retries; at the cap the requested
  // ticks are sealed as "no message" so playback can move past the
  // failure, and the topic surfaces as "failed" until a fetch succeeds.
  const handleFetchFailure = useCallback(
    (error: unknown, ticks: readonly bigint[], topics: readonly string[]) => {
      const newlyFailed: string[] = [];
      for (const topic of topics) {
        const streak = (failureStreakRef.current.get(topic) ?? 0) + 1;
        failureStreakRef.current.set(topic, streak);
        if (streak < MAX_FETCH_FAILURE_STREAK) continue;
        if (!failedTopicsRef.current.has(topic)) {
          failedTopicsRef.current.add(topic);
          newlyFailed.push(topic);
        }
        const cache = topicCachesRef.current.get(topic);
        if (cache?.isActive) {
          for (const tick of ticks) {
            if (!cache.has(tick)) cache.set(tick, null);
          }
        }
      }
      if (newlyFailed.length > 0) {
        console.warn(
          `[mcap] giving up on topics after ${MAX_FETCH_FAILURE_STREAK} failed fetches:`,
          newlyFailed,
          error,
        );
      }
      // Statuses are republished by the caller's `.finally`, after the
      // pending bookkeeping for this fetch is cleared.
    },
    [],
  );

  const handleFetchSuccess = useCallback((topics: readonly string[]) => {
    for (const topic of topics) {
      failureStreakRef.current.delete(topic);
      failedTopicsRef.current.delete(topic);
    }
  }, []);

  const rebalanceDecodedCaches = useCallback(
    (pruneSpeculative: boolean) => {
      const currentIndex = indexRef.current;
      if (!currentIndex) return;

      const caches = topicCachesRef.current;
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

  // Core batch-fetch helper. Fetches ticks for the active topic set, fills
  // per-topic caches, and (since the engine doesn't tick when paused) also
  // pushes any fetched frame at the current playhead to atoms so paused
  // tiles render their first frame as soon as the network resolves.
  const fetchBatch = useCallback(
    (ticks: bigint[], activeTopics: string[], operation: McapDataOperation) => {
      if (ticks.length === 0 || activeTopics.length === 0 || !source) {
        return false;
      }
      const sourceEpoch = sourceEpochRef.current;
      const caches = topicCachesRef.current;

      // Only include a tick if at least one active topic needs it (not
      // already pending for that topic). A tick that's fully covered by
      // in-flight requests across every active topic is dropped.
      const toFetch = ticks.filter((tick) => {
        const tickKey = tick.toString();
        return activeTopics.some((t) => !isTopicPending(tickKey, t));
      });
      if (toFetch.length === 0) return false;

      const keys = toFetch.map((t) => t.toString());
      const topicsToFetch = activeTopics.filter((topic) =>
        toFetch.some((tick) => {
          const tickKey = tick.toString();
          return (
            !caches.get(topic)?.has(tick) && !isTopicPending(tickKey, topic)
          );
        }),
      );
      if (topicsToFetch.length === 0) return false;

      const batchPriority = mcapBatchReadPriority(operation);

      markTopicsPending(keys, topicsToFetch);

      client
        .readSynchronizedMessageBatch(
          {
            activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
            source,
            streamPolicies: streamPoliciesRef.current,
            timeNs: toFetch,
            topics: topicsToFetch,
          },
          {
            priority: batchPriority,
          },
        )
        .then((windows) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          const decodeFailures = decodeFailuresByTopic(windows);
          handleFetchSuccess(
            topicsToFetch.filter((topic) => !decodeFailures.has(topic)),
          );

          const activeFetchedTopics = activeTopicsInCaches(
            caches,
            topicsToFetch,
          );
          if (activeFetchedTopics.length === 0) return;

          for (const window of windows) {
            distributeWindowToCaches(
              window,
              caches,
              activeFetchedTopics.filter(
                (topic) => !window.decodeErrorsByTopic?.[topic],
              ),
              {
                pinned: operation === "loopback-lookahead",
              },
            );
          }
          for (const [topic, failure] of decodeFailures) {
            handleFetchFailure(
              new Error(failure.messages.join("; ")),
              failure.ticks,
              [topic],
            );
          }
          rebalanceDecodedCaches(operation === "background-lookahead");
          const currentIndex = indexRef.current;
          if (!currentIndex) return;
          const tick = currentIndex.nearestTick(getPlayhead(store));
          const stillActiveTopics = activeTopicsInCaches(caches, activeTopics);
          // Explicit undefined check — `0n` is falsy but a valid tick.
          if (tick !== undefined) {
            pushTickToStore(
              stillActiveTopics,
              tick,
              caches,
              lastFrameRef.current,
              store,
              failedTopicsRef.current,
            );
          }
        })
        .catch((error) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          // Deliberate cancellation (seek reclaiming the link) is benign:
          // no failure streaks — the ticks simply stay unfetched, and the
          // caller's `.finally` still clears pending bookkeeping so future
          // passes can re-request them.
          if (isMcapReadCancelledError(error)) {
            return;
          }
          handleFetchFailure(error, toFetch, topicsToFetch);
        })
        .finally(() => {
          if (sourceEpochRef.current !== sourceEpoch) return;

          clearTopicsPending(keys, topicsToFetch);
          publishStreamStatuses();
        });

      return true;
    },
    [
      client,
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
    (tick: bigint, activeTopics: string[]) => {
      if (activeTopics.length === 0 || !source) {
        return false;
      }

      const sourceEpoch = sourceEpochRef.current;
      const caches = topicCachesRef.current;
      const tickKey = tick.toString();
      const topicsToFetch = activeTopics.filter(
        (topic) =>
          !caches.get(topic)?.has(tick) && !isTopicPending(tickKey, topic),
      );
      if (topicsToFetch.length === 0) return false;

      markTopicsPending([tickKey], topicsToFetch);

      client
        .readSynchronizedMessages({
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          source,
          streamPolicies: streamPoliciesRef.current,
          timeNs: tick,
          topics: topicsToFetch,
        })
        .then((window) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          const decodeFailures = decodeFailuresByTopic([window]);
          handleFetchSuccess(
            topicsToFetch.filter((topic) => !decodeFailures.has(topic)),
          );

          const activeFetchedTopics = activeTopicsInCaches(
            caches,
            topicsToFetch,
          );
          if (activeFetchedTopics.length === 0) return;

          distributeWindowToCaches(
            window,
            caches,
            activeFetchedTopics.filter(
              (topic) => !window.decodeErrorsByTopic?.[topic],
            ),
          );
          for (const [topic, failure] of decodeFailures) {
            handleFetchFailure(
              new Error(failure.messages.join("; ")),
              failure.ticks,
              [topic],
            );
          }
          rebalanceDecodedCaches(false);
          pushTickToStore(
            activeTopicsInCaches(caches, activeTopics),
            tick,
            caches,
            lastFrameRef.current,
            store,
            failedTopicsRef.current,
          );
        })
        .catch((error) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          if (isMcapReadCancelledError(error)) return;
          handleFetchFailure(error, [tick], topicsToFetch);
        })
        .finally(() => {
          if (sourceEpochRef.current !== sourceEpoch) return;

          clearTopicsPending([tickKey], topicsToFetch);
          publishStreamStatuses();
        });

      return true;
    },
    [
      client,
      source,
      store,
      handleFetchFailure,
      handleFetchSuccess,
      publishStreamStatuses,
      rebalanceDecodedCaches,
    ],
  );

  // Collect ticks in [startSec, endSec] where at least one requested topic
  // still needs the data — i.e. not cached and not already pending for
  // that specific topic. Capped by the resolved playback policy.
  const collectMissingTicksForTopics = useCallback(
    (
      startSec: number,
      endSec: number,
      maxTicks: number,
      topics: readonly string[],
    ): bigint[] => {
      const currentIndex = indexRef.current;
      if (!currentIndex) return [];
      if (topics.length === 0) return [];
      const caches = topicCachesRef.current;
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
        const needsFetch = topics.some(
          (t) => !caches.get(t)?.has(tick) && !isTopicPending(tickKey, t),
        );
        if (needsFetch) toFetch.push(tick);
        if (toFetch.length >= maxTicks) break;
      }
      return toFetch;
    },
    [],
  );

  const warmLoopStartRunway = useCallback(
    (timeSec: number, activeTopics: string[]): boolean => {
      const currentIndex = indexRef.current;
      if (!currentIndex || activeTopics.length === 0) return false;

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
        for (const cache of topicCachesRef.current.values()) {
          cache.clearPinned();
        }
      }

      const missing = collectMissingTicksForTopics(
        loopStartSec,
        loopStartSec + lookaheadSeconds,
        PLAYBACK_POLICY.maxPrefetchBatch,
        activeTopics,
      );

      if (missing.length === 0) {
        return false;
      }

      return fetchBatch(missing, activeTopics, "loopback-lookahead");
    },
    [collectMissingTicksForTopics, fetchBatch, store],
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
    const activeTopics = getActiveTopics();
    const activeBlockingTopics = getActiveBlockingTopics();
    if (activeTopics.length === 0 || activeBlockingTopics.length === 0) {
      return false;
    }

    const startupCoverage = bufferWindowCoverage({
      activeTopics: activeBlockingTopics,
      caches: topicCachesRef.current,
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

    if (warmLoopStartRunway(timeSec, activeTopics)) {
      return true;
    }

    const endSec =
      timeSec +
      Math.min(
        PLAYBACK_POLICY.pausedWarmupRunwaySeconds,
        backgroundLookaheadSecondsRef.current,
      );
    const blockingMissing = collectMissingTicksForTopics(
      timeSec,
      endSec,
      PLAYBACK_POLICY.maxPrefetchBatch,
      activeBlockingTopics,
    );
    if (
      blockingMissing.length > 0 &&
      fetchBatch(blockingMissing, activeBlockingTopics, "background-lookahead")
    ) {
      return true;
    }

    const allMissing = collectMissingTicksForTopics(
      timeSec,
      endSec,
      PLAYBACK_POLICY.maxPrefetchBatch,
      activeTopics,
    );
    if (
      allMissing.length > 0 &&
      fetchBatch(allMissing, activeTopics, "background-lookahead")
    ) {
      return true;
    }

    return false;
  }, [
    collectMissingTicksForTopics,
    fetchBatch,
    getActiveBlockingTopics,
    getActiveTopics,
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
          shouldDeferMcapIdleWorkForStore(
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
      const activeTopics = getActiveTopics();
      if (activeTopics.length === 0) return;
      nextLookaheadRefreshTimeRef.current = timeSec;

      // One all-active batch monopolizes the serial worker lane. Fetch the
      // blocking visual set first so a large non-blocking static overlay (the
      // NuScenes /map message is ~19 MB) cannot sit in front of cameras and
      // point clouds. Non-blocking overlays still get their own immediate
      // request, but it queues behind the content that removes the poster.
      const blockingSet = blockingTopicsRef.current;
      const activeBlockingTopics = activeTopics.filter((topic) =>
        blockingSet.has(topic),
      );
      const overlayTopics =
        activeBlockingTopics.length > 0
          ? activeTopics.filter((topic) => !blockingSet.has(topic))
          : [];
      const heavyTopics =
        activeBlockingTopics.length > 0 ? activeBlockingTopics : activeTopics;

      const tick = currentIndex.nearestTick(timeSec);
      // Explicit undefined check — `0n` is falsy but a valid tick.
      if (tick !== undefined) {
        pushTickToStore(
          activeTopics,
          tick,
          topicCachesRef.current,
          lastFrameRef.current,
          store,
          failedTopicsRef.current,
        );
        fetchCurrentFrame(tick, heavyTopics);
        if (overlayTopics.length > 0) {
          fetchCurrentFrame(tick, overlayTopics);
        }
      }

      // The startup gate measures coverage over blocking topics, so its
      // fill matches that set; overlay lookahead arrives through the
      // regular background top-ups.
      fillMissingStartupBufferFrom({
        activeTopics: heavyTopics,
        collectMissingTicks: (startSec, endSec, maxTicks) =>
          collectMissingTicksForTopics(startSec, endSec, maxTicks, heavyTopics),
        fetchBatch,
        policy: PLAYBACK_POLICY,
        timeSec,
      });

      // Surface "loading" immediately on seek/mount/subscribe — the
      // fetches kicked off above republish when they settle.
      publishStreamStatuses();
    },
    [
      collectMissingTicksForTopics,
      fetchBatch,
      fetchCurrentFrame,
      getActiveTopics,
      publishStreamStatuses,
      store,
    ],
  );

  // This effect registers the engine stream and proactive lookahead subscription.
  useEffect(() => {
    if (!index || !source) return undefined;

    const nativeStep = 1 / DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ;
    const caches = topicCachesRef.current;
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
      // Message-only layouts have no playback-topic caches to warm, so
      // report zero runway instead of waiting on empty buffered ranges.
      get lookaheadSeconds() {
        if (getActiveBlockingTopics().length === 0) return 0;
        return resolveStartupCushion().cushionSeconds;
      },
      get startupBufferSeconds() {
        if (getActiveBlockingTopics().length === 0) return 0;
        return resolveStartupCushion().cushionSeconds;
      },
      bufferedRanges: computeBufferedRanges,

      bufferState: (timeSec) => {
        const tick = index.nearestTick(timeSec);
        // Explicit undefined check — `0n` is falsy but a valid tick
        // (files with relative log times start at exactly 0n, and a
        // falsy check here wedges the engine at t=0 forever).
        if (tick === undefined) {
          return "missing";
        }
        const activeTopics = getActiveBlockingTopics();
        if (activeTopics.length === 0) return "ready";
        const tickKey = tick.toString();
        let missingTopics = 0;
        let pendingTopics = 0;
        for (const t of activeTopics) {
          if (caches.get(t)?.has(tick)) {
            continue;
          }
          if (isTopicPending(tickKey, t)) {
            pendingTopics++;
          } else {
            missingTopics++;
          }
        }
        const state =
          missingTopics > 0
            ? "missing"
            : pendingTopics > 0
              ? "loading"
              : "ready";
        return state;
      },

      prefetch: ([startSec, endSec]) => {
        const activeTopics = getActiveTopics();
        const tick = index.nearestTick(startSec);
        // Explicit undefined check — `0n` is falsy but a valid tick.
        if (tick !== undefined) fetchCurrentFrame(tick, activeTopics);
        // Fill the whole requested window in bounded batches: with the
        // bandwidth cushion the engine can ask for several seconds here,
        // and the batches must be in flight together to pipeline the
        // link. Pending-tick bookkeeping keeps repeat calls idempotent.
        for (let i = 0; i < MAX_ENGINE_PREFETCH_BATCHES_PER_CALL; i++) {
          const missing = collectMissingTicksForTopics(
            startSec,
            endSec,
            PLAYBACK_POLICY.maxPrefetchBatch,
            activeTopics,
          );
          if (missing.length === 0) break;
          if (!fetchBatch(missing, activeTopics, "playback-prefetch")) break;
        }
        // Mid-playback stall: keep per-topic statuses and the "N/M
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
        const activeTopics = getActiveTopics();
        pushTickToStore(
          activeTopics,
          tick,
          caches,
          lastFrame,
          commitStore,
          failedTopicsRef.current,
        );
        // The committed tick changed — gaps/ready flips happen here
        // during normal playback.
        publishStreamStatuses();
      },
    };

    const unregister = registerStream(stream);
    // Keep the stream permanently active — subscriber count is managed
    // per-topic via McapTopicCache, not at the engine stream level.
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
      const activeTopics = getActiveTopics();
      if (activeTopics.length === 0) return;
      const activeBlockingTopics = getActiveBlockingTopics();

      const startupCoverage = bufferWindowCoverage({
        activeTopics: activeBlockingTopics,
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
          activeTopics: activeBlockingTopics,
          collectMissingTicks: (startSec, endSec, maxTicks) =>
            collectMissingTicksForTopics(
              startSec,
              endSec,
              maxTicks,
              activeBlockingTopics,
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
        if (!getIsPlaying(store) || getMcapNetworkHealth(store).limited) {
          return;
        }
      }

      // The startup fill above is playback-critical and never yields; the
      // speculative lookahead below stands down while a constrained network
      // is the reason playback is waiting.
      if (
        shouldDeferMcapIdleWorkForStore(
          store,
          lastSeekAtMsRef.current === null
            ? null
            : monotonicNowMs() - lastSeekAtMsRef.current,
        )
      ) {
        return;
      }

      if (warmLoopStartRunway(timeSec, activeTopics)) {
        return;
      }

      // Periodic top-up only fills missing lookahead; current-frame publication
      // stays in prefetchLookaheadFrom for mount, seek, and subscription paths.
      fillMissingLookaheadFrom({
        activeTopics,
        collectMissingTicks: (startSec, endSec, maxTicks) =>
          collectMissingTicksForTopics(
            startSec,
            endSec,
            maxTicks,
            activeTopics,
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
    collectMissingTicksForTopics,
    computeBufferedRanges,
    getActiveBlockingTopics,
    getActiveTopics,
    publishStreamStatuses,
    resolveStartupCushion,
    warmLoopStartRunway,
  ]);

  // Paused-seek: scrub while paused → push or fetch the seeked tick + window.
  useEffect(() => {
    if (seekEvent) {
      // Stamp seeks so the idle-work gate can hold speculative reads while
      // the foreground catch-up fetch owns a constrained link, and reclaim
      // it immediately from speculative transfers already in flight.
      lastSeekAtMsRef.current = monotonicNowMs();
      pendingPlanThroughputFloorRef.current = null;
      remoteStartupGateDecisionRef.current = null;
      client?.cancelIdleReads?.();
      // A seek is a time jump: frames held over from the previous position
      // would render wrong-time sensor data as if current. Drop them so an
      // uncovered target shows its explicit loading state until real data
      // lands (a covered target repaints from cache immediately).
      lastFrameRef.current.clear();
      prefetchLookaheadFrom(seekEvent.time);
    }
  }, [client, seekEvent, prefetchLookaheadFrom]);

  // Mount-time: kick off lookahead so the buffer fills before play/seek.
  // (May be a no-op if no tile has subscribed yet — subscribeToTopic also
  // triggers this for the same reason.)
  useEffect(() => {
    if (index) prefetchLookaheadFrom(getPlayhead(store));
  }, [index, prefetchLookaheadFrom, store]);

  // Expose subscribeToTopic via the playback store so tiles can subscribe
  // without a React context hierarchy constraint. The first subscription for
  // a topic flips its cache to active, which is what gates lookahead — so we
  // also trigger a prefetch here so buffering starts the moment a tile mounts.
  const subscribeToTopic = useCallback(
    (topic: string): (() => void) => {
      const cache = topicCachesRef.current.get(topic);
      if (!cache) return noop;

      const cleanup = cache.subscribe();
      maybeAutoSeekToFirstData();
      prefetchLookaheadFrom(getPlayhead(store));
      return () => {
        cleanup();
        // Cache cleared itself in its own cleanup once the count hit 0;
        // also drop the held-last-frame so a future re-subscribe can't
        // flash stale content from the previous session.
        if (!cache.isActive) lastFrameRef.current.delete(topic);
      };
    },
    [maybeAutoSeekToFirstData, prefetchLookaheadFrom, store],
  );

  const getTopicCache = useCallback(
    (topic: string) => topicCachesRef.current.get(topic),
    [],
  );
  const getTimelineIndex = useCallback(() => index, [index]);
  const readTopicMessages = useCallback(
    async ({
      endTimeNs,
      startTimeNs,
      topic,
    }: {
      readonly endTimeNs: bigint;
      readonly startTimeNs: bigint;
      readonly topic: string;
    }) => {
      if (!source) return [];
      const messages: McapDecodedMessage[] = [];
      for await (const message of client.readDecodedMessages(
        {
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          endTimeNs,
          source,
          startTimeNs,
          topics: [topic],
        },
        { priority: "current" },
      )) {
        messages.push(message);
      }
      return messages;
    },
    [client, source],
  );
  // Per-recording discriminator for cross-tile cache keys (e.g. the shared
  // image-texture cache): keys embedding it can never collide across
  // recordings, so no cache flush is needed at the source-change boundary.
  const sourceKey = useMemo(
    () => (source ? byteSourceAccessKey(source) : ""),
    [source],
  );

  // This effect publishes the current recording stream through React context.
  useEffect(() => {
    setDataStream({
      getTimelineIndex,
      getTopicCache,
      readTopicMessages,
      sourceKey,
      subscribeToTopic,
    });
    return () => {
      setDataStream(null);
    };
  }, [
    setDataStream,
    sourceKey,
    subscribeToTopic,
    getTopicCache,
    getTimelineIndex,
    readTopicMessages,
  ]);
}

function deriveMcapPlaybackPolicy(
  policy: McapPlaybackPolicy,
  tickRateHz = DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
): DerivedMcapPlaybackPolicy {
  const startupLookaheadSeconds = clampNumber(
    policy.startupBufferSeconds,
    policy.startupMinTicks / tickRateHz,
    policy.startupMaxTicks / tickRateHz,
  );
  const pausedWarmupRunwaySeconds = clampNumber(
    policy.pausedWarmupRunwaySeconds,
    startupLookaheadSeconds,
    policy.lookaheadSeconds,
  );

  return {
    ...policy,
    maxPrefetchBatch: Math.ceil(tickRateHz * policy.prefetchBatchSeconds),
    pausedWarmupRunwaySeconds,
    startupLookaheadSeconds,
    startupMaxPrefetchBatch: Math.max(
      policy.startupMinTicks,
      Math.ceil(tickRateHz * startupLookaheadSeconds),
    ),
    topicCacheMaxEntries: Math.ceil(
      tickRateHz *
        policy.lookaheadSeconds *
        policy.topicCacheLookaheadMultiplier,
    ),
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mcapBatchReadPriority(
  operation: McapDataOperation,
): "idle" | "playback" {
  return operation === "background-lookahead" ? "idle" : "playback";
}

function fillMissingLookaheadFrom({
  activeTopics,
  collectMissingTicks,
  fetchBatch,
  lookaheadSeconds,
  policy,
  timeSec,
}: {
  activeTopics: string[];
  collectMissingTicks: (
    startSec: number,
    endSec: number,
    maxTicks: number,
  ) => bigint[];
  fetchBatch: (
    ticks: bigint[],
    activeTopics: string[],
    operation: McapDataOperation,
  ) => boolean;
  lookaheadSeconds: number;
  policy: DerivedMcapPlaybackPolicy;
  timeSec: number;
}): boolean {
  const endSec = timeSec + lookaheadSeconds;
  const batchesToQueue = Math.min(
    policy.prefetchBatchesPerPass,
    Math.ceil(lookaheadSeconds / policy.prefetchBatchSeconds),
  );
  let queued = false;
  for (let i = 0; i < batchesToQueue; i++) {
    const missing = collectMissingTicks(
      timeSec,
      endSec,
      policy.maxPrefetchBatch,
    );
    if (missing.length === 0) return queued;
    if (!fetchBatch(missing, activeTopics, "background-lookahead")) {
      return queued;
    }
    queued = true;
  }
  return queued;
}

function fillMissingStartupBufferFrom({
  activeTopics,
  collectMissingTicks,
  fetchBatch,
  policy,
  timeSec,
}: {
  activeTopics: string[];
  collectMissingTicks: (
    startSec: number,
    endSec: number,
    maxTicks: number,
  ) => bigint[];
  fetchBatch: (
    ticks: bigint[],
    activeTopics: string[],
    operation: McapDataOperation,
  ) => boolean;
  policy: DerivedMcapPlaybackPolicy;
  timeSec: number;
}): boolean {
  const endSec = timeSec + policy.startupLookaheadSeconds;
  const missing = collectMissingTicks(
    timeSec,
    endSec,
    policy.startupMaxPrefetchBatch,
  );
  if (missing.length === 0) return false;
  return fetchBatch(missing, activeTopics, "startup-lookahead");
}

/**
 * Publishes gated-start progress for modal chrome while a play press waits
 * on the bandwidth cushion: the runway target and a wall-clock estimate
 * that shrinks as coverage fills. Cleared whenever no press is pending or
 * the cushion is just the static floor.
 */
function publishStartupCushionProgress({
  activeBlockingTopics,
  caches,
  index,
  playheadSec,
  resolveStartupCushion,
  store,
  tick,
}: {
  readonly activeBlockingTopics: readonly string[];
  readonly caches: Map<string, McapTopicCache>;
  readonly index: McapTimelineIndex | null;
  readonly playheadSec: number;
  readonly resolveStartupCushion: () => McapStartupCushion;
  readonly store: PlaybackStore;
  readonly tick: bigint | null;
}): void {
  if (
    !getIsPlayPending(store) ||
    tick === null ||
    activeBlockingTopics.length === 0
  ) {
    setMcapStartupCushionState(store, null);
    return;
  }

  const cushion = resolveStartupCushion();
  if (
    cushion.cushionSeconds <= PLAYBACK_POLICY.startupLookaheadSeconds ||
    cushion.estimatedWaitSeconds <= 0
  ) {
    setMcapStartupCushionState(store, null);
    return;
  }

  const coverage = bufferWindowCoverage({
    activeTopics: activeBlockingTopics,
    caches,
    index,
    lookaheadSeconds: cushion.cushionSeconds,
    maxTicks: Math.max(
      PLAYBACK_POLICY.startupMinTicks,
      Math.ceil(DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ * cushion.cushionSeconds),
    ),
    timeSec: playheadSec,
  });
  const missingFraction = coverage?.total
    ? (coverage.total - coverage.covered) / coverage.total
    : 1;
  setMcapStartupCushionState(store, {
    estimatedWaitSeconds: cushion.estimatedWaitSeconds * missingFraction,
    progressFraction: 1 - missingFraction,
    targetSeconds: cushion.cushionSeconds,
  });
}

function bufferWindowCoverage({
  activeTopics,
  caches,
  index,
  lookaheadSeconds,
  maxTicks,
  timeSec,
}: {
  readonly activeTopics: readonly string[];
  readonly caches: Map<string, McapTopicCache>;
  readonly index: McapTimelineIndex | null;
  readonly lookaheadSeconds: number;
  readonly maxTicks: number;
  readonly timeSec: number;
}): { readonly covered: number; readonly total: number } | null {
  if (!index || activeTopics.length === 0) return null;

  const startTick = index.nearestTick(timeSec);
  if (startTick === undefined) return null;

  const endNs = index.secToNs(timeSec + lookaheadSeconds);
  const startIdx = index.indexOfTick(startTick);
  if (startIdx === undefined) return null;
  let covered = 0;
  let total = 0;

  for (let i = startIdx; i < index.tickCount && total < maxTicks; i++) {
    const tick = index.tickAt(i);
    if (tick === undefined) break;
    if (tick > endNs) break;
    total += 1;
    if (activeTopics.every((topic) => caches.get(topic)?.has(tick))) {
      covered += 1;
    }
  }

  return { covered, total };
}

function contiguousBufferedSecondsFromPlayhead({
  activeTopics,
  caches,
  index,
  maxSeconds,
  timeSec,
}: {
  readonly activeTopics: readonly string[];
  readonly caches: Map<string, McapTopicCache>;
  readonly index: McapTimelineIndex | null;
  readonly maxSeconds: number;
  readonly timeSec: number;
}): number {
  if (!index || activeTopics.length === 0 || maxSeconds <= 0) return 0;

  const startTick = index.nearestTick(timeSec);
  if (startTick === undefined) return 0;

  const startIdx = index.indexOfTick(startTick);
  if (startIdx === undefined) return 0;

  const endNs = index.secToNs(timeSec + maxSeconds);
  const nominalTickSec = 1 / DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ;
  let lastCoveredTick: bigint | null = null;

  for (let i = startIdx; i < index.tickCount; i++) {
    const tick = index.tickAt(i);
    if (tick === undefined || tick > endNs) break;
    if (!activeTopics.every((topic) => caches.get(topic)?.has(tick))) break;
    lastCoveredTick = tick;
  }

  if (lastCoveredTick === null) return 0;
  return Math.min(
    maxSeconds,
    Math.max(0, index.nsToSec(lastCoveredTick) - timeSec + nominalTickSec),
  );
}

function activeTopicsInCaches(
  caches: Map<string, McapTopicCache>,
  topics: readonly string[],
): string[] {
  return topics.filter((topic) => caches.get(topic)?.isActive);
}

function nsToSeconds(deltaNs: bigint): number {
  const clamped = deltaNs < 0n ? 0n : deltaNs;
  return (
    Number(clamped / 1_000_000_000n) +
    Number(clamped % 1_000_000_000n) / 1_000_000_000
  );
}

function staleAgeForMessage(
  tick: bigint,
  msg: McapDecodedMessage,
  staleMediaWarningNs: bigint,
): bigint | null {
  if (staleMediaWarningNs <= 0n) return null;
  const ageNs = tick >= msg.timelineTimeNs ? tick - msg.timelineTimeNs : 0n;
  return ageNs > staleMediaWarningNs ? ageNs : null;
}

function reportedDeviceMemoryGb(): number | null {
  if (typeof navigator === "undefined") return null;
  const memoryGb = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  return memoryGb !== undefined && Number.isFinite(memoryGb) && memoryGb > 0
    ? memoryGb
    : null;
}

function distributeWindowToCaches(
  window: McapSynchronizedMessageWindow,
  caches: Map<string, McapTopicCache>,
  requestedTopics: readonly string[],
  options?: { readonly pinned?: boolean },
): void {
  // Seed every requested topic for this tick — null if the backend omitted
  // or returned an empty array — so bufferState resolves and the engine
  // doesn't stall on ticks where a topic has no message.
  for (const topic of requestedTopics) {
    const msgs = window.messagesByTopic[topic];
    caches.get(topic)?.set(window.timeNs, msgs?.[0] ?? null, options);
  }
}

interface McapTopicWindowDecodeFailure {
  readonly messages: readonly string[];
  readonly ticks: readonly bigint[];
}

function decodeFailuresByTopic(
  windows: readonly McapSynchronizedMessageWindow[],
): ReadonlyMap<string, McapTopicWindowDecodeFailure> {
  const messagesByTopic = new Map<string, Set<string>>();
  const ticksByTopic = new Map<string, bigint[]>();
  for (const window of windows) {
    for (const [topic, diagnostics] of Object.entries(
      window.decodeErrorsByTopic ?? {},
    )) {
      const messages = messagesByTopic.get(topic) ?? new Set<string>();
      for (const diagnostic of diagnostics) messages.add(diagnostic.message);
      messagesByTopic.set(topic, messages);
      const ticks = ticksByTopic.get(topic) ?? [];
      ticks.push(window.timeNs);
      ticksByTopic.set(topic, ticks);
    }
  }

  return new Map(
    [...messagesByTopic].map(([topic, messages]) => [
      topic,
      {
        messages: [...messages],
        ticks: ticksByTopic.get(topic) ?? [],
      },
    ]),
  );
}

function bufferedRangesEqual(
  a: ReadonlyArray<readonly [number, number]>,
  b: ReadonlyArray<readonly [number, number]>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}
