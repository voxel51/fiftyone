import { describe, expect, it, vi } from "vitest";
import type { DecodedFrame, SynchronizedFrameWindow } from "../../../ir";
import {
  bufferedRangesEqual,
  decodeFailuresByStream,
  DEFAULT_PLAYBACK_POLICY,
  derivePlaybackPolicy,
  batchReadPriority,
  fillMissingLookaheadFrom,
  fillMissingStartupBufferFrom,
  nsToSeconds,
  staleAgeForMessage,
} from "./playback-buffering";

describe("episode playback buffering policy", () => {
  it("derives bounded startup and cache windows from the tick rate", () => {
    const policy = derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY, 10);

    expect(policy).toMatchObject({
      maxPrefetchBatch: 10,
      pausedWarmupRunwaySeconds: 1.5,
      startupLookaheadSeconds: 0.5,
      startupMaxPrefetchBatch: 5,
      streamCacheMaxEntries: 80,
    });
  });

  it("keeps background work idle and user-visible reads foregrounded", () => {
    expect(batchReadPriority("background-lookahead")).toBe("idle");
    expect(batchReadPriority("loopback-lookahead")).toBe("playback");
    expect(batchReadPriority("playback-prefetch")).toBe("playback");
    expect(batchReadPriority("startup-lookahead")).toBe("playback");
  });

  it("queues bounded background batches and stops when coverage is complete", () => {
    const collectMissingTicks = vi
      .fn<(start: number, end: number, max: number) => bigint[]>()
      .mockReturnValueOnce([1n, 2n])
      .mockReturnValueOnce([]);
    const fetchBatch = vi.fn(() => true);
    const policy = {
      ...derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY, 10),
      prefetchBatchesPerPass: 2,
    };

    expect(
      fillMissingLookaheadFrom({
        activeStreams: ["camera"],
        collectMissingTicks,
        fetchBatch,
        lookaheadSeconds: 4,
        policy,
        timeSec: 12,
      }),
    ).toBe(true);
    expect(collectMissingTicks).toHaveBeenNthCalledWith(
      1,
      12,
      16,
      policy.maxPrefetchBatch,
    );
    expect(fetchBatch).toHaveBeenCalledWith(
      [1n, 2n],
      ["camera"],
      "background-lookahead",
    );
  });

  it("uses the smaller startup window for first-play readiness", () => {
    const collectMissingTicks = vi.fn(() => [3n]);
    const fetchBatch = vi.fn(() => true);
    const policy = derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY, 10);

    expect(
      fillMissingStartupBufferFrom({
        activeStreams: ["lidar"],
        collectMissingTicks,
        fetchBatch,
        policy,
        timeSec: 2,
      }),
    ).toBe(true);
    expect(collectMissingTicks).toHaveBeenCalledWith(
      2,
      2.5,
      policy.startupMaxPrefetchBatch,
    );
    expect(fetchBatch).toHaveBeenCalledWith(
      [3n],
      ["lidar"],
      "startup-lookahead",
    );
  });
});

describe("episode playback buffering values", () => {
  it("groups unique decode diagnostics and preserves their failed ticks", () => {
    const windows = [
      {
        diagnosticsByStream: {
          camera: [{ message: "bad frame" }, { message: "bad frame" }],
        },
        framesByStream: {},
        timeNs: 10n,
      },
      {
        diagnosticsByStream: { camera: [{ message: "missing keyframe" }] },
        framesByStream: {},
        timeNs: 20n,
      },
    ] as unknown as SynchronizedFrameWindow[];

    expect(decodeFailuresByStream(windows).get("camera")).toEqual({
      messages: ["bad frame", "missing keyframe"],
      ticks: [10n, 20n],
    });
  });

  it("normalizes time, stale ages, and buffered-range comparisons", () => {
    const message = { timestampNs: 2_000_000_000n } as DecodedFrame;

    expect(nsToSeconds(2_500_000_000n)).toBe(2.5);
    expect(nsToSeconds(-1n)).toBe(0);
    expect(staleAgeForMessage(5_000_000_000n, message, 1_000_000_000n)).toBe(
      3_000_000_000n,
    );
    expect(staleAgeForMessage(2_500_000_000n, message, 1_000_000_000n)).toBe(
      null,
    );
    expect(bufferedRangesEqual([[0, 1]], [[0, 1]])).toBe(true);
    expect(bufferedRangesEqual([[0, 1]], [[0, 2]])).toBe(false);
  });
});
