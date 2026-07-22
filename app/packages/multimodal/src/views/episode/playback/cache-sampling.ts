import { useCallback, useSyncExternalStore } from "react";

import type { DecodedFrame } from "../../../ir";
import type { EpisodeStreamCache, TimelineIndex } from "../../../runtime";
import type { EpisodeDataStream } from "./episode-data-stream-context";

// Forward-scan budget for locating the next distinct cached message. At the
// timeline's ~30 Hz tick rate, 120 ticks spans about four seconds.
const MAX_NEXT_MESSAGE_SCAN_TICKS = 120;

/** Cached result of a bounded search for the next distinct source message. */
export interface NextMessageCacheEntry {
  readonly currentIndex: number;
  readonly currentMessage: DecodedFrame;
  readonly nextIndex: number | null;
  readonly nextMessage: DecodedFrame | null;
  readonly revision: number;
  readonly timeline: TimelineIndex;
}

/** Fraction of a playhead interval between two source messages. */
export function interpolationFraction({
  nextTimelineTimeNs,
  playheadNs,
  previousTimelineTimeNs,
}: {
  readonly nextTimelineTimeNs: bigint;
  readonly playheadNs: bigint;
  readonly previousTimelineTimeNs: bigint;
}): number | null {
  const span = nextTimelineTimeNs - previousTimelineTimeNs;
  if (span <= 0n) return null;
  const elapsed = playheadNs - previousTimelineTimeNs;
  if (elapsed <= 0n) return null;
  const fraction = Number(elapsed) / Number(span);
  if (!Number.isFinite(fraction)) return null;
  return Math.min(1, fraction);
}

/** Cache-revision digest that updates when any watched stream cache changes. */
export function useStreamCacheSnapshot(
  dataStream: EpisodeDataStream | null,
  streams: readonly string[],
): string {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!dataStream || streams.length === 0) return () => undefined;
      const unsubscribeFns: (() => void)[] = [];
      for (const stream of streams) {
        const cache = dataStream.getStreamCache(stream);
        if (cache) {
          unsubscribeFns.push(cache.subscribeToChanges(onStoreChange));
        }
      }
      return () => {
        for (const unsubscribe of unsubscribeFns) unsubscribe();
      };
    },
    [dataStream, streams],
  );

  const getSnapshot = useCallback(
    () => streamCacheSnapshot(dataStream, streams),
    [dataStream, streams],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function streamCacheSnapshot(
  dataStream: EpisodeDataStream | null,
  streams: readonly string[],
): string {
  if (!dataStream || streams.length === 0) return "";
  let snapshot = "";
  for (const stream of streams) {
    const revision = dataStream.getStreamCache(stream)?.revision ?? -1;
    snapshot += `${stream}:${revision}|`;
  }
  return snapshot;
}

/** Finds the next cached source message with a distinct source timestamp. */
export function nextDistinctCachedMessage({
  cache,
  currentTick,
  currentTimelineTimeNs,
  currentMessage,
  lookupCache,
  timeline,
}: {
  readonly cache: EpisodeStreamCache;
  readonly currentTick: bigint;
  readonly currentTimelineTimeNs: bigint;
  readonly currentMessage?: DecodedFrame;
  readonly lookupCache?: WeakMap<EpisodeStreamCache, NextMessageCacheEntry>;
  readonly timeline: TimelineIndex;
}): DecodedFrame | null {
  const currentIndex = timeline.indexOfTick(currentTick);
  if (currentIndex === undefined) return null;
  const cached = lookupCache?.get(cache);
  if (
    currentMessage &&
    cached?.timeline === timeline &&
    cached.revision === cache.revision &&
    cached.currentMessage === currentMessage
  ) {
    if (
      cached.nextMessage &&
      cached.nextIndex !== null &&
      currentIndex >= cached.currentIndex &&
      currentIndex < cached.nextIndex
    ) {
      return cached.nextMessage;
    }
    if (!cached.nextMessage && currentIndex === cached.currentIndex) {
      return null;
    }
  }

  const startIndex = currentIndex + 1;
  const endIndex = Math.min(
    timeline.tickCount,
    startIndex + MAX_NEXT_MESSAGE_SCAN_TICKS,
  );
  for (let index = startIndex; index < endIndex; index++) {
    const tick = timeline.tickAt(index);
    if (tick === undefined) break;
    const message = cache.get(tick);
    if (message && message.timestampNs !== currentTimelineTimeNs) {
      if (lookupCache && currentMessage) {
        lookupCache.set(cache, {
          currentIndex,
          currentMessage,
          nextIndex: index,
          nextMessage: message,
          revision: cache.revision,
          timeline,
        });
      }
      return message;
    }
  }

  if (lookupCache && currentMessage) {
    lookupCache.set(cache, {
      currentIndex,
      currentMessage,
      nextIndex: null,
      nextMessage: null,
      revision: cache.revision,
      timeline,
    });
  }
  return null;
}
