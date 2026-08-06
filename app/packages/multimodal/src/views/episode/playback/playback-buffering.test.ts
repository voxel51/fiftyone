import { describe, expect, it, vi } from "vitest";
import type { DecodedFrame, SynchronizedFrameWindow } from "../../../ir";
import { createTimelineIndex, EpisodeStreamCache } from "../../../runtime";
import {
  bufferedRangesEqual,
  boundSpeculativeTicksByByteTimeline,
  decodeFailuresByStream,
  DEFAULT_PLAYBACK_POLICY,
  derivePlaybackPolicy,
  batchReadPriority,
  computeBufferedRanges,
  fillMissingLookaheadFrom,
  fillMissingStartupBufferFrom,
  playbackLookaheadSegments,
  staleAgeForMessage,
} from "./playback-buffering";

describe("episode playback buffering policy", () => {
  it("derives bounded startup and cache windows from the tick rate", () => {
    const policy = derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY, 10);

    expect(policy).toMatchObject({
      maxPrefetchBatch: 10,
      pausedWarmupMaxCompressedBytes: 128 * 1024 * 1024,
      pausedWarmupMaxChunks: 64,
      pausedWarmupRunwaySeconds: 1.5,
      startupLookaheadSeconds: 0.5,
      startupMaxCompressedBytes: 96 * 1024 * 1024,
      startupMaxChunks: 32,
      startupMaxPrefetchBatch: 5,
      streamCacheMaxEntries: 80,
    });
  });

  it("keeps startup media duration stable across sampling rates", () => {
    expect(
      derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY, 1).startupLookaheadSeconds,
    ).toBe(0.5);
    expect(
      derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY, 120)
        .startupLookaheadSeconds,
    ).toBe(0.5);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid direct tick-rate caller %s",
    (tickRateHz) => {
      expect(() =>
        derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY, tickRateHz),
      ).toThrow("Playback tick rate must be finite and greater than zero");
    },
  );

  it("keeps background work idle and user-visible reads foregrounded", () => {
    expect(batchReadPriority("background-lookahead")).toBe("idle");
    expect(batchReadPriority("loopback-lookahead")).toBe("playback");
    expect(batchReadPriority("playback-prefetch")).toBe("playback");
    expect(batchReadPriority("startup-lookahead")).toBe("playback");
  });

  it("bounds speculative ticks by chunk and byte budgets", () => {
    const byteTimeline = [
      {
        cumulativeCompressedBytes: 40,
        endTimeNs: 99n,
        startOffsetBytes: 1_000n,
      },
      {
        cumulativeCompressedBytes: 90,
        endTimeNs: 199n,
        startOffsetBytes: 1_040n,
      },
      {
        cumulativeCompressedBytes: 120,
        endTimeNs: 299n,
        startOffsetBytes: 1_090n,
      },
    ];

    expect(
      boundSpeculativeTicksByByteTimeline({
        anchorTimeNs: 0n,
        byteTimeline,
        maxBytes: 80,
        maxChunks: 3,
        ticks: [0n, 50n, 100n, 200n],
      }),
    ).toEqual([0n, 50n]);
    expect(
      boundSpeculativeTicksByByteTimeline({
        anchorTimeNs: 0n,
        byteTimeline,
        maxBytes: 1_000,
        maxChunks: 2,
        ticks: [0n, 100n, 200n],
      }),
    ).toEqual([0n, 100n]);
  });

  it("admits one boundary chunk even when it exceeds the byte budget", () => {
    expect(
      boundSpeculativeTicksByByteTimeline({
        anchorTimeNs: 0n,
        byteTimeline: [
          {
            cumulativeCompressedBytes: 100,
            endTimeNs: 99n,
            startOffsetBytes: 1_000n,
          },
        ],
        maxBytes: 10,
        maxChunks: 1,
        ticks: [0n, 50n],
      }),
    ).toEqual([0n, 50n]);
    expect(
      boundSpeculativeTicksByByteTimeline({
        anchorTimeNs: 0n,
        byteTimeline: null,
        maxBytes: 10,
        maxChunks: 1,
        ticks: [0n, 50n],
      }),
    ).toEqual([0n, 50n]);
  });

  it("anchors the same fixed budget across repeated passes", () => {
    const byteTimeline = [
      {
        cumulativeCompressedBytes: 10,
        endTimeNs: 99n,
        startOffsetBytes: 0n,
      },
      {
        cumulativeCompressedBytes: 20,
        endTimeNs: 199n,
        startOffsetBytes: 10n,
      },
      {
        cumulativeCompressedBytes: 30,
        endTimeNs: 299n,
        startOffsetBytes: 20n,
      },
    ];
    const input = {
      anchorTimeNs: 100n,
      byteTimeline,
      maxBytes: 1_000,
      maxChunks: 1,
    } as const;

    expect(
      boundSpeculativeTicksByByteTimeline({
        ...input,
        ticks: [50n, 100n, 150n, 200n],
      }),
    ).toEqual([100n, 150n]);
    expect(
      boundSpeculativeTicksByByteTimeline({
        ...input,
        ticks: [200n],
      }),
    ).toEqual([]);
  });

  it("returns no speculative work when the anchor is beyond the index", () => {
    expect(
      boundSpeculativeTicksByByteTimeline({
        anchorTimeNs: 300n,
        byteTimeline: [
          {
            cumulativeCompressedBytes: 10,
            endTimeNs: 299n,
            startOffsetBytes: 0n,
          },
        ],
        maxBytes: 1_000,
        maxChunks: 1,
        ticks: [300n],
      }),
    ).toEqual([]);
  });

  it("fails tick admission closed for invalid speculative budgets", () => {
    const byteTimeline = [
      {
        cumulativeCompressedBytes: 10,
        endTimeNs: 99n,
        startOffsetBytes: 0n,
      },
    ];

    for (const [maxBytes, maxChunks] of [
      [0, 1],
      [1, 0],
      [Number.POSITIVE_INFINITY, 1],
      [1, 1.5],
    ]) {
      expect(
        boundSpeculativeTicksByByteTimeline({
          anchorTimeNs: 0n,
          byteTimeline,
          maxBytes,
          maxChunks,
          ticks: [0n],
        }),
      ).toEqual([]);
    }
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

  it("can put rolling lookahead on the playback lane", () => {
    const fetchBatch = vi.fn(() => true);

    expect(
      fillMissingLookaheadFrom({
        activeStreams: ["camera"],
        collectMissingTicks: () => [1n],
        fetchBatch,
        lookaheadSeconds: 1,
        operation: "playback-prefetch",
        policy: derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY, 10),
        timeSec: 0,
      }),
    ).toBe(true);
    expect(fetchBatch).toHaveBeenCalledWith(
      [1n],
      ["camera"],
      "playback-prefetch",
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

  it("spends only the remainder of lookahead across a non-zero loop seam", () => {
    expect(
      playbackLookaheadSegments({
        durationSec: 20,
        lookaheadSeconds: 4,
        loopEndSec: 10,
        loopStartSec: 2,
        timeSec: 8,
      }),
    ).toEqual([
      { endSec: 10, kind: "current", startSec: 8 },
      { endSec: 4, kind: "loop-continuation", startSec: 2 },
    ]);
  });

  it("does not reserve loop continuation before lookahead crosses the seam", () => {
    expect(
      playbackLookaheadSegments({
        durationSec: 20,
        lookaheadSeconds: 4,
        loopEndSec: 10,
        loopStartSec: 2,
        timeSec: 5,
      }),
    ).toEqual([{ endSec: 9, kind: "current", startSec: 5 }]);
  });

  it("bounds a short loop to one loop of decoded coverage", () => {
    expect(
      playbackLookaheadSegments({
        durationSec: 20,
        lookaheadSeconds: 4,
        loopEndSec: 3,
        loopStartSec: 2,
        timeSec: 2.75,
      }),
    ).toEqual([
      { endSec: 3, kind: "current", startSec: 2.75 },
      { endSec: 2.75, kind: "loop-continuation", startSec: 2 },
    ]);
  });

  it("puts the entire forward runway at loop start when positioned on the seam", () => {
    expect(
      playbackLookaheadSegments({
        durationSec: 20,
        lookaheadSeconds: 4,
        loopEndSec: 10,
        loopStartSec: 2,
        timeSec: 10,
      }),
    ).toEqual([{ endSec: 6, kind: "loop-continuation", startSec: 2 }]);
  });

  it("falls back to ordinary lookahead when a seek is outside the loop", () => {
    expect(
      playbackLookaheadSegments({
        durationSec: 20,
        lookaheadSeconds: 4,
        loopEndSec: 10,
        loopStartSec: 2,
        timeSec: 12,
      }),
    ).toEqual([{ endSec: 16, kind: "current", startSec: 12 }]);
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

    expect(staleAgeForMessage(5_000_000_000n, message, 1_000_000_000n)).toBe(
      3_000_000_000n,
    );
    expect(staleAgeForMessage(2_500_000_000n, message, 1_000_000_000n)).toBe(
      null,
    );
    expect(bufferedRangesEqual([[0, 1]], [[0, 1]])).toBe(true);
    expect(bufferedRangesEqual([[0, 1]], [[0, 2]])).toBe(false);
  });

  it("derives only contiguous ranges covered by every active stream", () => {
    const index = createTimelineIndex({
      endNs: 100_000_000n,
      startNs: 0n,
    });
    const camera = new EpisodeStreamCache();
    const lidar = new EpisodeStreamCache();
    const first = index.tickAt(0) ?? 0n;
    const second = index.tickAt(1) ?? 0n;
    const fourth = index.tickAt(3) ?? 0n;
    for (const cache of [camera, lidar]) {
      cache.set(first, null);
      cache.set(second, null);
      cache.set(fourth, null);
    }

    const ranges = computeBufferedRanges({
      activeStreams: ["camera", "lidar"],
      caches: new Map([
        ["camera", camera],
        ["lidar", lidar],
      ]),
      index,
    });

    expect(ranges).toHaveLength(2);
    expect(ranges[0]?.[0]).toBe(0);
    expect(ranges[0]?.[1]).toBeCloseTo(2 / 30, 6);
    expect(ranges[1]).toEqual([index.nsToSec(fourth), 0.1]);
  });
});
