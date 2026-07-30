import type { PlaybackStore } from "@fiftyone/playback";
import {
  loopEndAtom,
  loopStartAtom,
  playheadAtom,
} from "@fiftyone/playback/runtime";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../visualization";
import { createTimelineIndex, EpisodeStreamCache } from "../../../runtime";
import {
  decodedCacheBudgetBytes,
  nextDecodedCacheLookaheadSeconds,
  rebalanceDecodedCaches,
} from "./decoded-cache-policy";

const MIB = 1024 ** 2;

describe("episode decoded cache policy", () => {
  it("scales the byte budget with device memory within safe bounds", () => {
    expect(decodedCacheBudgetBytes(null)).toBe(256 * MIB);
    expect(decodedCacheBudgetBytes(2)).toBe(128 * MIB);
    expect(decodedCacheBudgetBytes(8)).toBe(256 * MIB);
    expect(decodedCacheBudgetBytes(64)).toBe(512 * MIB);
  });

  it("shrinks speculative lookahead without crossing the startup runway", () => {
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
        currentSeconds: 1,
        decodedBytes: 1024 * MIB,
        maxSeconds: 4,
        minSeconds: 0.5,
        stepSeconds: 1,
      }),
    ).toBe(0.5);
  });

  it("recovers one batch at a time only below the hysteresis threshold", () => {
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
  });

  it("prunes speculative frames outside the resized protected runway", () => {
    const cache = new EpisodeStreamCache();
    const frame = {
      output: {
        visualization: {
          bytes: new Uint8Array(1_024),
          kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        },
      },
      streamId: "/camera",
      timestampNs: 0n,
    };
    cache.set(0n, frame);
    cache.set(10_000_000_000n, {
      ...frame,
      timestampNs: 10_000_000_000n,
    });

    const lookahead = rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 1,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 4,
      index: createTimelineIndex({ endNs: 10_000_000_000n, startNs: 0n }, 1),
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store: createStore() as PlaybackStore,
    });

    expect(lookahead).toBe(0.5);
    expect(cache.has(0n)).toBe(true);
    expect(cache.has(10_000_000_000n)).toBe(false);
  });

  it("keeps one circular lookahead budget across the active loop seam", () => {
    const cache = new EpisodeStreamCache();
    const frame = {
      output: {
        visualization: {
          bytes: new Uint8Array(1_024),
          kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        },
      },
      streamId: "/camera",
      timestampNs: 0n,
    };
    for (const second of [2, 3, 5, 7, 8, 9, 10]) {
      cache.set(BigInt(second) * 1_000_000_000n, {
        ...frame,
        timestampNs: BigInt(second) * 1_000_000_000n,
      });
    }
    const store = createStore() as PlaybackStore;
    store.set(loopStartAtom, 2);
    store.set(loopEndAtom, 10);
    store.set(playheadAtom, 8);

    const lookahead = rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 7_000,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 4,
      index: createTimelineIndex({ endNs: 20_000_000_000n, startNs: 0n }, 1),
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store,
    });

    // Seven 1 KiB frames against a 7,000-byte budget shrink the four-second
    // horizon to three seconds: two seconds on the current tail and exactly
    // one second after the non-zero loop start.
    expect(lookahead).toBe(3);
    expect(cache.has(2_000_000_000n)).toBe(true);
    expect(cache.has(3_000_000_000n)).toBe(true);
    expect(cache.has(5_000_000_000n)).toBe(false);
    expect(cache.has(7_000_000_000n)).toBe(true);
    expect(cache.has(8_000_000_000n)).toBe(true);
    expect(cache.has(9_000_000_000n)).toBe(true);
    expect(cache.has(10_000_000_000n)).toBe(true);
  });

  it("recomputes protected regions from current loop state", () => {
    const cache = new EpisodeStreamCache();
    const frame = {
      output: {
        visualization: {
          bytes: new Uint8Array(1_024),
          kind: VISUALIZATION_KIND.ENCODED_IMAGE,
        },
      },
      streamId: "/camera",
      timestampNs: 0n,
    };
    for (const second of [2, 4, 6, 7, 8]) {
      cache.set(BigInt(second) * 1_000_000_000n, {
        ...frame,
        timestampNs: BigInt(second) * 1_000_000_000n,
      });
    }
    const store = createStore() as PlaybackStore;
    store.set(loopStartAtom, 4);
    store.set(loopEndAtom, 8);
    store.set(playheadAtom, 7.75);

    rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 1,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 4,
      index: createTimelineIndex({ endNs: 10_000_000_000n, startNs: 0n }, 1),
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store,
    });

    expect(cache.has(2_000_000_000n)).toBe(false);
    expect(cache.has(4_000_000_000n)).toBe(true);
    expect(cache.has(6_000_000_000n)).toBe(false);
    expect(cache.has(7_000_000_000n)).toBe(false);
    expect(cache.has(8_000_000_000n)).toBe(true);
  });

  it("keeps one fetch batch behind a far seek and no more", () => {
    const cache = new EpisodeStreamCache();
    for (const tenth of [493, 494, 504, 509, 510]) {
      const tick = BigInt(tenth) * 100_000_000n;
      cache.set(tick, sizedFrame(tick));
    }
    const store = createStore() as PlaybackStore;
    store.set(playheadAtom, 50.4);

    rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 3_500,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 1,
      index: createTimelineIndex({ endNs: 100_000_000_000n, startNs: 0n }, 10),
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store,
    });

    expect(cache.has(49_300_000_000n)).toBe(false);
    expect(cache.has(49_400_000_000n)).toBe(true);
    expect(cache.has(50_400_000_000n)).toBe(true);
    expect(cache.has(50_900_000_000n)).toBe(true);
    expect(cache.has(51_000_000_000n)).toBe(false);
  });

  it("caps backward context at source and loop starts without wrapping it", () => {
    const sourceCache = new EpisodeStreamCache();
    for (const second of [0, 1, 2]) {
      const tick = BigInt(second) * 1_000_000_000n;
      sourceCache.set(tick, sizedFrame(tick));
    }
    const sourceStore = createStore() as PlaybackStore;
    sourceStore.set(playheadAtom, 0.25);

    rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 2_500,
      caches: new Map([["/camera", sourceCache]]),
      currentLookaheadSeconds: 1,
      index: createTimelineIndex({ endNs: 20_000_000_000n, startNs: 0n }, 1),
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store: sourceStore,
    });

    expect(sourceCache.has(0n)).toBe(true);
    expect(sourceCache.has(1_000_000_000n)).toBe(true);
    expect(sourceCache.has(2_000_000_000n)).toBe(false);

    const loopCache = new EpisodeStreamCache();
    for (const second of [9, 10, 11, 19]) {
      const tick = BigInt(second) * 1_000_000_000n;
      loopCache.set(tick, sizedFrame(tick));
    }
    const loopStore = createStore() as PlaybackStore;
    loopStore.set(loopStartAtom, 10);
    loopStore.set(loopEndAtom, 20);
    loopStore.set(playheadAtom, 10.25);

    rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 2_500,
      caches: new Map([["/camera", loopCache]]),
      currentLookaheadSeconds: 1,
      index: createTimelineIndex({ endNs: 30_000_000_000n, startNs: 0n }, 1),
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store: loopStore,
    });

    expect(loopCache.has(9_000_000_000n)).toBe(false);
    expect(loopCache.has(10_000_000_000n)).toBe(true);
    expect(loopCache.has(11_000_000_000n)).toBe(true);
    expect(loopCache.has(19_000_000_000n)).toBe(false);
  });

  it("evicts distant data before backward context, then backward before forward", () => {
    const makeCache = () => {
      const cache = new EpisodeStreamCache();
      for (const second of [0, 49, 50, 51]) {
        const tick = BigInt(second) * 1_000_000_000n;
        cache.set(tick, sizedFrame(tick));
      }
      return cache;
    };
    const store = createStore() as PlaybackStore;
    store.set(playheadAtom, 50);
    const index = createTimelineIndex(
      { endNs: 100_000_000_000n, startNs: 0n },
      1,
    );

    const moderatePressure = makeCache();
    rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 3_500,
      caches: new Map([["/camera", moderatePressure]]),
      currentLookaheadSeconds: 2,
      index,
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store,
    });
    expect(moderatePressure.has(0n)).toBe(false);
    expect(moderatePressure.has(49_000_000_000n)).toBe(true);
    expect(moderatePressure.has(50_000_000_000n)).toBe(true);
    expect(moderatePressure.has(51_000_000_000n)).toBe(true);

    const severePressure = makeCache();
    rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 2_500,
      caches: new Map([["/camera", severePressure]]),
      currentLookaheadSeconds: 2,
      index,
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store,
    });
    expect(severePressure.has(0n)).toBe(false);
    expect(severePressure.has(49_000_000_000n)).toBe(false);
    expect(severePressure.has(50_000_000_000n)).toBe(true);
    expect(severePressure.has(51_000_000_000n)).toBe(true);
  });

  it("retains an old seam neighborhood as ordinary LRU until a far seek needs capacity", () => {
    const cache = new EpisodeStreamCache();
    for (const second of [10, 18, 19, 20]) {
      const tick = BigInt(second) * 1_000_000_000n;
      cache.set(tick, sizedFrame(tick));
    }
    const store = createStore() as PlaybackStore;
    store.set(loopStartAtom, 10);
    store.set(loopEndAtom, 20);
    store.set(playheadAtom, 19);
    const index = createTimelineIndex(
      { endNs: 100_000_000_000n, startNs: 0n },
      1,
    );

    rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 10_000,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 4,
      index,
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store,
    });

    for (const second of [49, 50, 51]) {
      const tick = BigInt(second) * 1_000_000_000n;
      cache.set(tick, sizedFrame(tick));
    }
    store.set(playheadAtom, 50);

    // The seek immediately changes the derived preference, but old loop data
    // stays reusable while the decoded-memory budget can hold both regions.
    rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 10_000,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 4,
      index,
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store,
    });
    expect(cache.has(10_000_000_000n)).toBe(true);
    expect(cache.has(19_000_000_000n)).toBe(true);

    rebalanceDecodedCaches({
      backwardCushionSeconds: 1,
      budgetBytes: 3_500,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 4,
      index,
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      stepSeconds: 1,
      store,
    });
    expect(cache.has(10_000_000_000n)).toBe(false);
    expect(cache.has(19_000_000_000n)).toBe(false);
    expect(cache.has(49_000_000_000n)).toBe(true);
    expect(cache.has(50_000_000_000n)).toBe(true);
    expect(cache.has(51_000_000_000n)).toBe(true);
  });
});

function sizedFrame(timestampNs: bigint) {
  return {
    output: { resourceHints: { sizeBytes: 1_024 } },
    streamId: "/camera",
    timestampNs,
  };
}
