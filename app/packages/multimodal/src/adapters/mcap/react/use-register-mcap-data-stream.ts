import {
  getBufferedRanges,
  getBufferingDetail,
  getIsBuffering,
  getIsPlayPending,
  getIsPlaying,
  getLoopEnd,
  getLoopStart,
  getPlayhead,
  getStreamValue,
  setBufferedRanges,
  setBufferingDetail,
  setIsBuffering,
  setStreamValue,
  subscribePlayhead,
  useIsPlaying,
  usePlayback,
  usePlaybackStore,
  useSeekEvent,
  type PlaybackStore,
  type PlaybackStream,
} from "@fiftyone/playback";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMcapTopicStatus,
  getMcapTopicStaleAgeNs,
  setMcapTopicStartTimeSec,
  setMcapTopicStaleAgeNs,
  setMcapTopicStatus,
  type McapTopicStatus,
} from "./mcap-stream-status-state";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ } from "../timeline";
import type {
  McapDecodedMessage,
  McapResourceClient,
  McapStreamSyncPolicies,
  McapSynchronizedMessageWindow,
} from "../types";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import { useSetMcapDataStream } from "./mcap-data-stream-context";
import {
  isMcapLatencyDebugEnabled,
  markMcapLatencyEvent,
  mcapLatencyDurationMs,
  mcapLatencyNowMs,
  recordMcapLatencyMetric,
} from "./mcap-latency-debug";
import { resetMcapPlaybackBuffering } from "./mcap-playback-buffering";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import { createMcapTimelineIndex } from "./mcap-timeline-index";
import { McapTopicCache } from "./mcap-topic-cache";
import {
  recordMcapMessageWindowBandwidth,
  type McapBandwidthOperation,
} from "./mcap-bandwidth-debug";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

// One engine stream owns all MCAP topics so camera/lidar tiles stay on the
// same synchronized timeline and fetch in shared batches.
const STREAM_ID = "mcap-data-stream";

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
   * Number of bounded worker batches needed to cover one full lookahead window,
   * derived from `lookaheadSeconds / prefetchBatchSeconds`.
   */
  readonly prefetchBatchesPerLookahead: number;

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
const PLAYBACK_COMMIT_GAP_WARNING_MS = 250;
const PLAYBACK_STALL_MEASUREMENT_SECONDS = 10;

const PLAYBACK_POLICY = deriveMcapPlaybackPolicy(DEFAULT_MCAP_PLAYBACK_POLICY);
let mcapDataRequestCounter = 0;

const noop = (): void => undefined;

type PlaybackStallState = "ready" | "loading" | "missing";

interface PlaybackStallWindow {
  currentStallStartMs?: number;
  ended: boolean;
  endPlayheadSec: number;
  kind: "first" | "loopback";
  lastObservationMs?: number;
  lastState?: PlaybackStallState;
  loadingWallMs: number;
  maxStallMs: number;
  missingWallMs: number;
  sessionId: number;
  stallCount: number;
  stallWallMs: number;
  startPlayheadSec: number;
  startWallMs: number;
}

export interface UseMcapDataStreamOptions {
  blockingTopics: readonly string[];
  client: McapResourceClient;
  source: ByteSourceDescriptor | null;
  allTopics: readonly string[];
  pointCloudTopics: readonly string[];
  staleMediaWarningNs: bigint;
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
  source,
  allTopics,
  pointCloudTopics,
  staleMediaWarningNs,
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
  const nextLookaheadRefreshTimeRef = useRef(0);
  const playbackStallSessionIdRef = useRef(0);
  const playbackStallWindowRef = useRef<PlaybackStallWindow | null>(null);
  const lastObservedPlayheadSecRef = useRef<number | null>(null);
  const loopRunwayStartTickKeyRef = useRef<string | null>(null);
  const indexRef = useRef<McapTimelineIndex | null>(null);
  const sourceEpochRef = useRef(0);
  indexRef.current = index;
  // Hold the most recent `allTopics` / `streamPolicies` in refs so the
  // stable callbacks below read fresh values without listing them as
  // deps (which would invalidate the registered stream every render).
  const allTopicsRef = useRef(allTopics);
  const blockingTopicsRef = useRef<ReadonlySet<string>>(
    new Set(blockingTopics),
  );
  const pointCloudTopicsRef = useRef<ReadonlySet<string>>(
    new Set(pointCloudTopics),
  );
  const staleMediaWarningNsRef = useRef(staleMediaWarningNs);
  const streamPoliciesRef = useRef(streamPolicies);
  useEffect(() => {
    allTopicsRef.current = allTopics;
  }, [allTopics]);
  useEffect(() => {
    blockingTopicsRef.current = new Set(blockingTopics);
  }, [blockingTopics]);
  useEffect(() => {
    pointCloudTopicsRef.current = new Set(pointCloudTopics);
  }, [pointCloudTopics]);
  useEffect(() => {
    staleMediaWarningNsRef.current = staleMediaWarningNs;
  }, [staleMediaWarningNs]);
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

    const tick = firstTickAtOrAfter(currentIndex.ticks, firstMessageTimeNs);
    if (tick === undefined) return;

