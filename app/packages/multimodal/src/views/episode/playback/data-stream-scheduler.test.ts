import type { PlaybackStore, PlaybackStream } from "@fiftyone/playback";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ByteTimelinePoint } from "../../../ir";
import { createTimelineIndex, EpisodeStreamCache } from "../../../runtime";
import {
  DataStreamScheduler,
  type DataStreamPrefetcher,
} from "./data-stream-prefetch";
import {
  DEFAULT_PLAYBACK_POLICY,
  derivePlaybackPolicy,
  type PlaybackPolicy,
} from "./playback-buffering";
import type { StartupCushionPlanner } from "./startup-cushion";

const playbackState = vi.hoisted(() => ({
  currentTime: 0,
  currentTimeListener: null as (() => void) | null,
  currentTimeUnsubscribe: vi.fn(),
  isPlayPending: false,
  isPlaying: false,
  loopEnd: 10,
  loopStart: 0,
  pendingListener: null as (() => void) | null,
  pendingUnsubscribe: vi.fn(),
  playhead: 0,
}));

vi.mock("@fiftyone/playback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/playback")>();
  return {
    ...actual,
    getCurrentTime: () => playbackState.currentTime,
    getIsPlayPending: () => playbackState.isPlayPending,
    getIsPlaying: () => playbackState.isPlaying,
    getLoopEnd: () => playbackState.loopEnd,
    getLoopStart: () => playbackState.loopStart,
    getPlayhead: () => playbackState.playhead,
    subscribeCurrentTime: (_store: PlaybackStore, listener: () => void) => {
      playbackState.currentTimeListener = listener;
      return playbackState.currentTimeUnsubscribe;
    },
    subscribeIsPlayPending: (_store: PlaybackStore, listener: () => void) => {
      playbackState.pendingListener = listener;
      return playbackState.pendingUnsubscribe;
    },
  };
});

beforeEach(() => {
  playbackState.currentTime = 0;
  playbackState.currentTimeListener = null;
  playbackState.currentTimeUnsubscribe.mockReset();
  playbackState.isPlayPending = false;
  playbackState.isPlaying = false;
  playbackState.loopEnd = 10;
  playbackState.loopStart = 0;
  playbackState.pendingListener = null;
  playbackState.pendingUnsubscribe.mockReset();
  playbackState.playhead = 0;
});

