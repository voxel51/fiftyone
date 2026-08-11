import type { PlaybackStore } from "@fiftyone/playback";
import {
  loopEndAtom,
  loopStartAtom,
  playheadAtom,
} from "@fiftyone/playback/runtime";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import type { DecodedFrame } from "../../../ir";
import {
  createTimelineIndex,
  EpisodeStreamCache,
  type EpisodeStreamCacheTickRange,
  type TimelineIndex,
} from "../../../runtime";
import {
  decodedCacheBudgetBytes,
  nextDecodedCacheLookaheadSeconds,
  rebalanceDecodedCaches,
} from "./decoded-cache-policy";

const MIB = 1024 ** 2;
const SECOND_NS = 1_000_000_000n;

describe("episode decoded cache policy", () => {
  it("scales the byte budget with device memory within safe bounds", () => {
    expect(decodedCacheBudgetBytes(null)).toBe(256 * MIB);
    expect(decodedCacheBudgetBytes(2)).toBe(128 * MIB);
    expect(decodedCacheBudgetBytes(8)).toBe(256 * MIB);
    expect(decodedCacheBudgetBytes(64)).toBe(512 * MIB);
  });

  it("shrinks speculative lookahead for byte or placement pressure without crossing the startup runway", () => {
    expect(
      nextDecodedCacheLookaheadSeconds({
        budgetBytes: 256 * MIB,
        currentSeconds: 4,
        decodedBytes: 512 * MIB,
        maxSeconds: 4,
        minSeconds: 0.5,
        stepSeconds: 1,
      }),
    ).toBe(2);

    expect(
      nextDecodedCacheLookaheadSeconds({
        budgetBytes: 256 * MIB,
        currentSeconds: 4,
        decodedBytes: 1,
        maxEntries: 100,
        maxSeconds: 4,
        minSeconds: 0.5,
        retainedEntries: 400,
        stepSeconds: 1,
      }),
    ).toBe(1);

    expect(
      nextDecodedCacheLookaheadSeconds({
        budgetBytes: 1,
        currentSeconds: 4,
        decodedBytes: 4,
        maxSeconds: 4,
        minSeconds: 1,
        stepSeconds: 0,
      }),
    ).toBe(1);
  });

  it("recovers from a constrained horizon using forward bytes rather than retained history", () => {
    const options = {
      budgetBytes: 256 * MIB,
      currentSeconds: 2,
      maxSeconds: 4,
      minSeconds: 0.5,
      stepSeconds: 1,
    } as const;

    expect(
      nextDecodedCacheLookaheadSeconds({
        ...options,
        decodedBytes: 200 * MIB,
      }),
    ).toBe(2);
    expect(
      nextDecodedCacheLookaheadSeconds({
        ...options,
        decodedBytes: 128 * MIB,
      }),
    ).toBe(3);

    const index = timeline(30, 1);
    const cache = cacheWithSeconds(range(0, 14));
    const forwardBytes = rangeStats([cache], [tickRange(10, 12)], index);
    const recovered = rebalance({
      budgetBytes: cache.stats().accountedBytes + forwardBytes,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 2,
      index,
      maxLookaheadSeconds: 4,
      store: playbackStore(10),
    });
    expect(recovered).toBe(3);
    expectTick(cache, 0, true);
  });

  it("lets ordinary contiguous lookback grow well beyond the former eight-second LRU window", () => {
    const index = timeline(30, 1);
    const cache = cacheWithSeconds(range(0, 30));
    const store = playbackStore(20);

    const lookahead = rebalance({
      budgetBytes: 10 * MIB,
      caches: new Map([["/camera", cache]]),
      index,
      store,
    });

    expect(lookahead).toBe(4);
    expect(cache.has(0n)).toBe(true);
    expect(cache.has(10n * SECOND_NS)).toBe(true);
    expect(cache.has(24n * SECOND_NS)).toBe(true);
  });

  it("evicts far seek islands first, then advances the oldest shared history boundary", () => {
    const index = timeline(100, 1);
    const cache = cacheWithSeconds([...range(0, 2), ...range(40, 54)]);
    const caches = new Map([["/camera", cache]]);
    const store = playbackStore(50);
    const budgetBytes = rangeStats([cache], [tickRange(48, 54)], index);

    const lookahead = rebalance({
      budgetBytes,
      caches,
      index,
      store,
    });

    expect(lookahead).toBe(4);
    for (const second of range(0, 2)) expectTick(cache, second, false);
    for (const second of range(40, 47)) expectTick(cache, second, false);
    for (const second of range(48, 54)) expectTick(cache, second, true);
  });

  it("preserves desired forward runway ahead of history and shrinks it only when it alone exceeds budget", () => {
    const index = timeline(100, 1);
    const cache = cacheWithSeconds(range(40, 54));
    const caches = new Map([["/camera", cache]]);
    const store = playbackStore(50);
    const fullForwardBudget = rangeStats([cache], [tickRange(50, 54)], index);

    expect(
      rebalance({ budgetBytes: fullForwardBudget, caches, index, store }),
    ).toBe(4);
    for (const second of range(50, 54)) expectTick(cache, second, true);
    expectTick(cache, 49, false);

    const smaller = cacheWithSeconds(range(50, 54));
    const smallerCaches = new Map([["/camera", smaller]]);
    const twoSecondBudget = rangeStats([smaller], [tickRange(50, 52)], index);
    const constrained = rebalance({
      budgetBytes: twoSecondBudget,
      caches: smallerCaches,
      index,
      store,
    });

    expect(constrained).toBe(2);
    for (const second of range(50, 52)) expectTick(smaller, second, true);
    expectTick(smaller, 53, false);
    expectTick(smaller, 54, false);
  });

  it("still terminates pressure shrinking when the configured step is non-positive", () => {
    const index = timeline(100, 1);
    const cache = cacheWithSeconds(range(50, 54));

    const lookahead = rebalance({
      budgetBytes: rangeStats([cache], [tickRange(50, 51)], index),
      caches: new Map([["/camera", cache]]),
      index,
      maxLookaheadSeconds: 1,
      stepSeconds: 0,
      store: playbackStore(50),
    });

    expect(lookahead).toBe(1);
    expectTick(cache, 50, true);
    expectTick(cache, 51, true);
    expectTick(cache, 52, false);
  });

  it("coordinates pressure eviction across blocking streams by one time boundary", () => {
    const index = timeline(30, 1);
    const camera = cacheWithSeconds(range(0, 14), "/camera");
    const lidar = cacheWithSeconds(range(2, 14), "/lidar");
    const caches = new Map([
      ["/camera", camera],
      ["/lidar", lidar],
    ]);
    const store = playbackStore(10);
    const budgetBytes = rangeStats([camera, lidar], [tickRange(6, 14)], index);

    rebalance({
      activeStreams: ["/camera", "/lidar"],
      blockingStreams: ["/camera", "/lidar"],
      budgetBytes,
      caches,
      index,
      store,
    });

    for (const second of range(0, 5)) {
      expectTick(camera, second, false);
      expectTick(lidar, second, false);
    }
    for (const second of range(6, 14)) {
      expectTick(camera, second, true);
      expectTick(lidar, second, true);
    }
    expect(camera.cachedTickIndexRanges(index)).toEqual(
      lidar.cachedTickIndexRanges(index),
    );
  });

  it("deduplicates one decoded frame shared by multiple active caches", () => {
    const index = timeline(30, 1);
    const sharedHistory = sizedFrame(0n, "/camera");
    const camera = cacheWithSeconds(range(5, 9), "/camera");
    const lidar = cacheWithSeconds(range(5, 9), "/lidar");
    camera.set(0n, sharedHistory);
    lidar.set(0n, sharedHistory);
    const caches = new Map([
      ["/camera", camera],
      ["/lidar", lidar],
    ]);
    const retainedRanges = [tickRange(0, 0), tickRange(5, 9)];

    rebalance({
      activeStreams: ["/camera", "/lidar"],
      blockingStreams: ["/camera", "/lidar"],
      budgetBytes: rangeStats([camera, lidar], retainedRanges, index),
      caches,
      index,
      store: playbackStore(5),
    });

    expectTick(camera, 0, true);
    expectTick(lidar, 0, true);
  });

  it("ignores missing active-stream names without disturbing retained caches", () => {
    const index = timeline(30, 1);
    const cache = cacheWithSeconds(range(0, 14));

    const lookahead = rebalance({
      activeStreams: ["/missing"],
      budgetBytes: 1,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 3,
      index,
      store: playbackStore(10),
    });

    expect(lookahead).toBe(3);
    for (const second of range(0, 14)) expectTick(cache, second, true);
  });

  it("falls back to all active streams when no blocking-stream name matches", () => {
    const index = timeline(30, 1);
    const camera = cacheWithSeconds(range(0, 14), "/camera");
    const lidar = cacheWithSeconds(range(2, 14), "/lidar");
    const caches = new Map([
      ["/camera", camera],
      ["/lidar", lidar],
    ]);

    rebalance({
      activeStreams: ["/camera", "/lidar"],
      blockingStreams: ["/missing"],
      budgetBytes: rangeStats([camera, lidar], [tickRange(6, 14)], index),
      caches,
      index,
      store: playbackStore(10),
    });

    for (const second of range(0, 5)) {
      expectTick(camera, second, false);
      expectTick(lidar, second, false);
    }
    expect(camera.cachedTickIndexRanges(index)).toEqual(
      lidar.cachedTickIndexRanges(index),
    );
  });

  it("enforces the global placement ceiling for canonicalized repeated and metadata-only placements", () => {
    const index = timeline(30, 1);
    const cache = new EpisodeStreamCache();
    const repeated = sizedFrame(0n, "/camera", "canonical");
    for (const second of range(0, 20)) {
      cache.set(BigInt(second) * SECOND_NS, { ...repeated });
    }
    expect(cache.stats().decodedBytes).toBe(1_024);
    expect(cache.stats().entryCount).toBe(21);

    const lookahead = rebalance({
      budgetBytes: 10 * MIB,
      caches: new Map([["/camera", cache]]),
      index,
      placementCeiling: 8,
      store: playbackStore(20),
    });

    expect(lookahead).toBe(4);
    expect(cache.stats().entryCount).toBeLessThanOrEqual(8);
    expectTick(cache, 20, true);

    const nullCache = new EpisodeStreamCache();
    for (const second of range(0, 20)) {
      nullCache.set(BigInt(second) * SECOND_NS, null);
    }
    rebalance({
      budgetBytes: 10 * MIB,
      caches: new Map([["/null", nullCache]]),
      index,
      placementCeiling: 8,
      store: playbackStore(20),
    });
    expect(nullCache.stats().entryCount).toBeLessThanOrEqual(8);
    expectTick(nullCache, 20, true);
  });

  it("keeps A/B seek neighborhoods while they fit and drops the far island under pressure", () => {
    const index = timeline(100, 1);
    const cache = cacheWithSeconds([...range(10, 12), ...range(50, 54)]);
    const caches = new Map([["/camera", cache]]);
    const store = playbackStore(50);

    rebalance({ budgetBytes: 10 * MIB, caches, index, store });
    for (const second of range(10, 12)) expectTick(cache, second, true);

    const forwardBudget = rangeStats([cache], [tickRange(50, 54)], index);
    rebalance({ budgetBytes: forwardBudget, caches, index, store });
    for (const second of range(10, 12)) expectTick(cache, second, false);
    for (const second of range(50, 54)) expectTick(cache, second, true);
  });

  it("allows an active loop to become fully warm without punching a cold seam each lap", () => {
    const index = timeline(30, 1);
    const cache = cacheWithSeconds(range(10, 20));
    const caches = new Map([["/camera", cache]]);
    const store = playbackStore(12, 10, 20);

    rebalance({ budgetBytes: 10 * MIB, caches, index, store });
    store.set(playheadAtom, 19);
    rebalance({ budgetBytes: 10 * MIB, caches, index, store });

    for (const second of range(10, 20)) expectTick(cache, second, true);
    expect(cache.cachedTickIndexRanges(index)).toEqual([
      { endIndex: 20, startIndex: 10 },
    ]);
  });

  it("evicts the oldest cyclic history while preserving the selected ranges", () => {
    const index = timeline(30, 1);

    const cyclicHistory = cacheWithSeconds(range(10, 20));
    const cyclicBudget = rangeStats(
      [cyclicHistory],
      [tickRange(10, 16), tickRange(19, 20)],
      index,
    );
    rebalance({
      budgetBytes: cyclicBudget,
      caches: new Map([["/camera", cyclicHistory]]),
      index,
      store: playbackStore(12, 10, 20),
    });
    expectTick(cyclicHistory, 17, false);
    expectTick(cyclicHistory, 18, false);
    for (const second of [...range(19, 20), ...range(10, 16)]) {
      expectTick(cyclicHistory, second, true);
    }
  });

  it("prunes loop history down to the forward-only range", () => {
    const index = timeline(30, 1);

    const forwardOnly = cacheWithSeconds(range(10, 20));
    rebalance({
      budgetBytes: rangeStats([forwardOnly], [tickRange(12, 16)], index),
      caches: new Map([["/camera", forwardOnly]]),
      index,
      store: playbackStore(12, 10, 20),
    });
    expectTick(forwardOnly, 20, false);
    for (const second of range(12, 16)) expectTick(forwardOnly, second, true);
  });

  it("protects the current tick and minimum forward runway even when they exceed the heuristic budget", () => {
    const index = timeline(100, 1);
    const cache = cacheWithSeconds(range(50, 54));
    const lookahead = rebalance({
      budgetBytes: 1,
      caches: new Map([["/camera", cache]]),
      index,
      minLookaheadSeconds: 1,
      store: playbackStore(50),
    });

    expect(lookahead).toBe(1);
    expectTick(cache, 50, true);
    expectTick(cache, 51, true);
    expectTick(cache, 52, false);
  });
});

