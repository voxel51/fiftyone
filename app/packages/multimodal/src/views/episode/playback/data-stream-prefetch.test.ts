import {
  getStreamValue,
  setIsBuffering,
  type PlaybackStore,
} from "@fiftyone/playback";
import { playheadAtom } from "@fiftyone/playback/runtime";
import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";

import type {
  DecodedFrame,
  StreamSyncPolicies,
  SynchronizedFrameWindow,
} from "../../../ir";
import {
  EpisodeReadCancelledError,
  type PlaybackReadCapability,
} from "../../../ports";
import { VISUALIZATION_KIND } from "../../../visualization";
import { createTimelineIndex, EpisodeStreamCache } from "../../../runtime";
import {
  createDataStreamFetchState,
  createDataStreamPrefetcher,
  MAX_FETCH_FAILURE_STREAK,
  resetDataStreamFetchState,
} from "./data-stream-prefetch";
import type { StreamPlaybackFrame } from "./use-stream-values";

const IMAGE = "/camera";
const LIDAR = "/lidar";

describe("data stream prefetcher", () => {
  it("drops stale source results and results for an unsubscribed stream", async () => {
    const staleRead = deferred<readonly SynchronizedFrameWindow[]>();
    const unsubscribedRead = deferred<SynchronizedFrameWindow>();
    const harness = createHarness({
      readSynchronized: vi.fn(() => unsubscribedRead.promise),
      readSynchronizedBatch: vi.fn(() => staleRead.promise),
    });
    const release = harness.caches.get(IMAGE)?.subscribe();

    expect(
      harness.prefetcher.fetchBatch([0n], [IMAGE], "playback-prefetch"),
    ).toBe(true);
    harness.sourceEpoch += 1;
    staleRead.resolve([windowAt(0n, [frame(IMAGE, 0n)])]);
    await settle();
    expect(harness.caches.get(IMAGE)?.has(0n)).toBe(false);

    resetDataStreamFetchState(harness.fetchState);
    expect(harness.prefetcher.fetchCurrentFrame(0n, [IMAGE])).toBe(true);
    release?.();
    unsubscribedRead.resolve(windowAt(0n, [frame(IMAGE, 0n)]));
    await settle();
    expect(harness.caches.get(IMAGE)?.has(0n)).toBe(false);
  });

  it("returns late loop-continuation reads to ordinary cache ownership", async () => {
    const lateRead = deferred<readonly SynchronizedFrameWindow[]>();
    const harness = createHarness({
      readSynchronizedBatch: vi.fn(() => lateRead.promise),
    });
    const cache = harness.caches.get(IMAGE);
    cache?.resize(1);
    cache?.subscribe();

    expect(
      harness.prefetcher.fetchBatch([0n], [IMAGE], "loopback-lookahead"),
    ).toBe(true);
    lateRead.resolve([windowAt(0n, [frame(IMAGE, 0n)])]);
    await settle();
    expect(cache?.has(0n)).toBe(true);
    expect(harness.rebalanceDecodedCaches).toHaveBeenLastCalledWith();

    // A loop change needs no cache-tier cleanup: the old same-source frame is
    // useful ordinary data, but normal recency may evict it immediately.
    cache?.set(500_000_000n, frame(IMAGE, 500_000_000n));
    expect(cache?.has(0n)).toBe(false);
    expect(cache?.has(500_000_000n)).toBe(true);
  });

  it("deduplicates pending ticks and assigns foreground and idle priorities", async () => {
    const firstRead = deferred<readonly SynchronizedFrameWindow[]>();
    const readSynchronizedBatch = vi
      .fn()
      .mockImplementationOnce(() => firstRead.promise)
      .mockResolvedValue([]);
    const harness = createHarness({ readSynchronizedBatch });
    harness.caches.get(IMAGE)?.subscribe();

    expect(
      harness.prefetcher.fetchBatch([0n], [IMAGE], "playback-prefetch"),
    ).toBe(true);
    expect(
      harness.prefetcher.fetchBatch([0n], [IMAGE], "playback-prefetch"),
    ).toBe(false);
    expect(
      harness.prefetcher.collectMissingTicksForStreams(0, 0, 1, [IMAGE]),
    ).toEqual([]);
    expect(readSynchronizedBatch.mock.calls[0]?.[1]).toEqual({
      priority: "playback",
    });

    firstRead.resolve([]);
    await settle();
    expect(
      harness.prefetcher.fetchBatch([0n], [IMAGE], "background-lookahead"),
    ).toBe(true);
    expect(readSynchronizedBatch.mock.calls[1]?.[1]).toEqual({
      priority: "idle",
    });
  });

  it("leaves refused batch ticks available for a later admission pass", async () => {
    let admitBatch = false;
    const readSynchronizedBatch = vi.fn(async () => []);
    const harness = createHarness({
      readSynchronizedBatch,
      shouldAdmitBatch: () => admitBatch,
    });
    harness.caches.get(IMAGE)?.subscribe();

    expect(
      harness.prefetcher.fetchBatch([0n], [IMAGE], "playback-prefetch"),
    ).toBe(false);
    expect(readSynchronizedBatch).not.toHaveBeenCalled();
    expect(
      harness.prefetcher.collectMissingTicksForStreams(0, 0, 1, [IMAGE]),
    ).toEqual([0n]);

    admitBatch = true;
    expect(
      harness.prefetcher.fetchBatch([0n], [IMAGE], "playback-prefetch"),
    ).toBe(true);
    expect(readSynchronizedBatch).toHaveBeenCalledOnce();
  });

  it("releases pending ticks after an idle read is cancelled", async () => {
    const idleRead = deferred<readonly SynchronizedFrameWindow[]>();
    const harness = createHarness({
      readSynchronizedBatch: vi.fn(() => idleRead.promise),
    });
    harness.caches.get(IMAGE)?.subscribe();

    expect(
      harness.prefetcher.fetchBatch([0n], [IMAGE], "background-lookahead"),
    ).toBe(true);
    expect(
      harness.prefetcher.collectMissingTicksForStreams(0, 0, 1, [IMAGE]),
    ).toEqual([]);

    idleRead.reject(new EpisodeReadCancelledError());
    await settle();

    expect(harness.fetchState.failureStreaks).toEqual(new Map());
    expect(
      harness.prefetcher.collectMissingTicksForStreams(0, 0, 1, [IMAGE]),
    ).toEqual([0n]);
  });

  it("settles current-frame followers after pending ownership is released", async () => {
    const imageRead = deferred<SynchronizedFrameWindow>();
    const harness = createHarness({
      readSynchronized: vi.fn(() => imageRead.promise),
    });
    harness.caches.get(IMAGE)?.subscribe();
    const firstSettled = vi.fn();
    const followerSettled = vi.fn();

    expect(
      harness.prefetcher.fetchCurrentFrame(0n, [IMAGE], firstSettled),
    ).toBe(true);
    expect(
      harness.prefetcher.fetchCurrentFrame(0n, [IMAGE], followerSettled),
    ).toBe(false);
    expect(firstSettled).not.toHaveBeenCalled();
    expect(followerSettled).not.toHaveBeenCalled();

    imageRead.reject(new EpisodeReadCancelledError());
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(firstSettled).toHaveBeenCalledOnce();
    expect(followerSettled).toHaveBeenCalledOnce();
    expect(harness.fetchState.pendingCurrentFrameSettlementsByTick).toEqual(
      new Map(),
    );
    expect(harness.prefetcher.isStreamPending("0", IMAGE)).toBe(false);
  });

  it("isolates decode failures and seals only the repeatedly broken stream", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const harness = createHarness({
      readSynchronized: vi.fn(async (request) =>
        windowAt(
          request.timeNs,
          request.streams.includes(LIDAR) ? [frame(LIDAR, request.timeNs)] : [],
          request.streams.includes(IMAGE) ? [IMAGE] : [],
        ),
      ),
    });
    harness.caches.get(IMAGE)?.subscribe();
    harness.caches.get(LIDAR)?.subscribe();

    expect(harness.prefetcher.fetchCurrentFrame(0n, [IMAGE, LIDAR])).toBe(true);
    await settle();
    for (let attempt = 1; attempt < MAX_FETCH_FAILURE_STREAK; attempt++) {
      expect(harness.prefetcher.fetchCurrentFrame(0n, [IMAGE, LIDAR])).toBe(
        true,
      );
      await settle();
    }

    expect(harness.fetchState.failedStreams).toEqual(new Set([IMAGE]));
    expect(harness.caches.get(IMAGE)?.get(0n)).toBeNull();
    expect(harness.caches.get(LIDAR)?.get(0n)).toEqual(frame(LIDAR, 0n));
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it("keeps a held frame while a paused seek target is still loading", async () => {
    const targetRead = deferred<SynchronizedFrameWindow>();
    const harness = createHarness({
      readSynchronized: vi
        .fn()
        .mockResolvedValueOnce(windowAt(0n, [frame(IMAGE, 0n)]))
        .mockImplementationOnce(() => targetRead.promise),
    });
    harness.caches.get(IMAGE)?.subscribe();

    harness.prefetcher.fetchCurrentFrame(0n, [IMAGE]);
    await settle();
    const held = getStreamValue<StreamPlaybackFrame<unknown>>(
      harness.store,
      IMAGE,
    );
    expect(held).not.toBeNull();

    setIsBuffering(harness.store, true);
    harness.store.set(playheadAtom, 0.5);
    harness.prefetcher.fetchCurrentFrame(500_000_000n, [IMAGE]);
    expect(getStreamValue(harness.store, IMAGE)).toBe(held);
    targetRead.resolve(windowAt(500_000_000n, []));
    await settle();
    expect(getStreamValue(harness.store, IMAGE)).toBe(held);
    expect(harness.rebalanceDecodedCaches).toHaveBeenLastCalledWith();
  });

  it("publishes the current playhead tick when an older frame read resolves", async () => {
    const staleRead = deferred<SynchronizedFrameWindow>();
    const harness = createHarness({
      readSynchronized: vi.fn(() => staleRead.promise),
    });
    harness.caches.get(IMAGE)?.subscribe();

    expect(harness.prefetcher.fetchCurrentFrame(0n, [IMAGE])).toBe(true);
    harness.caches.get(IMAGE)?.set(500_000_000n, frame(IMAGE, 500_000_000n));
    harness.store.set(playheadAtom, 0.5);

    staleRead.resolve(windowAt(0n, [frame(IMAGE, 0n)]));
    await settle();

    expect(
      getStreamValue<StreamPlaybackFrame<unknown>>(harness.store, IMAGE),
    ).toMatchObject({
      contentTimeNs: 500_000_000n,
      requestedTimeNs: 500_000_000n,
    });
  });
});

function createHarness({
  readSynchronized = vi.fn<PlaybackReadCapability["readSynchronized"]>(
    async (request) => windowAt(request.timeNs, []),
  ),
  readSynchronizedBatch = vi.fn<
    PlaybackReadCapability["readSynchronizedBatch"]
  >(async () => []),
  shouldAdmitBatch,
}: {
  readonly readSynchronized?: PlaybackReadCapability["readSynchronized"];
  readonly readSynchronizedBatch?: PlaybackReadCapability["readSynchronizedBatch"];
  readonly shouldAdmitBatch?: Parameters<
    typeof createDataStreamPrefetcher
  >[0]["shouldAdmitBatch"];
} = {}) {
  const store = createStore() as PlaybackStore;
  const caches = new Map([
    [IMAGE, new EpisodeStreamCache()],
    [LIDAR, new EpisodeStreamCache()],
  ]);
  const fetchState = createDataStreamFetchState();
  const lastFrames = new Map<string, StreamPlaybackFrame<unknown>>();
  const rebalanceDecodedCaches = vi.fn();
  const harness = {
    caches,
    fetchState,
    lastFrames,
    prefetcher: undefined as unknown as ReturnType<
      typeof createDataStreamPrefetcher
    >,
    rebalanceDecodedCaches,
    sourceEpoch: 0,
    store,
  };
  harness.prefetcher = createDataStreamPrefetcher({
    caches,
    fetchState,
    getIndex: () =>
      createTimelineIndex({ endNs: 1_000_000_000n, startNs: 0n }, 2),
    getSourceEpoch: () => harness.sourceEpoch,
    getStreamPolicies: () => ({}) as StreamSyncPolicies,
    lastFrames,
    playback: {
      readSynchronized,
      readSynchronizedBatch,
    },
    publishStreamStatuses: vi.fn(),
    rebalanceDecodedCaches,
    shouldAdmitBatch,
    store,
  });
  return harness;
}

function frame(streamId: string, timestampNs: bigint): DecodedFrame {
  return {
    output: {
      visualization: {
        bytes: new Uint8Array([1]),
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
      },
    },
    streamId,
    timestampNs,
  };
}

function windowAt(
  timeNs: bigint,
  frames: readonly DecodedFrame[],
  failedStreams: readonly string[] = [],
): SynchronizedFrameWindow {
  return {
    diagnosticsByStream: Object.fromEntries(
      failedStreams.map((streamId) => [
        streamId,
        [
          {
            code: "frame-decode-failed" as const,
            message: "decode failed",
            payloadIdentity: `${streamId}:${timeNs}`,
            requestedTimeNs: timeNs,
            streamId,
            timestampNs: timeNs,
          },
        ],
      ]),
    ),
    endNs: timeNs,
    frames,
    framesByStream: Object.fromEntries(
      frames.map((message) => [message.streamId, [message]]),
    ),
    startNs: timeNs,
    streamPolicies: {},
    timeNs,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
