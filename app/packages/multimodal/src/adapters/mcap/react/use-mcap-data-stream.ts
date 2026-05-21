import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import { usePlayback } from "../../../../../playback/src/lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../../../../playback/src/lib/playback/playback-store-context";
import {
  playheadAtom,
  seekEventAtom,
  streamValueAtom,
} from "../../../../../playback/src/lib/playback/atoms";
import type {
  PlaybackStore,
  PlaybackStream,
} from "../../../../../playback/src/lib/playback/types";
import { DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ } from "../timeline";
import type {
  McapResourceClient,
  McapStreamSyncPolicies,
  McapSynchronizedMessageWindow,
} from "../types";
import { MCAP_ACTIVE_TIMELINE } from "../types";
import { mcapDataStreamAtom } from "./mcap-atoms";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import { createMcapTimelineIndex } from "./mcap-timeline-index";
import { McapTopicCache } from "./mcap-topic-cache";

const STREAM_ID = "mcap-data-stream";
const LOOKAHEAD_SECONDS = 15;
const MAX_PREFETCH_BATCH = 32;
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
 * - Writes { subscribeToTopic } into mcapDataStreamAtom (scoped to the
 *   playback store) so tiles can subscribe to individual topic caches.
 */
export function useMcapDataStream({
  client,
  source,
  allTopics,
  streamPolicies,
}: UseMcapDataStreamOptions): void {
  const { registerStream, subscribeStream } = usePlayback();
  const store = usePlaybackStore();
  const seekEvent = useAtomValue(seekEventAtom, { store });

  const [index, setIndex] = useState<McapTimelineIndex | null>(null);

  // Stable refs — read in RAF/subscribe callbacks without closure capture.
  const topicCachesRef = useRef<Map<string, McapTopicCache>>(new Map());
  const pendingTicksRef = useRef<Set<string>>(new Set());
  const lastFrameRef = useRef<Map<string, unknown>>(new Map());
  const indexRef = useRef<McapTimelineIndex | null>(null);
  indexRef.current = index;

  // Ensure a cache exists for every known topic.
  useEffect(() => {
    for (const topic of allTopics) {
      if (!topicCachesRef.current.has(topic)) {
        topicCachesRef.current.set(topic, new McapTopicCache());
      }
    }
  }, [allTopics]);

  // Load the timeline range once the source is available.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    client
      .readTimelineRange({ source, activeTimeline: MCAP_ACTIVE_TIMELINE.LOG })
      .then((range) => {
        if (!cancelled) setIndex(createMcapTimelineIndex(range));
      })
      .catch(noop);
    return () => {
      cancelled = true;
    };
    // client is a stable singleton — re-running on its identity would
    // discard the loaded timeline range for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const getActiveTopics = useCallback(
    (): string[] =>
      allTopics.filter((t) => topicCachesRef.current.get(t)?.isActive),
    // allTopics is mount-time config — filtered against caches at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Core batch-fetch helper. Fetches ticks for the active topic set, fills
  // per-topic caches, and (since the engine doesn't tick when paused) also
  // pushes any fetched frame at the current playhead to atoms so paused
  // tiles render their first frame as soon as the network resolves.
  const fetchBatch = useCallback(
    (ticks: bigint[], activeTopics: string[]) => {
      if (ticks.length === 0 || activeTopics.length === 0 || !source) return;
      const pending = pendingTicksRef.current;
      const caches = topicCachesRef.current;

      const toFetch = ticks.filter((t) => !pending.has(t.toString()));
      if (toFetch.length === 0) return;

      const keys = toFetch.map((t) => t.toString());
      for (const key of keys) pending.add(key);

      client
        .readSynchronizedMessageBatch({
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          source,
          streamPolicies,
          timeNs: toFetch,
          topics: activeTopics,
        })
        .then((windows) => {
          for (const window of windows) {
            distributeWindowToCaches(window, caches, activeTopics);
          }
          const currentIndex = indexRef.current;
          if (!currentIndex) return;
          const tick = currentIndex.nearestTick(store.get(playheadAtom));
          if (tick) {
            pushTickToStore(
              activeTopics,
              tick,
              caches,
              lastFrameRef.current,
              store
            );
          }
        })
        .catch(noop)
        .finally(() => {
          for (const key of keys) pending.delete(key);
        });
    },
    // streamPolicies is mount-time config — read fresh on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, source, store]
  );

  // Collect uncached, non-pending ticks in [startSec, endSec] for the active
  // topic set, capped at MAX_PREFETCH_BATCH. Reads from refs so this works
  // before/after the engine stream registers.
  const collectMissingTicks = useCallback(
    (startSec: number, endSec: number): bigint[] => {
      const currentIndex = indexRef.current;
      if (!currentIndex) return [];
      const activeTopics = getActiveTopics();
      if (activeTopics.length === 0) return [];
      const caches = topicCachesRef.current;
      const pending = pendingTicksRef.current;
      const startNs = currentIndex.secToNs(startSec);
      const endNs = currentIndex.secToNs(endSec);
      const toFetch: bigint[] = [];
      for (const tick of currentIndex.ticks) {
        if (tick < startNs) continue;
        if (tick > endNs) break;
        const allCached = activeTopics.every((t) => caches.get(t)?.has(tick));
        if (!allCached && !pending.has(tick.toString())) toFetch.push(tick);
        if (toFetch.length >= MAX_PREFETCH_BATCH) break;
      }
      return toFetch;
    },
    [getActiveTopics]
  );

  // Push cached current frame for the active set AND kick off a batch
  // prefetch of [timeSec, timeSec+LOOKAHEAD] so the buffer starts filling
  // immediately (mount, tile subscribe, seek, every playhead tick).
  const prefetchLookaheadFrom = useCallback(
    (timeSec: number) => {
      const currentIndex = indexRef.current;
      if (!currentIndex) return;
      const activeTopics = getActiveTopics();
      if (activeTopics.length === 0) return;

      const tick = currentIndex.nearestTick(timeSec);
      if (tick) {
        pushTickToStore(
          activeTopics,
          tick,
          topicCachesRef.current,
          lastFrameRef.current,
          store
        );
      }

      const missing = collectMissingTicks(timeSec, timeSec + LOOKAHEAD_SECONDS);
      if (missing.length > 0) fetchBatch(missing, activeTopics);
    },
    [collectMissingTicks, fetchBatch, getActiveTopics, store]
  );

  // Register the single engine stream and the proactive lookahead subscription.
  useEffect(() => {
    if (!index || !source) return;

    const nativeStep = 1 / DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ;
    const caches = topicCachesRef.current;
    const pending = pendingTicksRef.current;
    const lastFrame = lastFrameRef.current;

    const stream: PlaybackStream = {
      id: STREAM_ID,
      blocking: true,
      duration: index.durationSec,
      nativeStepSeconds: nativeStep,
      lookaheadSeconds: LOOKAHEAD_SECONDS,

      bufferState: (timeSec) => {
        const tick = index.nearestTick(timeSec);
        if (!tick) return "missing";
        const activeTopics = getActiveTopics();
        if (activeTopics.length === 0) return "ready";
        if (activeTopics.every((t) => caches.get(t)?.has(tick))) return "ready";
        if (pending.has(tick.toString())) return "loading";
        return "missing";
      },

      prefetch: ([startSec, endSec]) => {
        const missing = collectMissingTicks(startSec, endSec);
        if (missing.length > 0) fetchBatch(missing, getActiveTopics());
      },

      onCommit: (timeSec, commitStore) => {
        const tick = index.nearestTick(timeSec);
        if (!tick) return;
        pushTickToStore(getActiveTopics(), tick, caches, lastFrame, commitStore);
      },
    };

    const unregister = registerStream(stream);
    // Keep the stream permanently active — subscriber count is managed
    // per-topic via McapTopicCache, not at the engine stream level.
    const unsubscribe = subscribeStream(STREAM_ID);

    // Proactive lookahead: fill the buffer ahead of the playhead on every
    // RAF tick so subsequent frames are ready before the engine needs them.
    const unsubPlayhead = store.sub(playheadAtom, () => {
      prefetchLookaheadFrom(store.get(playheadAtom));
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
    collectMissingTicks,
    getActiveTopics,
    prefetchLookaheadFrom,
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

  useEffect(() => {
    store.set(mcapDataStreamAtom, { subscribeToTopic });
    return () => {
      store.set(mcapDataStreamAtom, null);
    };
  }, [store, subscribeToTopic]);
}

// ---------------------------------------------------------------------------
// Module-level helpers (no React dependency)
// ---------------------------------------------------------------------------

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
    const toWrite = lastFrame.get(topic) ?? null;
    if (toWrite !== null) store.set(streamValueAtom(topic), toWrite);
  }
}
