import type { PlaybackStore } from "@fiftyone/playback";
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
      budgetBytes: 1,
      caches: new Map([["/camera", cache]]),
      currentLookaheadSeconds: 4,
      index: createTimelineIndex({ endNs: 10_000_000_000n, startNs: 0n }, 1),
      maxLookaheadSeconds: 4,
      minLookaheadSeconds: 0.5,
      pruneSpeculative: true,
      stepSeconds: 1,
      store: createStore() as PlaybackStore,
    });

    expect(lookahead).toBe(0.5);
    expect(cache.has(0n)).toBe(true);
    expect(cache.has(10_000_000_000n)).toBe(false);
  });
});
