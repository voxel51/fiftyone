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
  isPlayPending: false,
  isPlaying: false,
  pendingListener: null as (() => void) | null,
  pendingUnsubscribe: vi.fn(),
  playhead: 0,
  playheadListener: null as (() => void) | null,
  playheadUnsubscribe: vi.fn(),
}));

vi.mock("@fiftyone/playback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/playback")>();
  return {
    ...actual,
    getIsPlayPending: () => playbackState.isPlayPending,
    getIsPlaying: () => playbackState.isPlaying,
    getPlayhead: () => playbackState.playhead,
    subscribeIsPlayPending: (_store: PlaybackStore, listener: () => void) => {
      playbackState.pendingListener = listener;
      return playbackState.pendingUnsubscribe;
    },
    subscribePlayhead: (_store: PlaybackStore, listener: () => void) => {
      playbackState.playheadListener = listener;
      return playbackState.playheadUnsubscribe;
    },
  };
});

beforeEach(() => {
  playbackState.isPlayPending = false;
  playbackState.isPlaying = false;
  playbackState.pendingListener = null;
  playbackState.pendingUnsubscribe.mockReset();
  playbackState.playhead = 0;
  playbackState.playheadListener = null;
  playbackState.playheadUnsubscribe.mockReset();
});

describe("DataStreamScheduler", () => {
  it("routes rolling lookahead through idle and playback lanes", () => {
    const harness = createSchedulerHarness();
    const cleanup = harness.register();

    movePlayhead(5);
    expect(backgroundFetchCount(harness.prefetcher.fetchBatch)).toBe(1);

    // A sub-threshold forward tick is intentionally coalesced.
    movePlayhead(5.01);
    expect(backgroundFetchCount(harness.prefetcher.fetchBatch)).toBe(1);

    playbackState.isPlaying = true;
    movePlayhead(6);
    expect(backgroundFetchCount(harness.prefetcher.fetchBatch)).toBe(1);
    expect(
      operationFetchCount(harness.prefetcher.fetchBatch, "playback-prefetch"),
    ).toBe(1);

    playbackState.isPlaying = false;
    movePlayhead(1);
    expect(backgroundFetchCount(harness.prefetcher.fetchBatch)).toBe(2);
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
    movePlayhead(0.5);
    expect(
      harness.startupCushionPlanner.resetPendingPlan,
    ).toHaveBeenCalledTimes(2);

    cleanup();
    expect(harness.unregisterStream).toHaveBeenCalledOnce();
    expect(harness.unsubscribeStream).toHaveBeenCalledOnce();
    expect(playbackState.pendingUnsubscribe).toHaveBeenCalledOnce();
    expect(playbackState.playheadUnsubscribe).toHaveBeenCalledOnce();
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

function movePlayhead(timeSec: number): void {
  playbackState.playhead = timeSec;
  playbackState.playheadListener?.();
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
