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
  type SynchronizedStreamSettlement,
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
  it.each(["batch", "current"] as const)(
    "keeps stale-epoch rejection identical for %s delivery",
    async (lane) => {
      const read = deferred<SynchronizedFrameWindow>();
      const batchRead = deferred<readonly SynchronizedFrameWindow[]>();
      const harness = createHarness({
        readSynchronized: vi.fn(() => read.promise),
        readSynchronizedBatch: vi.fn(() => batchRead.promise),
      });
      harness.caches.get(IMAGE)?.subscribe();

      expect(fetchLane(harness, lane, 0n, [IMAGE])).toBe(true);
      harness.sourceEpoch += 1;
      const window = windowAt(0n, [frame(IMAGE, 0n)]);
      read.resolve(window);
      batchRead.resolve([window]);
      await settle();

      expect(harness.caches.get(IMAGE)?.has(0n)).toBe(false);
      expect(harness.fetchState.failureStreaks).toEqual(new Map());
    },
  );

  it.each(["batch", "current"] as const)(
    "keeps inactive-stream filtering identical for %s delivery",
    async (lane) => {
      const read = deferred<SynchronizedFrameWindow>();
      const batchRead = deferred<readonly SynchronizedFrameWindow[]>();
      const harness = createHarness({
        readSynchronized: vi.fn(() => read.promise),
        readSynchronizedBatch: vi.fn(() => batchRead.promise),
      });
      const release = harness.caches.get(IMAGE)?.subscribe();

      expect(fetchLane(harness, lane, 0n, [IMAGE])).toBe(true);
      release?.();
      const window = windowAt(0n, [frame(IMAGE, 0n)]);
      read.resolve(window);
      batchRead.resolve([window]);
      await settle();

      expect(harness.caches.get(IMAGE)?.has(0n)).toBe(false);
    },
  );

  it.each(["batch", "current"] as const)(
    "keeps cancellation filtering identical for %s delivery",
    async (lane) => {
      const read = deferred<SynchronizedFrameWindow>();
      const batchRead = deferred<readonly SynchronizedFrameWindow[]>();
      const harness = createHarness({
        readSynchronized: vi.fn(() => read.promise),
        readSynchronizedBatch: vi.fn(() => batchRead.promise),
      });
      harness.caches.get(IMAGE)?.subscribe();

      expect(fetchLane(harness, lane, 0n, [IMAGE])).toBe(true);
      if (lane === "batch") {
        batchRead.reject(new EpisodeReadCancelledError());
      } else {
        read.reject(new EpisodeReadCancelledError());
      }
      await settle();

      expect(harness.fetchState.failureStreaks).toEqual(new Map());
      expect(harness.prefetcher.isStreamPending("0", IMAGE)).toBe(false);
    },
  );

  it.each(["batch", "current"] as const)(
    "materializes post-range image predecessors as empty for %s delivery",
    async (lane) => {
      const requestedTimeNs = 500_000_000n;
      const heldImage = frame(IMAGE, 400_000_000n);
      const window = windowAt(requestedTimeNs, [heldImage]);
      const harness = createHarness({
        isStreamTimeAvailable: (stream, timeNs) =>
          stream !== IMAGE || timeNs <= 400_000_000n,
        readSynchronized: vi.fn(async () => window),
        readSynchronizedBatch: vi.fn(async () => [window]),
      });
      harness.caches.get(IMAGE)?.subscribe();

      expect(fetchLane(harness, lane, requestedTimeNs, [IMAGE])).toBe(true);
      await settle();

      expect(harness.caches.get(IMAGE)?.has(requestedTimeNs)).toBe(true);
      expect(harness.caches.get(IMAGE)?.get(requestedTimeNs)).toBeNull();
      expect(getStreamValue(harness.store, IMAGE)).toBeNull();
    },
  );

  it.each(["batch", "current"] as const)(
    "keeps partial decode failure isolation identical for %s delivery",
    async (lane) => {
      const window = windowAt(0n, [frame(LIDAR, 0n)], [IMAGE]);
      const harness = createHarness({
        readSynchronized: vi.fn(async () => window),
        readSynchronizedBatch: vi.fn(async () => [window]),
      });
      harness.caches.get(IMAGE)?.subscribe();
      harness.caches.get(LIDAR)?.subscribe();

      expect(fetchLane(harness, lane, 0n, [IMAGE, LIDAR])).toBe(true);
      await settle();

      expect(harness.fetchState.failureStreaks).toEqual(new Map([[IMAGE, 1]]));
      expect(harness.caches.get(IMAGE)?.has(0n)).toBe(false);
      expect(harness.caches.get(LIDAR)?.get(0n)).toEqual(frame(LIDAR, 0n));
    },
  );

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

  it("caches and releases only each authoritatively settled stream", async () => {
    const terminal = deferred<SynchronizedFrameWindow>();
    let publishSettlement:
      | ((settlement: SynchronizedStreamSettlement) => void)
      | undefined;
    const harness = createHarness({
      readSynchronized: vi.fn((request) => {
        publishSettlement = request.onStreamSettlement;
        return terminal.promise;
      }),
    });
    harness.caches.get(IMAGE)?.subscribe();
    harness.caches.get(LIDAR)?.subscribe();

    expect(
      harness.prefetcher.fetchCurrentFrame(0n, [IMAGE, LIDAR], [IMAGE, LIDAR]),
    ).toBe(true);
    expect(publishSettlement).toBeTypeOf("function");
    if (!publishSettlement) throw new Error("expected settlement callback");
    const settledImage = frame(IMAGE, 0n);
    publishSettlement({
      stream: IMAGE,
      window: windowAt(0n, [settledImage]),
    });

    expect(getStreamValue(harness.store, IMAGE)).not.toBeNull();
    expect(getStreamValue(harness.store, LIDAR)).toBeNull();
    expect(harness.caches.get(IMAGE)?.get(0n)).toBe(settledImage);
    expect(harness.prefetcher.isStreamPending("0", IMAGE)).toBe(false);
    expect(harness.prefetcher.isStreamPending("0", LIDAR)).toBe(true);
    expect(harness.publishStreamStatuses).toHaveBeenLastCalledWith([IMAGE]);
    expect(harness.rebalanceDecodedCaches).not.toHaveBeenCalled();

    terminal.resolve(windowAt(0n, [frame(IMAGE, 0n), frame(LIDAR, 0n)]));
    await settle();

    expect(harness.caches.get(IMAGE)?.get(0n)).toBe(settledImage);
    expect(harness.caches.get(LIDAR)?.has(0n)).toBe(true);
    expect(harness.prefetcher.isStreamPending("0", IMAGE)).toBe(false);
    expect(harness.prefetcher.isStreamPending("0", LIDAR)).toBe(false);
    expect(harness.publishStreamStatuses).toHaveBeenLastCalledWith([LIDAR]);
    expect(harness.rebalanceDecodedCaches).toHaveBeenCalledOnce();
  });

  it("publishes one authoritative settlement delivery group in one store turn", async () => {
    const terminal = deferred<SynchronizedFrameWindow>();
    let publishSettlements:
      | ((settlements: readonly SynchronizedStreamSettlement[]) => void)
      | undefined;
    const harness = createHarness({
      readSynchronized: vi.fn((request) => {
        publishSettlements = request.onStreamSettlements;
        return terminal.promise;
      }),
    });
    harness.caches.get(IMAGE)?.subscribe();
    harness.caches.get(LIDAR)?.subscribe();

    expect(
      harness.prefetcher.fetchCurrentFrame(0n, [IMAGE, LIDAR], [IMAGE, LIDAR]),
    ).toBe(true);
    expect(publishSettlements).toBeTypeOf("function");
    publishSettlements?.([
      { stream: IMAGE, window: windowAt(0n, [frame(IMAGE, 0n)]) },
      { stream: LIDAR, window: windowAt(0n, [frame(LIDAR, 0n)]) },
    ]);

    expect(getStreamValue(harness.store, IMAGE)).not.toBeNull();
    expect(getStreamValue(harness.store, LIDAR)).not.toBeNull();
    expect(harness.prefetcher.isStreamPending("0", IMAGE)).toBe(false);
    expect(harness.prefetcher.isStreamPending("0", LIDAR)).toBe(false);
    expect(harness.publishStreamStatuses).toHaveBeenCalledOnce();
    expect(harness.publishStreamStatuses).toHaveBeenCalledWith([IMAGE, LIDAR]);

    terminal.resolve(windowAt(0n, []));
    await settle();
  });

  it("does not preview a current-frame result after the playhead moves", async () => {
    const terminal = deferred<SynchronizedFrameWindow>();
    let publishSettlement:
      | ((settlement: SynchronizedStreamSettlement) => void)
      | undefined;
    const harness = createHarness({
      readSynchronized: vi.fn((request) => {
        publishSettlement = request.onStreamSettlement;
        return terminal.promise;
      }),
    });
    harness.caches.get(IMAGE)?.subscribe();

    expect(harness.prefetcher.fetchCurrentFrame(0n, [IMAGE], [IMAGE])).toBe(
      true,
    );
    const movedTick = harness.index.tickAt(1);
    if (movedTick === undefined) throw new Error("expected a second tick");
    harness.store.set(playheadAtom, harness.index.nsToSec(movedTick));
    expect(publishSettlement).toBeTypeOf("function");
    if (!publishSettlement) throw new Error("expected settlement callback");
    publishSettlement({
      stream: IMAGE,
      window: windowAt(0n, [frame(IMAGE, 0n)]),
    });
    expect(getStreamValue(harness.store, IMAGE)).toBeNull();

    terminal.resolve(windowAt(0n, [frame(IMAGE, 0n)]));
    await settle();
    expect(getStreamValue(harness.store, IMAGE)).toBeNull();
  });

  it("retries only a topic that failed after a sibling settled", async () => {
    let attempt = 0;
    const readSynchronized = vi.fn<PlaybackReadCapability["readSynchronized"]>(
      async (request) => {
        attempt += 1;
        if (attempt === 1) {
          request.onStreamSettlement?.({
            stream: LIDAR,
            window: windowAt(request.timeNs, [frame(LIDAR, request.timeNs)]),
          });
          request.onStreamSettlement?.({
            stream: IMAGE,
            window: windowAt(request.timeNs, [], [IMAGE]),
          });
        } else {
          request.onStreamSettlement?.({
            stream: IMAGE,
            window: windowAt(request.timeNs, [frame(IMAGE, request.timeNs)]),
          });
        }
        return windowAt(request.timeNs, []);
      },
    );
    const harness = createHarness({ readSynchronized });
    harness.caches.get(IMAGE)?.subscribe();
    harness.caches.get(LIDAR)?.subscribe();

    expect(harness.prefetcher.fetchCurrentFrame(0n, [IMAGE, LIDAR])).toBe(true);
    await settle();
    expect(harness.caches.get(LIDAR)?.has(0n)).toBe(true);
    expect(harness.caches.get(IMAGE)?.has(0n)).toBe(false);
    expect(harness.fetchState.failureStreaks.get(IMAGE)).toBe(1);

    expect(harness.prefetcher.fetchCurrentFrame(0n, [IMAGE, LIDAR])).toBe(true);
    await settle();
    expect(readSynchronized.mock.calls[1]?.[0].streams).toEqual([IMAGE]);
    expect(harness.caches.get(IMAGE)?.has(0n)).toBe(true);
    expect(harness.fetchState.failureStreaks.has(IMAGE)).toBe(false);
  });

  it("keeps a partial settlement authoritative when the union is cancelled", async () => {
    const terminal = deferred<SynchronizedFrameWindow>();
    let publishSettlement:
      | ((settlement: SynchronizedStreamSettlement) => void)
      | undefined;
    const harness = createHarness({
      readSynchronized: vi.fn((request) => {
        publishSettlement = request.onStreamSettlement;
        return terminal.promise;
      }),
    });
    harness.caches.get(IMAGE)?.subscribe();
    harness.caches.get(LIDAR)?.subscribe();

    expect(harness.prefetcher.fetchCurrentFrame(0n, [IMAGE, LIDAR])).toBe(true);
    const image = frame(IMAGE, 0n);
    publishSettlement?.({
      stream: IMAGE,
      window: windowAt(0n, [image]),
    });
    terminal.reject(new EpisodeReadCancelledError());
    await settle();

    expect(harness.caches.get(IMAGE)?.get(0n)).toBe(image);
    expect(harness.caches.get(LIDAR)?.has(0n)).toBe(false);
    expect(harness.prefetcher.isStreamPending("0", IMAGE)).toBe(false);
    expect(harness.prefetcher.isStreamPending("0", LIDAR)).toBe(false);
    expect(harness.fetchState.failureStreaks).toEqual(new Map());
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
      signal: expect.any(AbortSignal),
    });

    firstRead.resolve([]);
    await settle();
    expect(
      harness.prefetcher.fetchBatch([0n], [IMAGE], "background-lookahead"),
    ).toBe(true);
    expect(readSynchronizedBatch.mock.calls[1]?.[1]).toEqual({
      priority: "idle",
      signal: expect.any(AbortSignal),
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
  isStreamTimeAvailable,
  readSynchronized = vi.fn<PlaybackReadCapability["readSynchronized"]>(
    async (request) => windowAt(request.timeNs, []),
  ),
  readSynchronizedBatch = vi.fn<
    PlaybackReadCapability["readSynchronizedBatch"]
  >(async () => []),
  shouldAdmitBatch,
}: {
  readonly isStreamTimeAvailable?: Parameters<
    typeof createDataStreamPrefetcher
  >[0]["isStreamTimeAvailable"];
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
  const publishStreamStatuses = vi.fn();
  const index = createTimelineIndex({ endNs: 1_000_000_000n, startNs: 0n }, 2);
  const harness = {
    caches,
    fetchState,
    index,
    lastFrames,
    prefetcher: undefined as unknown as ReturnType<
      typeof createDataStreamPrefetcher
    >,
    publishStreamStatuses,
    rebalanceDecodedCaches,
    sourceEpoch: 0,
    store,
  };
  harness.prefetcher = createDataStreamPrefetcher({
    caches,
    fetchState,
    getIndex: () => index,
    getSourceEpoch: () => harness.sourceEpoch,
    getStreamPolicies: () => ({}) as StreamSyncPolicies,
    isStreamTimeAvailable,
    lastFrames,
    playback: {
      readSynchronized,
      readSynchronizedBatch,
    },
    publishStreamStatuses,
    rebalanceDecodedCaches,
    shouldAdmitBatch,
    store,
  });
  return harness;
}

function fetchLane(
  harness: ReturnType<typeof createHarness>,
  lane: "batch" | "current",
  tick: bigint,
  streams: string[],
): boolean {
  return lane === "batch"
    ? harness.prefetcher.fetchBatch([tick], streams, "playback-prefetch")
    : harness.prefetcher.fetchCurrentFrame(tick, streams);
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