describe("DataStreamScheduler", () => {
  it("routes rolling lookahead through idle and playback lanes", () => {
    const harness = createSchedulerHarness();
    const cleanup = harness.register();

    commitTime(5);
    expect(backgroundFetchCount(harness.prefetcher.fetchBatch)).toBe(1);

    // A sub-threshold forward tick is intentionally coalesced.
    commitTime(5.01);
    expect(backgroundFetchCount(harness.prefetcher.fetchBatch)).toBe(1);

    playbackState.isPlaying = true;
    commitTime(6);
    expect(backgroundFetchCount(harness.prefetcher.fetchBatch)).toBe(1);
    expect(
      operationFetchCount(harness.prefetcher.fetchBatch, "playback-prefetch"),
    ).toBe(1);

    playbackState.isPlaying = false;
    commitTime(1);
    expect(backgroundFetchCount(harness.prefetcher.fetchBatch)).toBe(2);
    cleanup();
  });

  it("does not admit lookahead work from visual-only playhead movement", () => {
    const harness = createSchedulerHarness();
    const cleanup = harness.register();

    playbackState.playhead = 1;
    playbackState.playhead = 5;
    playbackState.playhead = 9;
    expect(harness.prefetcher.fetchBatch).not.toHaveBeenCalled();

    commitTime(9);
    expect(harness.prefetcher.fetchBatch).toHaveBeenCalledOnce();
    cleanup();
  });

  it("resets startup intent across pause/resume and releases subscriptions", () => {
    const harness = createSchedulerHarness();
    const cleanup = harness.register();

    playbackState.isPlayPending = true;
    playbackState.pendingListener?.();
    expect(harness.cancelIdle).toHaveBeenCalledOnce();

    playbackState.isPlayPending = false;
    playbackState.pendingListener?.();
    expect(
      harness.startupCushionPlanner.resetPendingPlan,
    ).toHaveBeenCalledOnce();

    playbackState.isPlaying = true;
    commitTime(0.5);
    expect(
      harness.startupCushionPlanner.resetPendingPlan,
    ).toHaveBeenCalledTimes(2);

    cleanup();
    expect(harness.unregisterStream).toHaveBeenCalledOnce();
    expect(harness.unsubscribeStream).toHaveBeenCalledOnce();
    expect(playbackState.pendingUnsubscribe).toHaveBeenCalledOnce();
    expect(playbackState.currentTimeUnsubscribe).toHaveBeenCalledOnce();
  });

  it("fills the current tail before admitting wrapped loop continuation", () => {
    const harness = createSchedulerHarness();
    const cleanup = harness.register();
    playbackState.loopStart = 2;
    playbackState.loopEnd = 10;
    playbackState.isPlaying = true;
    harness.prefetcher.collectMissingTicksForStreams.mockImplementation(
      (startSec) => (startSec >= 9 ? [9_000_000_000n] : [2_000_000_000n]),
    );

    commitTime(9);

    expect(harness.prefetcher.fetchBatch).toHaveBeenCalledWith(
      [9_000_000_000n],
      ["/camera"],
      "playback-prefetch",
    );
    expect(
      operationFetchCount(harness.prefetcher.fetchBatch, "loopback-lookahead"),
    ).toBe(0);

    harness.prefetcher.collectMissingTicksForStreams.mockImplementation(
      (startSec) => (startSec === 2 ? [2_000_000_000n] : []),
    );
    commitTime(9.5);

    expect(harness.prefetcher.fetchBatch).toHaveBeenLastCalledWith(
      [2_000_000_000n],
      ["/camera"],
      "loopback-lookahead",
    );
    cleanup();
  });

  it("derives continuation from the latest loop bounds after a seek", () => {
    const harness = createSchedulerHarness();
    const cleanup = harness.register();
    playbackState.isPlaying = true;
    harness.prefetcher.collectMissingTicksForStreams.mockImplementation(
      (startSec) =>
        startSec === playbackState.loopStart
          ? [BigInt(startSec) * 1_000_000_000n]
          : [],
    );

    commitTime(9.5);
    expect(harness.prefetcher.fetchBatch).toHaveBeenLastCalledWith(
      [0n],
      ["/camera"],
      "loopback-lookahead",
    );

    playbackState.loopStart = 2;
    playbackState.loopEnd = 8;
    commitTime(7.5);
    expect(harness.prefetcher.fetchBatch).toHaveBeenLastCalledWith(
      [2_000_000_000n],
      ["/camera"],
      "loopback-lookahead",
    );
    cleanup();
  });

  it("includes streams that become active while approaching the seam", () => {
    const harness = createSchedulerHarness();
    const cleanup = harness.register();
    playbackState.loopStart = 2;
    playbackState.loopEnd = 10;
    playbackState.isPlaying = true;
    harness.prefetcher.collectMissingTicksForStreams.mockImplementation(
      (startSec, _endSec, _maxTicks, streams) =>
        startSec === 2 && streams.includes("/lidar") ? [2_000_000_000n] : [],
    );

    commitTime(9);
    expect(harness.prefetcher.fetchBatch).not.toHaveBeenCalled();

    harness.activeStreams.push("/lidar");
    commitTime(9.6);
    expect(harness.prefetcher.fetchBatch).toHaveBeenLastCalledWith(
      [2_000_000_000n],
      ["/camera", "/lidar"],
      "loopback-lookahead",
    );
    cleanup();
  });

  it("keeps repeated engine startup batches inside one anchored chunk budget", () => {
    const harness = createSchedulerHarness({
      byteTimeline: byteTimelineAtTenths(),
      policy: {
        startupMaxCompressedBytes: 1_000,
        startupMaxChunks: 1,
      },
    });
    const cleanup = harness.register();
    harness.prefetcher.collectMissingTicksForStreams
      .mockReturnValueOnce([50_000_000n])
      .mockReturnValueOnce([150_000_000n]);

    harness.stream().prefetch?.([0, 1]);

    expect(harness.prefetcher.fetchBatch).toHaveBeenCalledOnce();
    expect(harness.prefetcher.fetchBatch).toHaveBeenCalledWith(
      [50_000_000n],
      ["/camera"],
      "playback-prefetch",
    );
    cleanup();
  });

  it("bounds paused current-time startup recovery by the same chunk budget", () => {
    const harness = createSchedulerHarness({
      byteTimeline: byteTimelineAtTenths(),
      fillCache: false,
      policy: {
        startupMaxCompressedBytes: 1_000,
        startupMaxChunks: 1,
      },
    });
    const cleanup = harness.register();
    harness.prefetcher.collectMissingTicksForStreams.mockReturnValue([
      50_000_000n,
      150_000_000n,
    ]);

    commitTime(0);

    expect(harness.prefetcher.fetchBatch).toHaveBeenCalledWith(
      [50_000_000n],
      ["/camera"],
      "startup-lookahead",
    );
    cleanup();
  });

  it("does not apply paused speculative caps to active playback", () => {
    const harness = createSchedulerHarness({
      byteTimeline: byteTimelineAtTenths(),
      policy: {
        pausedWarmupMaxCompressedBytes: 1,
        pausedWarmupMaxChunks: 1,
      },
    });
    const cleanup = harness.register();
    playbackState.isPlaying = true;
    harness.prefetcher.collectMissingTicksForStreams.mockReturnValue([
      2_000_000_000n,
    ]);

    commitTime(0.5);

    expect(harness.prefetcher.fetchBatch).toHaveBeenCalledWith(
      [2_000_000_000n],
      ["/camera"],
      "playback-prefetch",
    );
    cleanup();
  });

  it("preserves the required play-press cushion outside paused caps", () => {
    const harness = createSchedulerHarness({
      byteTimeline: byteTimelineAtTenths(),
      policy: {
        startupMaxCompressedBytes: 1,
        startupMaxChunks: 1,
      },
    });
    const cleanup = harness.register();
    playbackState.isPlayPending = true;
    harness.prefetcher.collectMissingTicksForStreams.mockReturnValue([
      50_000_000n,
      150_000_000n,
    ]);

    harness.stream().prefetch?.([0, 1]);

    expect(harness.prefetcher.fetchBatch).toHaveBeenCalledWith(
      [50_000_000n, 150_000_000n],
      ["/camera"],
      "playback-prefetch",
    );
    cleanup();
  });

  it("warms paused runway from an unsnapped playhead after its nearest tick is ready", () => {
    const harness = createSchedulerHarness();
    // At 10 Hz this rounds forward to 200 ms. The former zero-width
    // coverage gate compared that tick to a 160 ms end and rejected it.
    playbackState.playhead = 0.16;
    harness.prefetcher.collectMissingTicksForStreams.mockReturnValue([
      200_000_000n,
    ]);

    expect(harness.scheduler.runPausedIdleWarmup()).toBe(true);
    expect(harness.prefetcher.fetchBatch).toHaveBeenCalledWith(
      [200_000_000n],
      ["/camera"],
      "background-lookahead",
    );
  });

  it("applies paused chunk admission to warmup batches", () => {
    const harness = createSchedulerHarness({
      byteTimeline: byteTimelineAtTenths(),
      policy: {
        pausedWarmupMaxCompressedBytes: 1_000,
        pausedWarmupMaxChunks: 1,
      },
    });
    harness.prefetcher.collectMissingTicksForStreams.mockReturnValue([
      50_000_000n,
      150_000_000n,
    ]);

    expect(harness.scheduler.runPausedIdleWarmup()).toBe(true);
    expect(harness.prefetcher.fetchBatch).toHaveBeenCalledWith(
      [50_000_000n],
      ["/camera"],
      "background-lookahead",
    );
  });

  it("shares one paused chunk budget across loop-tail segments", () => {
    const harness = createSchedulerHarness({
      byteTimeline: [
        {
          cumulativeCompressedBytes: 10,
          endTimeNs: 99_000_000n,
          startOffsetBytes: 0n,
        },
        {
          cumulativeCompressedBytes: 20,
          endTimeNs: 999_000_000n,
          startOffsetBytes: 10n,
        },
      ],
      policy: {
        pausedWarmupMaxCompressedBytes: 1_000,
        pausedWarmupMaxChunks: 1,
      },
    });
    playbackState.loopStart = 0;
    playbackState.loopEnd = 1;
    playbackState.playhead = 0.95;
    harness.prefetcher.collectMissingTicksForStreams.mockImplementation(
      (startSec) => (startSec === 0 ? [50_000_000n] : []),
    );

    expect(harness.scheduler.runPausedIdleWarmup()).toBe(false);
    expect(harness.prefetcher.fetchBatch).not.toHaveBeenCalled();
  });
});

