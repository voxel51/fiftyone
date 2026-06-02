import {
  playheadAtom,
  seekEventAtom,
  streamValueAtom,
  usePlayback,
  usePlaybackStore,
  type PlaybackStore,
  type PlaybackStream,
} from "@fiftyone/playback";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const seekEvent = useAtomValue(seekEventAtom, { store });

  const [index, setIndex] = useState<McapTimelineIndex | null>(null);

  // Stable refs — read in RAF/subscribe callbacks without closure capture.
  const topicCachesRef = useRef<Map<string, McapTopicCache>>(new Map());
  // Pending fetches keyed by tick → set of topics each in-flight request
  // is covering. Per-topic so a request that omits a newly-subscribed
  // topic doesn't make collectMissingTicks think that topic is in flight.
  const pendingTicksRef = useRef<Map<string, Set<string>>>(new Map());
  const lastFrameRef = useRef<Map<string, unknown>>(new Map());
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
    nextLookaheadRefreshTimeRef.current = 0;
    for (const cache of topicCachesRef.current.values()) {
      cache.clear();
    }
    for (const topic of topicCachesRef.current.keys()) {
      store.set(streamValueAtom(topic), null);
    }
    if (!source) return;
    let cancelled = false;
    client
      .readTimelineRange({ source, activeTimeline: MCAP_ACTIVE_TIMELINE.LOG })
      .then((range) => {
        if (!cancelled && sourceEpochRef.current === sourceEpoch) {
          setIndex(createMcapTimelineIndex(range));
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
          const tick = currentIndex.nearestTick(store.get(playheadAtom));
          const stillActiveTopics = activeTopicsInCaches(caches, activeTopics);
          if (tick) {
            pushTickToStore(
              stillActiveTopics,
              tick,
              caches,
              lastFrameRef.current,
              store
            );
          }
        })
        .catch(noop)
        .finally(() => {
          if (sourceEpochRef.current !== sourceEpoch) return;

          clearTopicsPending(keys, topicsToFetch);
        });

      return true;
    },
    [client, source, store]
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
        .catch(noop)
        .finally(() => {
          if (sourceEpochRef.current !== sourceEpoch) return;

          clearTopicsPending([tickKey], topicsToFetch);
        });

      return true;
    },
    [client, source, store]
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
      if (tick) {
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
    },
    [collectMissingTicks, fetchBatch, fetchCurrentFrame, getActiveTopics, store]
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
        if (!tick) return "missing";
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
        if (tick) fetchCurrentFrame(tick, activeTopics);
        const missing = collectMissingTicks(startSec, endSec);
        if (missing.length > 0) fetchBatch(missing, activeTopics);
      },

      onCommit: (timeSec, commitStore) => {
        const tick = index.nearestTick(timeSec);
        if (!tick) return;
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
      },
    };

    const unregister = registerStream(stream);
    // Keep the stream permanently active — subscriber count is managed
    // per-topic via McapTopicCache, not at the engine stream level.
    const unsubscribe = subscribeStream(STREAM_ID);

    // Proactive lookahead: fill the buffer ahead of the playhead in larger
    // chunks instead of creating one tiny worker request per source tick.
    const unsubPlayhead = store.sub(playheadAtom, () => {
      const timeSec = store.get(playheadAtom);
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
  ]);

  // Paused-seek: scrub while paused → push or fetch the seeked tick + window.
  useEffect(() => {
    if (seekEvent) prefetchLookaheadFrom(seekEvent.time);
  }, [seekEvent, prefetchLookaheadFrom]);

  // Mount-time: kick off lookahead so the buffer fills before play/seek.
  // (May be a no-op if no tile has subscribed yet — subscribeToTopic also
  // triggers this for the same reason.)
  useEffect(() => {
    if (index) prefetchLookaheadFrom(store.get(playheadAtom));
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
      prefetchLookaheadFrom(store.get(playheadAtom));
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
    const atom = streamValueAtom(topic);
    if (store.get(atom) === toWrite) continue;
    store.set(atom, toWrite);
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