    const targetSec = nsToSeconds(tick - currentIndex.startTimeNs);
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
    finishPlaybackStallWindow(
      playbackStallWindowRef.current,
      "source-reset",
      getPlayhead(store),
    );
    playbackStallWindowRef.current = null;
    sourceEpochRef.current += 1;
    const sourceEpoch = sourceEpochRef.current;
    setIndex(null);
    pendingTicksRef.current.clear();
    lastFrameRef.current.clear();
    failureStreakRef.current.clear();
    failedTopicsRef.current.clear();
    topicStartTimesNsRef.current.clear();
    autoSeekSourceEpochRef.current = null;
    nextLookaheadRefreshTimeRef.current = 0;
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
    if (bufferedRangesTimerRef.current !== null) {
      clearTimeout(bufferedRangesTimerRef.current);
      bufferedRangesTimerRef.current = null;
    }
    if (!source) return;
    let cancelled = false;
    const timelineRangeStartMs = mcapLatencyNowMs();
    markMcapLatencyEvent(
      "timeline range request",
      { topics: allTopicsRef.current.length },
      { onceKey: "timeline-range-request" },
    );
    const rangeRead = client.readTimelineRange({
      source,
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    });
    rangeRead
      .then((range) => {
        if (!cancelled && sourceEpochRef.current === sourceEpoch) {
          const nextIndex = createMcapTimelineIndex(range);
          markMcapLatencyEvent(
            "timeline index ready",
            {
              durationMs: mcapLatencyDurationMs(timelineRangeStartMs),
              durationSec: Number(nextIndex.durationSec.toFixed(3)),
              ticks: nextIndex.ticks.length,
            },
            { onceKey: "timeline-index-ready" },
          );
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
  // stalling. Walks the full tick index, hence the trailing throttle in
  // `scheduleBufferedRangesPublish`.
  const computeBufferedRanges = useCallback((): Array<[number, number]> => {
    const currentIndex = indexRef.current;
    if (!currentIndex) return [];
    const activeTopics = getActiveBlockingTopics();
    if (activeTopics.length === 0) return [];
    const caches = topicCachesRef.current;
    const { startTimeNs, ticks, durationSec } = currentIndex;
    const nominalTickSec = 1 / DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ;

    const tickToSec = (tick: bigint): number => {
      const delta = tick - startTimeNs;
      return (
        Number(delta / 1_000_000_000n) +
        Number(delta % 1_000_000_000n) / 1_000_000_000
      );
    };

    const ranges: Array<[number, number]> = [];
    let runStart: number | null = null;
    let runEnd = 0;
    for (const tick of ticks) {
      const covered = activeTopics.every((t) => caches.get(t)?.has(tick));
      if (covered) {
        const sec = tickToSec(tick);
        if (runStart === null) runStart = sec;
        runEnd = Math.min(sec + nominalTickSec, durationSec);
      } else if (runStart !== null) {
        ranges.push([runStart, runEnd]);
        runStart = null;
      }
    }
    if (runStart !== null) ranges.push([runStart, runEnd]);
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

  // Clear any pending buffered-ranges timer when the hook unmounts so it
  // can't fire against an orphaned store.
  useEffect(
    () => () => {
      finishPlaybackStallWindow(
        playbackStallWindowRef.current,
        "unmounted",
        getPlayhead(store),
      );
      playbackStallWindowRef.current = null;
      if (bufferedRangesTimerRef.current !== null) {
        clearTimeout(bufferedRangesTimerRef.current);
        bufferedRangesTimerRef.current = null;
      }
      clearPausedIdleWarmupTimer();
    },
    [clearPausedIdleWarmupTimer, store],
  );

  useEffect(() => {
    if (!isMcapLatencyDebugEnabled()) {
      finishPlaybackStallWindow(
        playbackStallWindowRef.current,
        "debug-disabled",
        getPlayhead(store),
      );
      playbackStallWindowRef.current = null;
      return;
    }

    if (isPlaying && index && source) {
      const active = playbackStallWindowRef.current;
      if (active && !active.ended) return;
      const startPlayheadSec = getPlayhead(store);
      playbackStallWindowRef.current = createPlaybackStallWindow(
        ++playbackStallSessionIdRef.current,
        startPlayheadSec,
        index.durationSec,
      );
      return;
    }

    finishPlaybackStallWindow(
      playbackStallWindowRef.current,
      "paused",
      getPlayhead(store),
    );
    playbackStallWindowRef.current = null;
  }, [index, isPlaying, source, store]);

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
          } else {
            staleAgeNs = staleAgeForMessage(
              tick,
              msg,
              staleMediaWarningNsRef.current,
            );
            status = staleAgeNs === null ? "ready" : "stale";
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

    const total = activeTopics.length;
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

    if (isMcapLatencyDebugEnabled() && tick !== null && blockingTotal > 0) {
      if (blockingCovered === blockingTotal) {
        markMcapLatencyEvent(
          "playhead buffer ready",
          {
            playheadSec: Number(playheadSec.toFixed(3)),
            streams: blockingTotal,
            tickNs: tick,
          },
          { onceKey: "first-playhead-buffer-ready" },
        );
      }

      if (startupReady) {
        markMcapLatencyEvent(
          "startup buffer ready",
          {
            lookaheadSec: Number(
              PLAYBACK_POLICY.startupLookaheadSeconds.toFixed(3),
            ),
            playheadSec: Number(playheadSec.toFixed(3)),
            streams: blockingTotal,
            tickNs: tick,
            ticks: startupCoverage.total,
          },
          { onceKey: "first-startup-buffer-ready" },
        );
      }
    }

    // Every data-flow event that can change statuses can also change
    // coverage — refresh the timeline's buffered shading (throttled).
    if (startupReady && getIsPlayPending(store)) {
      if (isMcapLatencyDebugEnabled()) {
        recordMcapLatencyMetric(
          "startup buffered ranges immediate publish",
          1,
          {
            activeTopics: total,
            blockingTopics: blockingTotal,
            coveredTicks: startupCoverage?.covered ?? 0,
            startupTicks: startupCoverage?.total ?? 0,
            timeSec: Number(playheadSec.toFixed(3)),
          },
        );
      }
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

  // Core batch-fetch helper. Fetches ticks for the active topic set, fills
  // per-topic caches, and (since the engine doesn't tick when paused) also
  // pushes any fetched frame at the current playhead to atoms so paused
  // tiles render their first frame as soon as the network resolves.
  const fetchBatch = useCallback(
    (
      ticks: bigint[],
      activeTopics: string[],
      operation: McapBandwidthOperation,
    ) => {
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

      const latencyDebugEnabled = isMcapLatencyDebugEnabled();
      const mcapDataRequestId = latencyDebugEnabled
        ? nextMcapDataRequestId(operation)
        : undefined;
      const batchCoverageBefore = latencyDebugEnabled
        ? batchTopicTickCoverage(caches, toFetch, topicsToFetch)
        : null;
      const batchPriority = mcapBatchReadPriority(operation);
      const wasPlayPending = latencyDebugEnabled
        ? getIsPlayPending(store)
        : false;
      const wasBuffering = latencyDebugEnabled ? getIsBuffering(store) : false;
      const batchStartMs = latencyDebugEnabled ? mcapLatencyNowMs() : 0;
      let batchCompletionDetail: Record<string, unknown> | null = null;

      markTopicsPending(keys, topicsToFetch);
      if (latencyDebugEnabled) {
        const requestDetail = {
          ...batchRequestDetail(toFetch, topicsToFetch),
          ...batchCoverageDetail("before", batchCoverageBefore),
          mcapDataRequestId,
          operation,
          priority: batchPriority,
          wasBuffering,
          wasPlayPending,
        };
        markMcapLatencyEvent("mcap data batch request", requestDetail);
        markMcapLatencyEvent("lookahead batch request", requestDetail, {
          onceKey: "first-lookahead-batch-request",
        });
        const pointCloudTopicsToFetch = topicsToFetch.filter((topic) =>
          pointCloudTopicsRef.current.has(topic),
        );
        if (pointCloudTopicsToFetch.length > 0) {
          markMcapLatencyEvent(
            "point cloud lookahead batch request",
            batchRequestDetail(toFetch, pointCloudTopicsToFetch),
            { onceKey: "first-point-cloud-lookahead-batch-request" },
          );
        }
        recordMcapLatencyMetric(
          "lookahead batch requested ticks",
          toFetch.length,
          {
            ...batchCoverageDetail("before", batchCoverageBefore),
            mcapDataRequestId,
            operation,
            topics: topicsToFetch.length,
          },
        );
      }

      client
        .readSynchronizedMessageBatch(
          {
            activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
            ...(mcapDataRequestId ? { mcapDataRequestId } : {}),
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
          handleFetchSuccess(topicsToFetch);

          const activeFetchedTopics = activeTopicsInCaches(
            caches,
            topicsToFetch,
          );
          if (activeFetchedTopics.length === 0) return;

          for (const window of windows) {
            distributeWindowToCaches(window, caches, activeFetchedTopics, {
              pinned: operation === "loopback-lookahead",
            });
          }
          if (latencyDebugEnabled) {
            const durationMs = mcapLatencyDurationMs(batchStartMs);
            const pointCloudMessages = pointCloudMessageCountInWindows(windows);
            const batchCoverageAfter = batchTopicTickCoverage(
              caches,
              toFetch,
              topicsToFetch,
            );
            const detail = {
              ...batchRequestDetail(toFetch, activeFetchedTopics),
              ...batchCoverageDetail("before", batchCoverageBefore),
              ...batchCoverageDetail("after", batchCoverageAfter),
              activeFetchedTopics: activeFetchedTopics.length,
              durationMs,
              mcapDataRequestId,
              operation,
              pointCloudMessages,
              requestedTopics: topicsToFetch.length,
              windows: windows.length,
            };
            batchCompletionDetail = detail;
            recordMcapLatencyMetric(
              "lookahead batch duration ms",
              durationMs,
              detail,
            );
            recordMcapMessageWindowBandwidth({
              operation,
              requestId: mcapDataRequestId,
              requestedTicks: toFetch.length,
              requestedTopics: activeFetchedTopics.length,
              windows,
            });
            recordMcapLatencyMetric(
              "lookahead batch buffered windows",
              windows.length,
              detail,
            );
            markMcapLatencyEvent("lookahead batch buffered", detail, {
              onceKey: "first-lookahead-batch-buffered",
            });
            if (pointCloudMessages > 0) {
              markMcapLatencyEvent(
                "point cloud lookahead batch buffered",
                detail,
                { onceKey: "first-point-cloud-lookahead-batch-buffered" },
              );
            }
          }
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
            );
          }
        })
        .catch((error) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          handleFetchFailure(error, toFetch, topicsToFetch);
          if (latencyDebugEnabled) {
            markMcapLatencyEvent("mcap data batch failed", {
              ...batchRequestDetail(toFetch, topicsToFetch),
              ...batchCoverageDetail("before", batchCoverageBefore),
              durationMs: mcapLatencyDurationMs(batchStartMs),
              error: String(error),
              mcapDataRequestId,
              operation,
            });
          }
        })
        .finally(() => {
          if (sourceEpochRef.current !== sourceEpoch) return;

          clearTopicsPending(keys, topicsToFetch);
          publishStreamStatuses();
          if (latencyDebugEnabled && batchCompletionDetail) {
            const isBufferingAfter = getIsBuffering(store);
            const isPlayPendingAfter = getIsPlayPending(store);
            markMcapLatencyEvent("mcap data batch settled", {
              ...batchCompletionDetail,
              isBufferingAfter,
              isPlayPendingAfter,
              unblockedBuffering: wasBuffering && !isBufferingAfter,
              unblockedPendingPlay: wasPlayPending && !isPlayPendingAfter,
            });
          }
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
      const latencyDebugEnabled = isMcapLatencyDebugEnabled();
      const currentFrameStartMs = latencyDebugEnabled ? mcapLatencyNowMs() : 0;
      if (latencyDebugEnabled) {
        markMcapLatencyEvent(
          "current frame request",
          {
            tickNs: tick,
            topics: topicsToFetch.length,
          },
          { onceKey: "first-current-frame-request" },
        );
        const pointCloudTopicsToFetch = topicsToFetch.filter((topic) =>
          pointCloudTopicsRef.current.has(topic),
        );
        if (pointCloudTopicsToFetch.length > 0) {
          markMcapLatencyEvent(
            "point cloud current frame request",
            {
              tickNs: tick,
              topics: pointCloudTopicsToFetch.length,
            },
            { onceKey: "first-point-cloud-current-frame-request" },
          );
        }
      }

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
          handleFetchSuccess(topicsToFetch);

          const activeFetchedTopics = activeTopicsInCaches(
            caches,
            topicsToFetch,
          );
          if (activeFetchedTopics.length === 0) return;

          distributeWindowToCaches(window, caches, activeFetchedTopics);
          if (latencyDebugEnabled) {
            const durationMs = mcapLatencyDurationMs(currentFrameStartMs);
            const pointCloudMessages = pointCloudMessageCount(window);
            const detail = {
              durationMs,
              pointCloudMessages,
              tickNs: tick,
              topics: activeFetchedTopics.length,
            };
            recordMcapLatencyMetric(
              "current frame duration ms",
              durationMs,
              detail,
            );
            recordMcapMessageWindowBandwidth({
              operation: "current-frame",
              requestedTicks: 1,
              requestedTopics: activeFetchedTopics.length,
              windows: [window],
            });
            markMcapLatencyEvent("current frame cached", detail, {
              onceKey: "first-current-frame-cached",
            });
            if (pointCloudMessages > 0) {
              markMcapLatencyEvent("point cloud current frame cached", detail, {
                onceKey: "first-point-cloud-current-frame-cached",
              });
            }
          }
          pushTickToStore(
            activeTopicsInCaches(caches, activeTopics),
            tick,
            caches,
            lastFrameRef.current,
            store,
          );
        })
        .catch((error) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
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
      // Binary-search to the first tick >= startNs so this runs in
      // O(log n + window) instead of O(n) per RAF prefetch.
      const ticks = currentIndex.ticks;
      const startIdx = lowerBoundBigInt(ticks, startNs);
      const toFetch: bigint[] = [];
      for (let i = startIdx; i < ticks.length; i++) {
        const tick = ticks[i];
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
      if (
        secondsToLoopEnd < 0 ||
        secondsToLoopEnd > PLAYBACK_POLICY.lookaheadSeconds
      ) {
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

      const loopRunwayCoverage = bufferWindowCoverage({
        activeTopics,
        caches: topicCachesRef.current,
        index: currentIndex,
        lookaheadSeconds: PLAYBACK_POLICY.lookaheadSeconds,
        maxTicks: PLAYBACK_POLICY.maxPrefetchBatch,
        timeSec: loopStartSec,
      });
      const missing = collectMissingTicksForTopics(
        loopStartSec,
        loopStartSec + PLAYBACK_POLICY.lookaheadSeconds,
        PLAYBACK_POLICY.maxPrefetchBatch,
        activeTopics,
      );

      if (isMcapLatencyDebugEnabled()) {
        const detail = {
          activeTopics: activeTopics.length,
          coveredTicks: loopRunwayCoverage?.covered ?? 0,
          loopEndSec: Number(loopEndSec.toFixed(3)),
          loopStartSec: Number(loopStartSec.toFixed(3)),
          missingTicks: missing.length,
          runwayTicks: loopRunwayCoverage?.total ?? 0,
          secondsToLoopEnd: Number(secondsToLoopEnd.toFixed(3)),
          timeSec: Number(timeSec.toFixed(3)),
        };
        markMcapLatencyEvent("loopback runway checked", detail);
        recordMcapLatencyMetric("loopback runway checks", 1, detail);
      }

      if (missing.length === 0) {
        if (isMcapLatencyDebugEnabled()) {
          markMcapLatencyEvent("loopback runway ready", {
            activeTopics: activeTopics.length,
            loopStartSec: Number(loopStartSec.toFixed(3)),
            secondsToLoopEnd: Number(secondsToLoopEnd.toFixed(3)),
            ticks: loopRunwayCoverage?.total ?? 0,
            timeSec: Number(timeSec.toFixed(3)),
          });
        }
        return false;
      }

      const queued = fetchBatch(missing, activeTopics, "loopback-lookahead");
      if (queued && isMcapLatencyDebugEnabled()) {
        const detail = {
          activeTopics: activeTopics.length,
          loopStartSec: Number(loopStartSec.toFixed(3)),
          secondsToLoopEnd: Number(secondsToLoopEnd.toFixed(3)),
          ticks: missing.length,
          timeSec: Number(timeSec.toFixed(3)),
        };
        markMcapLatencyEvent("loopback runway request", detail);
        recordMcapLatencyMetric(
          "loopback runway requested ticks",
          missing.length,
          detail,
        );
      }

      return queued;
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

    const endSec = timeSec + PLAYBACK_POLICY.pausedWarmupRunwaySeconds;
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
      if (isMcapLatencyDebugEnabled()) {
        recordMcapLatencyMetric("paused idle warmup passes", 1, {
          activeTopics: activeTopics.length,
          blockingTopics: activeBlockingTopics.length,
          horizonSec: Number(
            PLAYBACK_POLICY.pausedWarmupRunwaySeconds.toFixed(3),
          ),
          missingTicks: blockingMissing.length,
          phase: "blocking",
          timeSec: Number(timeSec.toFixed(3)),
        });
      }
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
      if (isMcapLatencyDebugEnabled()) {
        recordMcapLatencyMetric("paused idle warmup passes", 1, {
          activeTopics: activeTopics.length,
          blockingTopics: activeBlockingTopics.length,
          horizonSec: Number(
            PLAYBACK_POLICY.pausedWarmupRunwaySeconds.toFixed(3),
          ),
          missingTicks: allMissing.length,
          phase: "all",
          timeSec: Number(timeSec.toFixed(3)),
        });
      }
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
        const queuedFetch = runPausedIdleWarmup();
        if (queuedFetch) {
          schedulePausedIdleWarmupRef.current?.(
            PLAYBACK_POLICY.prefetchRefreshSeconds * 1000,
          );
        }
      }, delayMs);
    },
    [runPausedIdleWarmup],
  );

  useEffect(() => {
    schedulePausedIdleWarmupRef.current = schedulePausedIdleWarmup;
    return () => {
      if (schedulePausedIdleWarmupRef.current === schedulePausedIdleWarmup) {
        schedulePausedIdleWarmupRef.current = null;
      }
    };
  }, [schedulePausedIdleWarmup]);

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

      const tick = currentIndex.nearestTick(timeSec);
      // Explicit undefined check — `0n` is falsy but a valid tick.
      if (tick !== undefined) {
        pushTickToStore(
          activeTopics,
          tick,
          topicCachesRef.current,
          lastFrameRef.current,
          store,
        );
        fetchCurrentFrame(tick, activeTopics);
      }

      fillMissingStartupBufferFrom({
        activeTopics,
        collectMissingTicks: (startSec, endSec, maxTicks) =>
          collectMissingTicksForTopics(
            startSec,
            endSec,
            maxTicks,
            activeTopics,
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
      collectMissingTicksForTopics,
      fetchBatch,
      fetchCurrentFrame,
      getActiveTopics,
      publishStreamStatuses,
      store,
    ],
  );

  // Register the single engine stream and the proactive lookahead subscription.
  useEffect(() => {
    if (!index || !source) return;

    const nativeStep = 1 / DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ;
    const caches = topicCachesRef.current;
    const lastFrame = lastFrameRef.current;
    let lastBufferStateKey: string | null = null;
    let lastCommitGapEventMs = 0;
    let lastCommitWallMs: number | null = null;
    let lastCommittedTickKey: string | null = null;
    let lastLoopbackTargetStateKey: string | null = null;

    const stream: PlaybackStream = {
      id: STREAM_ID,
      blocking: true,
      duration: index.durationSec,
      nativeStepSeconds: nativeStep,
      lookaheadSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
      startupBufferSeconds: PLAYBACK_POLICY.startupLookaheadSeconds,
      bufferedRanges: computeBufferedRanges,

      bufferState: (timeSec) => {
        const tick = index.nearestTick(timeSec);
        // Explicit undefined check — `0n` is falsy but a valid tick
        // (files with relative log times start at exactly 0n, and a
        // falsy check here wedges the engine at t=0 forever).
        if (tick === undefined) {
          if (isMcapLatencyDebugEnabled()) {
            const detail = {
              state: "missing",
              timeSec: Number(timeSec.toFixed(3)),
              reason: "no-nearest-tick",
            };
            markMcapLatencyEvent("playback buffer state", detail);
            recordMcapLatencyMetric("buffer state missing", 1, {
              reason: "no-nearest-tick",
            });
            if (getIsPlaying(store)) {
              observePlaybackStallWindow(
                playbackStallWindowRef.current,
                "missing",
                timeSec,
                detail,
              );
            }
          }
          return "missing";
        }
        const activeTopics = getActiveBlockingTopics();
        if (activeTopics.length === 0) return "ready";
        const tickKey = tick.toString();
        let cachedTopics = 0;
        let missingTopics = 0;
        let pendingTopics = 0;
        for (const t of activeTopics) {
          if (caches.get(t)?.has(tick)) {
            cachedTopics++;
          } else if (isTopicPending(tickKey, t)) {
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
        if (isMcapLatencyDebugEnabled()) {
          const detail = {
            activeTopics: activeTopics.length,
            cachedTopics,
            missingTopics,
            pendingTopics,
            state,
            tickNs: tick,
            timeSec: Number(timeSec.toFixed(3)),
          };
          const stateKey = `${state}:${cachedTopics}:${pendingTopics}:${missingTopics}`;
          if (stateKey !== lastBufferStateKey) {
            lastBufferStateKey = stateKey;
            markMcapLatencyEvent("playback buffer state", detail);
          }
          const currentPlayheadSec = getPlayhead(store);
          if (
            isLoopbackTarget(
              timeSec,
              currentPlayheadSec,
              getLoopStart(store),
              getLoopEnd(store),
              nativeStep,
            )
          ) {
            const loopbackStateKey = `${stateKey}:${currentPlayheadSec.toFixed(
              3,
            )}`;
            if (loopbackStateKey !== lastLoopbackTargetStateKey) {
              lastLoopbackTargetStateKey = loopbackStateKey;
              markMcapLatencyEvent("playback loopback target buffer state", {
                ...detail,
                currentPlayheadSec: Number(currentPlayheadSec.toFixed(3)),
                loopEndSec: Number(getLoopEnd(store).toFixed(3)),
                loopStartSec: Number(getLoopStart(store).toFixed(3)),
              });
            }
          }
          recordMcapLatencyMetric(`buffer state ${state}`, 1, detail);
          if (getIsPlaying(store)) {
            observePlaybackStallWindow(
              playbackStallWindowRef.current,
              state,
              timeSec,
              detail,
            );
          }
        }
        return state;
      },

      prefetch: ([startSec, endSec]) => {
        const activeTopics = getActiveTopics();
        const activeBlockingTopics = getActiveBlockingTopics();
        const tick = index.nearestTick(startSec);
        // Explicit undefined check — `0n` is falsy but a valid tick.
        if (tick !== undefined) fetchCurrentFrame(tick, activeTopics);
        const missing = collectMissingTicksForTopics(
          startSec,
          endSec,
          PLAYBACK_POLICY.startupMaxPrefetchBatch,
          activeTopics,
        );
        if (isMcapLatencyDebugEnabled()) {
          const detail = {
            activeTopics: activeTopics.length,
            blockingTopics: activeBlockingTopics.length,
            endSec: Number(endSec.toFixed(3)),
            missingTicks: missing.length,
            startSec: Number(startSec.toFixed(3)),
          };
          markMcapLatencyEvent("playback prefetch requested", detail, {
            onceKey: "first-playback-prefetch-requested",
          });
          recordMcapLatencyMetric("playback prefetch calls", 1, detail);
        }
        if (missing.length > 0) {
          fetchBatch(missing, activeTopics, "playback-prefetch");
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
        pushTickToStore(activeTopics, tick, caches, lastFrame, commitStore);
        if (isMcapLatencyDebugEnabled()) {
          const nowMs = mcapLatencyNowMs();
          const detail = {
            activeTopics: activeTopics.length,
            tickNs: tick,
            timeSec: Number(timeSec.toFixed(3)),
          };
          markMcapLatencyEvent("playback first commit", detail, {
            onceKey: "first-playback-commit",
          });
          if (lastCommitWallMs !== null) {
            const wallDeltaMs = Number((nowMs - lastCommitWallMs).toFixed(1));
            recordMcapLatencyMetric(
              "playback commit wall delta ms",
              wallDeltaMs,
              {
                ...detail,
                wallDeltaMs,
              },
            );
            if (
              wallDeltaMs >= PLAYBACK_COMMIT_GAP_WARNING_MS &&
              nowMs - lastCommitGapEventMs >= PLAYBACK_COMMIT_GAP_WARNING_MS
            ) {
              lastCommitGapEventMs = nowMs;
              markMcapLatencyEvent("playback commit gap", {
                ...detail,
                wallDeltaMs,
              });
            }
          }
          lastCommitWallMs = nowMs;
          finishPlaybackStallWindowIfComplete(
            playbackStallWindowRef.current,
            timeSec,
          );
        }
        // The committed tick changed — gaps/ready flips happen here
        // during normal playback.
        publishStreamStatuses();
      },
    };

    const unregister = registerStream(stream);
    // Keep the stream permanently active — subscriber count is managed
    // per-topic via McapTopicCache, not at the engine stream level.
    const unsubscribe = subscribeStream(STREAM_ID);

    // Proactive lookahead: fill the buffer ahead of the playhead in larger
    // chunks instead of creating one tiny worker request per source tick.
    const unsubPlayhead = subscribePlayhead(store, () => {
      const timeSec = getPlayhead(store);
      const previousPlayheadSec = lastObservedPlayheadSecRef.current;
      const loopStartSec = getLoopStart(store);
      const loopEndSec = getLoopEnd(store);
      const movedBackward =
        previousPlayheadSec !== null &&
        timeSec + nativeStep < previousPlayheadSec;
      const didLoopback =
        previousPlayheadSec !== null &&
        isCommittedLoopback(
          previousPlayheadSec,
          timeSec,
          loopStartSec,
          loopEndSec,
          nativeStep,
        );
      lastObservedPlayheadSecRef.current = timeSec;
      if (movedBackward) {
        nextLookaheadRefreshTimeRef.current = 0;
      }
      if (
        didLoopback &&
        previousPlayheadSec !== null &&
        isMcapLatencyDebugEnabled()
      ) {
        const activeTopics = getActiveTopics();
        const activeBlockingTopics = getActiveBlockingTopics();
        const loopStartCoverage = bufferWindowCoverage({
          activeTopics: activeBlockingTopics,
          caches,
          index,
          lookaheadSeconds: PLAYBACK_POLICY.lookaheadSeconds,
          maxTicks: PLAYBACK_POLICY.maxPrefetchBatch,
          timeSec: loopStartSec,
        });
        markMcapLatencyEvent("playback loopback committed", {
          activeTopics: activeTopics.length,
          blockingTopics: activeBlockingTopics.length,
          coveredTicks: loopStartCoverage?.covered ?? 0,
          loopEndSec: Number(loopEndSec.toFixed(3)),
          loopStartSec: Number(loopStartSec.toFixed(3)),
          previousPlayheadSec: Number(previousPlayheadSec.toFixed(3)),
          runwayTicks: loopStartCoverage?.total ?? 0,
          timeSec: Number(timeSec.toFixed(3)),
        });
        finishPlaybackStallWindow(
          playbackStallWindowRef.current,
          "loopback-restart",
          previousPlayheadSec,
        );
        playbackStallWindowRef.current = createPlaybackStallWindow(
          ++playbackStallSessionIdRef.current,
          timeSec,
          index.durationSec,
          "loopback",
        );
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
        if (isMcapLatencyDebugEnabled()) {
          recordMcapLatencyMetric("background lookahead deferred", 1, {
            activeTopics: activeTopics.length,
            blockingTopics: activeBlockingTopics.length,
            coveredTicks: startupCoverage.covered,
            startupTicks: startupCoverage.total,
            timeSec: Number(timeSec.toFixed(3)),
          });
        }
        return;
      }

      if (isMcapLatencyDebugEnabled()) {
        recordMcapLatencyMetric("background lookahead topups", 1, {
          activeTopics: activeTopics.length,
          blockingTopics: activeBlockingTopics.length,
          timeSec: Number(timeSec.toFixed(3)),
        });
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
        policy: PLAYBACK_POLICY,
        timeSec,
      });
    });

    return () => {
      unregister();
      unsubscribe();
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
    warmLoopStartRunway,
  ]);

  // Paused-seek: scrub while paused → push or fetch the seeked tick + window.
  useEffect(() => {
    if (seekEvent) prefetchLookaheadFrom(seekEvent.time);
  }, [seekEvent, prefetchLookaheadFrom]);

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

  useEffect(() => {
    setDataStream({ subscribeToTopic, getTopicCache, getTimelineIndex });
    return () => {
      setDataStream(null);
    };
  }, [setDataStream, subscribeToTopic, getTopicCache, getTimelineIndex]);
}

// ---------------------------------------------------------------------------
// Module-level helpers (no React dependency)
// ---------------------------------------------------------------------------

function createPlaybackStallWindow(
  sessionId: number,
  startPlayheadSec: number,
  durationSec: number,
  kind: PlaybackStallWindow["kind"] = "first",
): PlaybackStallWindow {
  const endPlayheadSec = Math.min(
    startPlayheadSec + PLAYBACK_STALL_MEASUREMENT_SECONDS,
    durationSec,
  );
  const window: PlaybackStallWindow = {
    ended: false,
    endPlayheadSec,
    kind,
    loadingWallMs: 0,
    maxStallMs: 0,
    missingWallMs: 0,
    sessionId,
    stallCount: 0,
    stallWallMs: 0,
    startPlayheadSec,
    startWallMs: mcapLatencyNowMs(),
  };

  markMcapLatencyEvent(`${playbackStallWindowPrefix(kind)} started`, {
    endPlayheadSec: Number(endPlayheadSec.toFixed(3)),
    measurementSec: Number((endPlayheadSec - startPlayheadSec).toFixed(3)),
    sessionId,
    startPlayheadSec: Number(startPlayheadSec.toFixed(3)),
  });

  return window;
}

function observePlaybackStallWindow(
  window: PlaybackStallWindow | null,
  state: PlaybackStallState,
  playheadSec: number,
  detail?: Record<string, unknown>,
): void {
  if (!window || window.ended) return;

  const nowMs = mcapLatencyNowMs();
  advancePlaybackStallWindow(window, nowMs);

  const previousState = window.lastState;
  if (state !== "ready" && previousState === "ready") {
    startPlaybackStall(window, state, playheadSec, detail, nowMs);
  } else if (state !== "ready" && previousState === undefined) {
    startPlaybackStall(window, state, playheadSec, detail, nowMs);
  } else if (
    state === "ready" &&
    previousState !== undefined &&
    previousState !== "ready"
  ) {
    endPlaybackStall(window, playheadSec, detail, nowMs);
  }

  window.lastObservationMs = nowMs;
  window.lastState = state;
  finishPlaybackStallWindowIfComplete(window, playheadSec, nowMs);
}

function startPlaybackStall(
  window: PlaybackStallWindow,
  state: Exclude<PlaybackStallState, "ready">,
  playheadSec: number,
  detail: Record<string, unknown> | undefined,
  nowMs: number,
): void {
  window.currentStallStartMs = nowMs;
  window.stallCount += 1;
  markMcapLatencyEvent("playback stall started", {
    ...detail,
    playheadSec: Number(playheadSec.toFixed(3)),
    sessionId: window.sessionId,
    state,
  });
}

function endPlaybackStall(
  window: PlaybackStallWindow,
  playheadSec: number,
  detail: Record<string, unknown> | undefined,
  nowMs: number,
): void {
  if (window.currentStallStartMs !== undefined) {
    const stallMs = nowMs - window.currentStallStartMs;
    window.maxStallMs = Math.max(window.maxStallMs, stallMs);
  }
  window.currentStallStartMs = undefined;
  markMcapLatencyEvent("playback stall ended", {
    ...detail,
    playheadSec: Number(playheadSec.toFixed(3)),
    sessionId: window.sessionId,
  });
}

function advancePlaybackStallWindow(
  window: PlaybackStallWindow,
  nowMs: number,
): void {
  if (window.lastObservationMs === undefined) return;

  const deltaMs = Math.max(0, nowMs - window.lastObservationMs);
  if (window.lastState === "loading") {
    window.loadingWallMs += deltaMs;
    window.stallWallMs += deltaMs;
  } else if (window.lastState === "missing") {
    window.missingWallMs += deltaMs;
    window.stallWallMs += deltaMs;
  }
}

function finishPlaybackStallWindowIfComplete(
  window: PlaybackStallWindow | null,
  playheadSec: number,
  nowMs = mcapLatencyNowMs(),
): void {
  if (!window || window.ended) return;
  if (playheadSec < window.endPlayheadSec) return;
  finishPlaybackStallWindow(window, "completed", playheadSec, nowMs);
}

function finishPlaybackStallWindow(
  window: PlaybackStallWindow | null,
  reason: string,
  playheadSec: number,
  nowMs = mcapLatencyNowMs(),
): void {
  if (!window || window.ended) return;

  advancePlaybackStallWindow(window, nowMs);
  if (window.currentStallStartMs !== undefined) {
    window.maxStallMs = Math.max(
      window.maxStallMs,
      nowMs - window.currentStallStartMs,
    );
    window.currentStallStartMs = undefined;
  }

  window.ended = true;
  const summary = playbackStallSummary(window, reason, playheadSec, nowMs);
  const metricPrefix =
    window.kind === "loopback" ? "playback loopback 10s" : "playback first 10s";
  markMcapLatencyEvent(
    `${playbackStallWindowPrefix(window.kind)} finished`,
    summary,
  );
  recordMcapLatencyMetric(
    `${metricPrefix} stall wall ms`,
    summary.stallWallMs,
    summary,
  );
  recordMcapLatencyMetric(
    `${metricPrefix} max stall ms`,
    summary.maxStallMs,
    summary,
  );
  recordMcapLatencyMetric(
    `${metricPrefix} stall count`,
    summary.stallCount,
    summary,
  );
  recordMcapLatencyMetric(
    `${metricPrefix} stall percent`,
    summary.stallPercent,
    summary,
  );
}

function playbackStallWindowPrefix(kind: PlaybackStallWindow["kind"]): string {
  return kind === "loopback"
    ? "playback loopback 10s stall window"
    : "playback first 10s stall window";
}

function playbackStallSummary(
  window: PlaybackStallWindow,
  reason: string,
  playheadSec: number,
  nowMs: number,
) {
  const wallMs = Math.max(0, nowMs - window.startWallMs);
  const stallWallMs = Number(window.stallWallMs.toFixed(1));
  const loadingWallMs = Number(window.loadingWallMs.toFixed(1));
  const missingWallMs = Number(window.missingWallMs.toFixed(1));
  const maxStallMs = Number(window.maxStallMs.toFixed(1));
  const stallPercent =
    wallMs > 0 ? Number(((stallWallMs / wallMs) * 100).toFixed(1)) : 0;

  return {
    endPlayheadSec: Number(window.endPlayheadSec.toFixed(3)),
    loadingWallMs,
    maxStallMs,
    measurementSec: Number(
      (window.endPlayheadSec - window.startPlayheadSec).toFixed(3),
    ),
    missingWallMs,
    playheadSec: Number(playheadSec.toFixed(3)),
    reason,
    sessionId: window.sessionId,
    stallCount: window.stallCount,
    stallPercent,
    stallWallMs,
    startPlayheadSec: Number(window.startPlayheadSec.toFixed(3)),
    wallMs: Number(wallMs.toFixed(1)),
  };
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
    prefetchBatchesPerLookahead: Math.ceil(
      policy.lookaheadSeconds / policy.prefetchBatchSeconds,
    ),
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

function isCommittedLoopback(
  previousSec: number,
  timeSec: number,
  loopStartSec: number,
  loopEndSec: number,
  nativeStepSec: number,
): boolean {
  if (loopEndSec <= loopStartSec) return false;
  const tolerance = Math.max(nativeStepSec * 2, 0.05);
  return (
    previousSec >= loopEndSec - tolerance &&
    Math.abs(timeSec - loopStartSec) <= tolerance
  );
}

function isLoopbackTarget(
  targetSec: number,
  currentPlayheadSec: number,
  loopStartSec: number,
  loopEndSec: number,
  nativeStepSec: number,
): boolean {
  if (loopEndSec <= loopStartSec) return false;
  const tolerance = Math.max(nativeStepSec * 2, 0.05);
  return (
    currentPlayheadSec >= loopEndSec - tolerance &&
    Math.abs(targetSec - loopStartSec) <= tolerance
  );
}

function nextMcapDataRequestId(operation: McapBandwidthOperation): string {
  mcapDataRequestCounter += 1;
  return `mcap-data:${operation}:${Date.now().toString(
    36,
  )}:${mcapDataRequestCounter}`;
}

function mcapBatchReadPriority(
  operation: McapBandwidthOperation,
): "idle" | "playback" {
  return operation === "background-lookahead" ? "idle" : "playback";
}

function fillMissingLookaheadFrom({
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
    operation: McapBandwidthOperation,
  ) => boolean;
  policy: DerivedMcapPlaybackPolicy;
  timeSec: number;
}): boolean {
  const endSec = timeSec + policy.lookaheadSeconds;
  const batchesToQueue = Math.min(
    policy.prefetchBatchesPerPass,
    policy.prefetchBatchesPerLookahead,
  );
  for (let i = 0; i < batchesToQueue; i++) {
    const missing = collectMissingTicks(
      timeSec,
      endSec,
      policy.maxPrefetchBatch,
    );
    if (missing.length === 0) return false;
    if (!fetchBatch(missing, activeTopics, "background-lookahead")) {
      return false;
    }
    return true;
  }
  return false;
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
    operation: McapBandwidthOperation,
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
  markMcapLatencyEvent(
    "startup buffer request",
    {
      lookaheadSec: Number(policy.startupLookaheadSeconds.toFixed(3)),
      streams: activeTopics.length,
      ticks: missing.length,
    },
    { onceKey: "first-startup-buffer-request" },
  );
  return fetchBatch(missing, activeTopics, "startup-lookahead");
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
  const startIdx = lowerBoundBigInt(index.ticks, startTick);
  let covered = 0;
  let total = 0;

  for (let i = startIdx; i < index.ticks.length && total < maxTicks; i++) {
    const tick = index.ticks[i];
    if (tick > endNs) break;
    total += 1;
    if (activeTopics.every((topic) => caches.get(topic)?.has(tick))) {
      covered += 1;
    }
  }

  return { covered, total };
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

function pushTickToStore(
  activeTopics: string[],
  tick: bigint,
  caches: Map<string, McapTopicCache>,
  lastFrame: Map<string, McapTopicPlaybackFrame<unknown>>,
  store: PlaybackStore,
): void {
  for (const topic of activeTopics) {
    const cache = caches.get(topic);
    if (!cache) continue;
    const msg = cache.get(tick);
    const viz = msg?.decoded.output.visualization ?? null;
    let toWrite: McapTopicPlaybackFrame<unknown> | null;
    if (msg === undefined) {
      toWrite = lastFrame.get(topic) ?? null;
    } else if (msg && viz !== null) {
      toWrite = {
        ageNs: tick >= msg.timelineTimeNs ? tick - msg.timelineTimeNs : 0n,
        contentTimeNs: msg.timelineTimeNs,
        frame: viz,
        requestedTimeNs: tick,
      };
      lastFrame.set(topic, toWrite);
    } else {
      toWrite = null;
      lastFrame.delete(topic);
    }
    if (getStreamValue(store, topic) === toWrite) continue;
    setStreamValue(store, topic, toWrite);
  }
}

function batchRequestDetail(
  ticks: readonly bigint[],
  topics: readonly string[],
): {
  readonly endTickNs?: bigint;
  readonly startTickNs?: bigint;
  readonly ticks: number;
  readonly topics: number;
} {
  return {
    ...(ticks[0] !== undefined ? { startTickNs: ticks[0] } : {}),
    ...(ticks[ticks.length - 1] !== undefined
      ? { endTickNs: ticks[ticks.length - 1] }
      : {}),
    ticks: ticks.length,
    topics: topics.length,
  };
}

function batchTopicTickCoverage(
  caches: Map<string, McapTopicCache>,
  ticks: readonly bigint[],
  topics: readonly string[],
): {
  readonly cached: number;
  readonly percent: number;
  readonly total: number;
} {
  const total = ticks.length * topics.length;
  if (total === 0) return { cached: 0, percent: 0, total: 0 };

  let cached = 0;
  for (const tick of ticks) {
    for (const topic of topics) {
      if (caches.get(topic)?.has(tick)) cached++;
    }
  }

  return {
    cached,
    percent: Number(((cached / total) * 100).toFixed(1)),
    total,
  };
}

function batchCoverageDetail(
  suffix: "after" | "before",
  coverage: ReturnType<typeof batchTopicTickCoverage> | null,
): Record<string, number> {
  if (!coverage) return {};

  const capitalizedSuffix = suffix === "before" ? "Before" : "After";
  return {
    [`cachedTopicTicks${capitalizedSuffix}`]: coverage.cached,
    [`cacheCoveragePercent${capitalizedSuffix}`]: coverage.percent,
    [`requestedTopicTicks${capitalizedSuffix}`]: coverage.total,
  };
}

function pointCloudMessageCount(window: McapSynchronizedMessageWindow): number {
  let count = 0;
  for (const messages of Object.values(window.messagesByTopic)) {
    for (const message of messages ?? []) {
      if (message.decoded.output.visualization?.kind === "point-cloud") {
        count++;
      }
    }
  }
  return count;
}

function pointCloudMessageCountInWindows(
  windows: readonly McapSynchronizedMessageWindow[],
): number {
  return windows.reduce(
    (sum, window) => sum + pointCloudMessageCount(window),
    0,
  );
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

function firstTickAtOrAfter(
  ticks: readonly bigint[],
  target: bigint,
): bigint | undefined {
  const index = lowerBoundBigInt(ticks, target);
  return ticks[index];
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
