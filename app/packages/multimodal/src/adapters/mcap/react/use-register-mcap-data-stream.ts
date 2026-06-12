import {
  getBufferedRanges,
  getBufferingDetail,
  getIsBuffering,
  getPlayhead,
  getStreamValue,
  setBufferedRanges,
  setBufferingDetail,
  setIsBuffering,
  setStreamValue,
  subscribePlayhead,
  usePlayback,
  usePlaybackStore,
  useSeekEvent,
  type PlaybackStore,
  type PlaybackStream,
} from "@fiftyone/playback";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMcapTopicStatus,
  setMcapTopicStartTimeSec,
  setMcapTopicStatus,
  type McapTopicStatus,
} from "./mcap-stream-status";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ } from "../timeline";
import type {
  McapResourceClient,
  McapStreamSyncPolicies,
  McapSynchronizedMessageWindow,
} from "../types";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import { useSetMcapDataStream } from "./mcap-data-stream-context";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import { createMcapTimelineIndex } from "./mcap-timeline-index";
import { McapTopicCache } from "./mcap-topic-cache";

// One engine stream owns all MCAP topics so camera/lidar tiles stay on the
// same synchronized timeline and fetch in shared batches.
const STREAM_ID = "mcap-data-stream";

interface McapPlaybackPolicy {
  /**
   * Target buffer horizon. This should be long enough to hide normal worker
   * decode latency and short enough that a seek/topic switch does not overfetch
   * a large part of the file.
   */
  readonly lookaheadSeconds: number;

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
  lookaheadSeconds: 15,
  prefetchBatchSeconds: 5,
  prefetchBatchesPerPass: 1,
  prefetchRefreshSeconds: 1,
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

/**
 * Age past which a rendered frame counts as "stale": selection is
 * latest-at-or-before with unbounded lookback, so a mid-recording
 * sensor dropout keeps rendering the last frame — the status flips so
 * a frozen frame can't read as live. Generous enough that normally
 * sparse streams (keyframe-rate annotations) never trip it.
 */
const STALE_THRESHOLD_NS = 3_000_000_000n;

const PLAYBACK_POLICY = deriveMcapPlaybackPolicy(DEFAULT_MCAP_PLAYBACK_POLICY);

const noop = (): void => undefined;

export interface UseMcapDataStreamOptions {
  client: McapResourceClient;
  source: ByteSourceDescriptor | null;
  allTopics: readonly string[];
  streamPolicies: McapStreamSyncPolicies;
}

/**
 * Registers one PlaybackStream that manages all MCAP topics together.
 *
 * - Fetches only the topics that have at least one active subscriber (open
 *   tile). Closed tiles stop counting — their topics are skipped in all
 *   batch requests, saving network bandwidth.
 * - One readSynchronizedMessageBatch call covers the entire lookahead window
 *   for all active topics simultaneously. Per-topic caches deduplicate
 *   concurrent requests for the same tick.
 * - Publishes `{ subscribeToTopic }` into the surrounding
 *   `McapDataStreamProvider` so tile bodies can subscribe to
 *   individual topic caches without going through an atom.
 */
export function useRegisterMcapDataStream({
  client,
  source,
  allTopics,
  streamPolicies,
}: UseMcapDataStreamOptions): void {
  const { registerStream, subscribeStream } = usePlayback();
  const store = usePlaybackStore();
  const setDataStream = useSetMcapDataStream();
  const seekEvent = useSeekEvent();

  const [index, setIndex] = useState<McapTimelineIndex | null>(null);

  // Stable refs — read in RAF/subscribe callbacks without closure capture.
  const topicCachesRef = useRef<Map<string, McapTopicCache>>(new Map());
  // Pending fetches keyed by tick → set of topics each in-flight request
  // is covering. Per-topic so a request that omits a newly-subscribed
  // topic doesn't make collectMissingTicks think that topic is in flight.
  const pendingTicksRef = useRef<Map<string, Set<string>>>(new Map());
  const lastFrameRef = useRef<Map<string, unknown>>(new Map());
  // Consecutive fetch failures per topic; reset on the first success.
  const failureStreakRef = useRef<Map<string, number>>(new Map());
  // Topics currently in the "failed" state (streak hit the cap). Sticky
  // until a later fetch covering the topic succeeds.
  const failedTopicsRef = useRef<Set<string>>(new Set());
  // Pending trailing-throttle timer for the buffered-ranges publish.
  const bufferedRangesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const nextLookaheadRefreshTimeRef = useRef(0);
  const indexRef = useRef<McapTimelineIndex | null>(null);
  const sourceEpochRef = useRef(0);
  indexRef.current = index;
  // Hold the most recent `allTopics` / `streamPolicies` in refs so the
  // stable callbacks below read fresh values without listing them as
  // deps (which would invalidate the registered stream every render).
  const allTopicsRef = useRef(allTopics);
  const streamPoliciesRef = useRef(streamPolicies);
  useEffect(() => {
    allTopicsRef.current = allTopics;
  }, [allTopics]);
  useEffect(() => {
    streamPoliciesRef.current = streamPolicies;
  }, [streamPolicies]);

  // Pending helpers — wrap the per-tick topic sets so call sites read
  // like simple predicates instead of repeating the get/has dance.
  const isTopicPending = (tickKey: string, topic: string): boolean =>
    pendingTicksRef.current.get(tickKey)?.has(topic) ?? false;
  const markTopicsPending = (
    tickKeys: readonly string[],
    topics: readonly string[]
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
    topics: readonly string[]
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
          new McapTopicCache(PLAYBACK_POLICY.topicCacheMaxEntries)
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
    pendingTicksRef.current.clear();
    lastFrameRef.current.clear();
    failureStreakRef.current.clear();
    failedTopicsRef.current.clear();
    nextLookaheadRefreshTimeRef.current = 0;
    for (const cache of topicCachesRef.current.values()) {
      cache.clear();
    }
    for (const topic of topicCachesRef.current.keys()) {
      setStreamValue(store, topic, null);
      setMcapTopicStatus(store, topic, "loading");
      setMcapTopicStartTimeSec(store, topic, null);
    }
    setBufferingDetail(store, null);
    setBufferedRanges(store, []);
    if (bufferedRangesTimerRef.current !== null) {
      clearTimeout(bufferedRangesTimerRef.current);
      bufferedRangesTimerRef.current = null;
    }
    if (!source) return;
    let cancelled = false;
    const rangeRead = client.readTimelineRange({
      source,
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    });
    rangeRead
      .then((range) => {
        if (!cancelled && sourceEpochRef.current === sourceEpoch) {
          setIndex(createMcapTimelineIndex(range));
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
          const startSec =
            bound.firstMessageTimeNs === null
              ? null
              : nsToSeconds(bound.firstMessageTimeNs - range.startTimeNs);
          setMcapTopicStartTimeSec(store, bound.topic, startSec);
        }
      })
      .catch(noop);
    return () => {
      cancelled = true;
    };
    // client is a stable singleton — re-running on its identity would
    // discard the loaded timeline range for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, store]);

  const getActiveTopics = useCallback(
    (): string[] =>
      allTopicsRef.current.filter(
        (t) => topicCachesRef.current.get(t)?.isActive
      ),
    []
  );

  // Contiguous [startSec, endSec] ranges where every active topic has the
  // tick cached — i.e. the stretches playback can run through without
  // stalling. Walks the full tick index, hence the trailing throttle in
  // `scheduleBufferedRangesPublish`.
  const computeBufferedRanges = useCallback((): Array<[number, number]> => {
    const currentIndex = indexRef.current;
    if (!currentIndex) return [];
    const activeTopics = getActiveTopics();
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
  }, [getActiveTopics]);

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
      if (bufferedRangesTimerRef.current !== null) {
        clearTimeout(bufferedRangesTimerRef.current);
        bufferedRangesTimerRef.current = null;
      }
    },
    []
  );