function rebalance({
  activeStreams,
  blockingStreams,
  budgetBytes,
  caches,
  currentLookaheadSeconds = 4,
  index,
  maxLookaheadSeconds = 4,
  minLookaheadSeconds = 1,
  placementCeiling = 100_000,
  stepSeconds = 1,
  store,
}: {
  readonly activeStreams?: readonly string[];
  readonly blockingStreams?: readonly string[];
  readonly budgetBytes: number;
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly currentLookaheadSeconds?: number;
  readonly index: TimelineIndex;
  readonly maxLookaheadSeconds?: number;
  readonly minLookaheadSeconds?: number;
  readonly placementCeiling?: number;
  readonly stepSeconds?: number;
  readonly store: PlaybackStore;
}): number {
  return rebalanceDecodedCaches({
    activeStreams,
    blockingStreams,
    budgetBytes,
    caches,
    currentLookaheadSeconds,
    index,
    maxLookaheadSeconds,
    minLookaheadSeconds,
    placementCeiling,
    stepSeconds,
    store,
  });
}

function timeline(durationSeconds: number, tickRateHz: number): TimelineIndex {
  return createTimelineIndex(
    { endNs: BigInt(durationSeconds) * SECOND_NS, startNs: 0n },
    tickRateHz,
  );
}