function createSchedulerHarness({
  byteTimeline = [
    {
      cumulativeCompressedBytes: 1_024,
      endTimeNs: 60_000_000_000n,
      startOffsetBytes: 0n,
    },
  ],
  fillCache = true,
  policy = {},
}: {
  readonly byteTimeline?: readonly ByteTimelinePoint[];
  readonly fillCache?: boolean;
  readonly policy?: Partial<PlaybackPolicy>;
} = {}) {
  const index = createTimelineIndex({
    endNs: 10_000_000_000n,
    startNs: 0n,
  });
  const cache = new EpisodeStreamCache();
  if (fillCache) {
    for (let position = 0; position < index.tickCount; position++) {
      const tick = index.tickAt(position);
      if (tick !== undefined) cache.set(tick, null);
    }
  }
  const prefetcher = {
    collectMissingTicksForStreams: vi.fn<
      DataStreamPrefetcher["collectMissingTicksForStreams"]
    >(() => [9_000_000_000n]),
    fetchBatch: vi.fn(() => true),
    fetchCurrentFrame: vi.fn(() => false),
    isStreamPending: vi.fn(() => false),
  } satisfies DataStreamPrefetcher;
  const startupCushionPlanner = {
    resetPendingPlan: vi.fn(),
  } as unknown as StartupCushionPlanner;
  const unregisterStream = vi.fn();
  const unsubscribeStream = vi.fn();
  const cancelIdle = vi.fn();
  const activeStreams = ["/camera"];
  let registeredStream: PlaybackStream | null = null;
  const scheduler = new DataStreamScheduler({
    caches: new Map([["/camera", cache]]),
    cancelIdle,
    computeBufferedRanges: () => [[0, 10]],
    failedStreams: new Set(),
    getActiveBlockingStreams: () => [...activeStreams],
    getActiveStreams: () => [...activeStreams],
    getBackgroundLookaheadSeconds: () => 2,
    getByteTimeline: () => byteTimeline,
    getBlockingStreams: () => new Set(["/camera"]),
    getIndex: () => index,
    getLastSeekAtMs: () => null,
    isSourceAvailable: () => true,
    lastFrames: new Map(),
    policy: derivePlaybackPolicy({ ...DEFAULT_PLAYBACK_POLICY, ...policy }, 10),
    prefetcher,
    publishStreamStatuses: vi.fn(),
    resolveStartupCushion: () => ({
      cushionSeconds: 0.5,
      estimatedWaitSeconds: 0,
    }),
    startupCushionPlanner,
    store: createStore() as PlaybackStore,
  });

  return {
    activeStreams,
    cancelIdle,
    prefetcher,
    register: () =>
      scheduler.register(
        (stream: PlaybackStream) => {
          registeredStream = stream;
          return unregisterStream;
        },
        () => unsubscribeStream,
      ),
    scheduler,
    startupCushionPlanner,
    stream: () => {
      if (!registeredStream) throw new Error("stream is not registered");
      return registeredStream;
    },
    unregisterStream,
    unsubscribeStream,
  };
}

function byteTimelineAtTenths(): readonly ByteTimelinePoint[] {
  return [
    {
      cumulativeCompressedBytes: 10,
      endTimeNs: 99_000_000n,
      startOffsetBytes: 0n,
    },
    {
      cumulativeCompressedBytes: 20,
      endTimeNs: 199_000_000n,
      startOffsetBytes: 10n,
    },
    {
      cumulativeCompressedBytes: 30,
      endTimeNs: 299_000_000n,
      startOffsetBytes: 20n,
    },
  ];
}

function commitTime(timeSec: number): void {
  playbackState.currentTime = timeSec;
  playbackState.playhead = timeSec;
  playbackState.currentTimeListener?.();
}

function backgroundFetchCount(fetchBatch: ReturnType<typeof vi.fn>): number {
  return operationFetchCount(fetchBatch, "background-lookahead");
}

function operationFetchCount(
  fetchBatch: ReturnType<typeof vi.fn>,
  operation: string,
): number {
  return fetchBatch.mock.calls.filter((call) => call[2] === operation).length;
}