  // Recompute per-topic status at the current playhead tick and the
  // aggregate buffering detail ("N/M streams"). Same-value atom writes are
  // no-ops, so calling this from RAF-adjacent paths (stream.prefetch,
  // onCommit) only wakes React on actual transitions.
  const publishStreamStatuses = useCallback(() => {
    const activeTopics = getActiveTopics();
    const caches = topicCachesRef.current;
    const failed = failedTopicsRef.current;
    const tick = indexRef.current?.nearestTick(getPlayhead(store)) ?? null;

    let covered = 0;
    for (const topic of activeTopics) {
      const cache = caches.get(topic);

      let status: McapTopicStatus;
      if (tick === null || !cache?.has(tick)) {
        status = failed.has(topic) ? "failed" : "loading";
      } else {
        covered += 1;
        if (failed.has(topic)) {
          status = "failed";
        } else {
          const msg = cache.get(tick);
          if (!msg) {
            status = "gap";
          } else {
            // Latest-at-or-before selection holds the last frame through
            // dropouts; flag it once the frame is older than the
            // threshold so a frozen frame can't read as live.
            status =
              tick - msg.timelineTimeNs > STALE_THRESHOLD_NS
                ? "stale"
                : "ready";
          }
        }
      }
      if (getMcapTopicStatus(store, topic) !== status) {
        setMcapTopicStatus(store, topic, status);
      }
    }

    const total = activeTopics.length;
    const detail =
      tick !== null && total > 0 && covered < total
        ? `${covered}/${total} streams`
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
      total > 0 &&
      covered === total &&
      getIsBuffering(store)
    ) {
      setIsBuffering(store, false);
    }

    // Every data-flow event that can change statuses can also change
    // coverage — refresh the timeline's buffered shading (throttled).
    scheduleBufferedRangesPublish();
  }, [getActiveTopics, scheduleBufferedRangesPublish, store]);

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
          error
        );
      }
      // Statuses are republished by the caller's `.finally`, after the
      // pending bookkeeping for this fetch is cleared.
    },
    []
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
    (ticks: bigint[], activeTopics: string[]) => {
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
        })
      );
      if (topicsToFetch.length === 0) return false;

      markTopicsPending(keys, topicsToFetch);

      client
        .readSynchronizedMessageBatch({
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          source,
          streamPolicies: streamPoliciesRef.current,
          timeNs: toFetch,
          topics: topicsToFetch,
        })
        .then((windows) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
          handleFetchSuccess(topicsToFetch);

          const activeFetchedTopics = activeTopicsInCaches(
            caches,
            topicsToFetch
          );
          if (activeFetchedTopics.length === 0) return;

          for (const window of windows) {
            distributeWindowToCaches(window, caches, activeFetchedTopics);
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
              store
            );
          }
        })
        .catch((error) => {
          if (sourceEpochRef.current !== sourceEpoch) return;
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
    ]
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
          !caches.get(topic)?.has(tick) && !isTopicPending(tickKey, topic)
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
          handleFetchSuccess(topicsToFetch);

          const activeFetchedTopics = activeTopicsInCaches(
            caches,
            topicsToFetch
          );
          if (activeFetchedTopics.length === 0) return;

          distributeWindowToCaches(window, caches, activeFetchedTopics);
          pushTickToStore(
            activeTopicsInCaches(caches, activeTopics),
            tick,
            caches,
            lastFrameRef.current,
            store
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
    ]
  );

  // Collect ticks in [startSec, endSec] where at least one active topic
  // still needs the data — i.e. not cached and not already pending for
  // that specific topic. Capped by the resolved playback policy.
  const collectMissingTicks = useCallback(
    (startSec: number, endSec: number): bigint[] => {
      const currentIndex = indexRef.current;
      if (!currentIndex) return [];
      const activeTopics = getActiveTopics();
      if (activeTopics.length === 0) return [];
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
        const needsFetch = activeTopics.some(
          (t) => !caches.get(t)?.has(tick) && !isTopicPending(tickKey, t)
        );
        if (needsFetch) toFetch.push(tick);
        if (toFetch.length >= PLAYBACK_POLICY.maxPrefetchBatch) break;
      }
      return toFetch;
    },
    [getActiveTopics]
  );

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
          store
        );
        fetchCurrentFrame(tick, activeTopics);
      }

      fillMissingLookaheadFrom({
        activeTopics,
        collectMissingTicks,
        fetchBatch,
        policy: PLAYBACK_POLICY,
        timeSec,
      });

      // Surface "loading" immediately on seek/mount/subscribe — the
      // fetches kicked off above republish when they settle.
      publishStreamStatuses();
    },
    [
      collectMissingTicks,
      fetchBatch,
      fetchCurrentFrame,
      getActiveTopics,
      publishStreamStatuses,
      store,
    ]
  );

  // Register the single engine stream and the proactive lookahead subscription.
  useEffect(() => {
    if (!index || !source) return;

    const nativeStep = 1 / DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ;
    const caches = topicCachesRef.current;
    const lastFrame = lastFrameRef.current;
    let lastCommittedTickKey: string | null = null;

    const stream: PlaybackStream = {
      id: STREAM_ID,
      blocking: true,
      duration: index.durationSec,
      nativeStepSeconds: nativeStep,
      lookaheadSeconds: PLAYBACK_POLICY.lookaheadSeconds,

      bufferState: (timeSec) => {
        const tick = index.nearestTick(timeSec);
        // Explicit undefined check — `0n` is falsy but a valid tick
        // (files with relative log times start at exactly 0n, and a
        // falsy check here wedges the engine at t=0 forever).
        if (tick === undefined) return "missing";
        const activeTopics = getActiveTopics();
        if (activeTopics.length === 0) return "ready";
        const tickKey = tick.toString();
        let allCached = true;
        let everyMissingIsPending = true;
        for (const t of activeTopics) {
          if (caches.get(t)?.has(tick)) continue;
          allCached = false;
          if (!isTopicPending(tickKey, t)) {
            everyMissingIsPending = false;
            break;
          }
        }
        if (allCached) return "ready";
        return everyMissingIsPending ? "loading" : "missing";
      },

      prefetch: ([startSec, endSec]) => {
        const activeTopics = getActiveTopics();
        const tick = index.nearestTick(startSec);
        // Explicit undefined check — `0n` is falsy but a valid tick.
        if (tick !== undefined) fetchCurrentFrame(tick, activeTopics);
        const missing = collectMissingTicks(startSec, endSec);
        if (missing.length > 0) fetchBatch(missing, activeTopics);
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
        pushTickToStore(
          getActiveTopics(),
          tick,
          caches,
          lastFrame,
          commitStore
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

    // Proactive lookahead: fill the buffer ahead of the playhead in larger
    // chunks instead of creating one tiny worker request per source tick.
    const unsubPlayhead = subscribePlayhead(store, () => {
      const timeSec = getPlayhead(store);
      if (timeSec < nextLookaheadRefreshTimeRef.current) return;
      nextLookaheadRefreshTimeRef.current =
        timeSec + PLAYBACK_POLICY.prefetchRefreshSeconds;
      const activeTopics = getActiveTopics();
      if (activeTopics.length === 0) return;
      // Periodic top-up only fills missing lookahead; current-frame publication
      // stays in prefetchLookaheadFrom for mount, seek, and subscription paths.
      fillMissingLookaheadFrom({
        activeTopics,
        collectMissingTicks,
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
    collectMissingTicks,
    getActiveTopics,
    publishStreamStatuses,
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
      prefetchLookaheadFrom(getPlayhead(store));
      return () => {
        cleanup();
        // Cache cleared itself in its own cleanup once the count hit 0;
        // also drop the held-last-frame so a future re-subscribe can't
        // flash stale content from the previous session.
        if (!cache.isActive) lastFrameRef.current.delete(topic);
      };
    },
    [prefetchLookaheadFrom, store]
  );

  const getTopicCache = useCallback(
    (topic: string) => topicCachesRef.current.get(topic),
    []
  );
  const getTimelineIndex = useCallback(() => indexRef.current, []);

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

function deriveMcapPlaybackPolicy(
  policy: McapPlaybackPolicy,
  tickRateHz = DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ
): DerivedMcapPlaybackPolicy {
  return {
    ...policy,
    maxPrefetchBatch: Math.ceil(tickRateHz * policy.prefetchBatchSeconds),
    prefetchBatchesPerLookahead: Math.ceil(
      policy.lookaheadSeconds / policy.prefetchBatchSeconds
    ),
    topicCacheMaxEntries: Math.ceil(
      tickRateHz *
        policy.lookaheadSeconds *
        policy.topicCacheLookaheadMultiplier
    ),
  };
}

function fillMissingLookaheadFrom({
  activeTopics,
  collectMissingTicks,
  fetchBatch,
  policy,
  timeSec,
}: {
  activeTopics: string[];
  collectMissingTicks: (startSec: number, endSec: number) => bigint[];
  fetchBatch: (ticks: bigint[], activeTopics: string[]) => boolean;
  policy: DerivedMcapPlaybackPolicy;
  timeSec: number;
}): void {
  const endSec = timeSec + policy.lookaheadSeconds;
  const batchesToQueue = Math.min(
    policy.prefetchBatchesPerPass,
    policy.prefetchBatchesPerLookahead
  );
  for (let i = 0; i < batchesToQueue; i++) {
    const missing = collectMissingTicks(timeSec, endSec);
    if (missing.length === 0) return;
    if (!fetchBatch(missing, activeTopics)) return;
  }
}

function activeTopicsInCaches(
  caches: Map<string, McapTopicCache>,
  topics: readonly string[]
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

function distributeWindowToCaches(
  window: McapSynchronizedMessageWindow,
  caches: Map<string, McapTopicCache>,
  requestedTopics: readonly string[]
): void {
  // Seed every requested topic for this tick — null if the backend omitted
  // or returned an empty array — so bufferState resolves and the engine
  // doesn't stall on ticks where a topic has no message.
  for (const topic of requestedTopics) {
    const msgs = window.messagesByTopic[topic];
    caches.get(topic)?.set(window.timeNs, msgs?.[0] ?? null);
  }
}

function pushTickToStore(
  activeTopics: string[],
  tick: bigint,
  caches: Map<string, McapTopicCache>,
  lastFrame: Map<string, unknown>,
  store: PlaybackStore
): void {
  for (const topic of activeTopics) {
    const cache = caches.get(topic);
    if (!cache) continue;
    const msg = cache.get(tick);
    const viz = msg?.decoded.output.visualization ?? null;
    if (viz !== null) lastFrame.set(topic, viz);
    // Still publish `null` when the current atom holds data, but avoid
    // waking subscribers when the selected source tick hasn't changed.
    const toWrite = lastFrame.get(topic) ?? null;
    if (getStreamValue(store, topic) === toWrite) continue;
    setStreamValue(store, topic, toWrite);
  }
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

function bufferedRangesEqual(
  a: ReadonlyArray<readonly [number, number]>,
  b: ReadonlyArray<readonly [number, number]>
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}
