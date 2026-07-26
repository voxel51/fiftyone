import type { PlaybackStore, PlaybackStream } from "@fiftyone/playback";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTimelineIndex, EpisodeStreamCache } from "../../../runtime";
import {
  DataStreamScheduler,
  type DataStreamPrefetcher,
} from "./data-stream-prefetch";
import {
  DEFAULT_PLAYBACK_POLICY,
  derivePlaybackPolicy,
} from "./playback-buffering";
import type { StartupCushionPlanner } from "./startup-cushion";

const playbackState = vi.hoisted(() => ({
  currentTime: 0,
  currentTimeListener: null as (() => void) | null,
  currentTimeUnsubscribe: vi.fn(),
  isPlayPending: false,
  isPlaying: false,
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
});

function createSchedulerHarness() {
  const index = createTimelineIndex({
    endNs: 10_000_000_000n,
    startNs: 0n,
  });
  const cache = new EpisodeStreamCache();
  for (let position = 0; position < index.tickCount; position++) {
    const tick = index.tickAt(position);
    if (tick !== undefined) cache.set(tick, null);
  }
  const prefetcher = {
    collectMissingTicksForStreams: vi.fn(() => [9_000_000_000n]),
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
  const scheduler = new DataStreamScheduler({
    caches: new Map([["/camera", cache]]),
    cancelIdle,
    computeBufferedRanges: () => [[0, 10]],
    failedStreams: new Set(),
    getActiveBlockingStreams: () => ["/camera"],
    getActiveStreams: () => ["/camera"],
    getBackgroundLookaheadSeconds: () => 2,
    getBlockingStreams: () => new Set(["/camera"]),
    getIndex: () => index,
    getLastSeekAtMs: () => null,
    isSourceAvailable: () => true,
    lastFrames: new Map(),
    policy: derivePlaybackPolicy(DEFAULT_PLAYBACK_POLICY, 10),
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
    cancelIdle,
    prefetcher,
    register: () =>
      scheduler.register(
        (_stream: PlaybackStream) => unregisterStream,
        () => unsubscribeStream,
      ),
    startupCushionPlanner,
    unregisterStream,
    unsubscribeStream,
  };
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