function playbackStore(
  playhead: number,
  loopStart = 0,
  loopEnd = 0,
): PlaybackStore {
  const store = createStore();
  store.set(playheadAtom, playhead);
  store.set(loopStartAtom, loopStart);
  store.set(loopEndAtom, loopEnd);
  return store;
}

function cacheWithSeconds(
  seconds: readonly number[],
  stream = "/camera",
): EpisodeStreamCache {
  const cache = new EpisodeStreamCache();
  for (const second of seconds) {
    const tick = BigInt(second) * SECOND_NS;
    cache.set(tick, sizedFrame(tick, stream));
  }
  return cache;
}

function sizedFrame(
  timestampNs: bigint,
  streamId = "/camera",
  recordId?: string,
): DecodedFrame {
  return {
    output: { resourceHints: { sizeBytes: 1_024 } },
    recordId,
    streamId,
    timestampNs,
  };
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
}

function tickRange(
  startIndex: number,
  endIndex: number,
): EpisodeStreamCacheTickRange {
  return { endIndex, startIndex };
}

function rangeStats(
  caches: readonly EpisodeStreamCache[],
  ranges: readonly EpisodeStreamCacheTickRange[],
  index: TimelineIndex,
): number {
  const seen = new Set<DecodedFrame>();
  return caches.reduce(
    (bytes, cache) =>
      bytes +
      cache.memoryStatsForTickIndexRanges(ranges, index, seen).accountedBytes,
    0,
  );
}

function expectTick(
  cache: EpisodeStreamCache,
  second: number,
  present: boolean,
): void {
  expect(cache.has(BigInt(second) * SECOND_NS)).toBe(present);
}
