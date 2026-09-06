import { describe, expect, it, vi } from "vitest";
import { STREAM_SYNC_MODE } from "../ir";
import {
  EpisodeReadUnsupportedError,
  type EpisodeSession,
  type FrameBatch,
  type ReadRequest,
} from "../ports";
import {
  GENERIC_PLAYBACK_FALLBACK_MAX_MESSAGES_PER_STREAM,
  GENERIC_TRANSFORM_FALLBACK_MAX_MESSAGES_PER_STREAM,
  createEpisodePlaybackRuntime,
  createEpisodeTransformReadRuntime,
  readFrameBatches,
  readSynchronizedPlaybackBatchFallback,
  readSynchronizedWindow,
  readTransformsFallback,
  readTransformWindow,
} from "./read-policy";

const request: ReadRequest = {
  streams: ["stream"],
  window: { endNs: 10n, startNs: 0n },
};

describe("session read policy", () => {
  it("collects fallback batches in yielded order", async () => {
    const batches = [batch(2n), batch(1n)];
    const session = sessionWithBatches(batches);
    expect(await readFrameBatches(session, request)).toEqual(batches);
    expect(await readSynchronizedWindow(session, request)).toEqual(batches);
    expect(await readTransformWindow(session, request)).toEqual([
      transform("frame-1", 1n),
      transform("frame-2", 2n),
    ]);
  });

  it("prefers semantically equivalent acceleration ports", async () => {
    const synchronized = [batch(4n)];
    const transforms = [transform("fast", 4n)];
    const session = sessionWithBatches([], {
      synchronizedRead: {
        readSynchronized: vi.fn().mockResolvedValue(synchronized),
      },
      transformRead: { readTransforms: vi.fn().mockResolvedValue(transforms) },
    });

    expect(await readSynchronizedWindow(session, request)).toBe(synchronized);
    expect(await readTransformWindow(session, request)).toBe(transforms);
    expect(session.synchronizedRead?.readSynchronized).toHaveBeenCalledWith(
      request,
    );
    expect(session.transformRead?.readTransforms).toHaveBeenCalledWith(request);
  });

  it("sorts fallback transforms stably by timestamp", async () => {
    const laterFirst = transform("later-first", 2n);
    const earlier = transform("earlier", 1n);
    const laterSecond = transform("later-second", 2n);
    const session = sessionWithBatches([
      batch(2n, [laterFirst]),
      batch(1n, [earlier, laterSecond]),
    ]);

    expect(await readTransformsFallback(session, request)).toEqual([
      earlier,
      laterFirst,
      laterSecond,
    ]);
  });

  it("builds a complete playback runtime over mandatory reads", async () => {
    const read = vi.fn(async function* () {
      yield batchWithTimes([1n, 5n, 9n]);
    });
    const session = sessionWithBatches([], {}, read);
    const playback = createEpisodePlaybackRuntime(session);

    expect(playback.timeline).toEqual({
      endNs: 10n,
      startNs: 0n,
      timeDomainId: "time",
    });
    await expect(playback.readStreamTimeBounds(["stream"])).resolves.toEqual([
      {
        firstTimestampNs: 0n,
        lastTimestampNs: 10n,
        streamId: "stream",
      },
    ]);
    const windows = await playback.readSynchronizedBatch({
      streams: ["stream"],
      timeNs: [2n, 6n],
    });

    expect(windows.map((window) => window.frames[0]?.timestampNs)).toEqual([
      1n,
      5n,
    ]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("owns nearest, strict, and bounded-latest sampling semantics", async () => {
    const session = sessionWithBatches([batchWithTimes([70n, 90n, 108n])]);
    const windowFor = async (
      mode: (typeof STREAM_SYNC_MODE)[keyof typeof STREAM_SYNC_MODE],
      toleranceBeforeNs?: bigint,
      toleranceAfterNs?: bigint,
    ) =>
      (
        await readSynchronizedPlaybackBatchFallback(session, {
          streamPolicies: {
            stream: { mode, toleranceAfterNs, toleranceBeforeNs },
          },
          streams: ["stream"],
          timeNs: [100n],
        })
      )[0];

    await expect(
      windowFor(STREAM_SYNC_MODE.NEAREST, 20n, 20n),
    ).resolves.toMatchObject({
      frames: [expect.objectContaining({ timestampNs: 108n })],
    });
    await expect(windowFor(STREAM_SYNC_MODE.STRICT)).resolves.toMatchObject({
      frames: [],
    });
    await expect(
      windowFor(STREAM_SYNC_MODE.LATEST, 20n),
    ).resolves.toMatchObject({
      frames: [expect.objectContaining({ timestampNs: 90n })],
    });
  });

  it("settles generic current reads in explicit priority order", async () => {
    const streamIds = ["camera", "lidar"];
    const read = vi.fn(async function* (readRequest: ReadRequest) {
      const stream = readRequest.streams[0];
      if (!stream) return;
      yield {
        frames: [
          {
            output: { resourceHints: { transferables: [] } },
            streamId: stream,
            timestampNs: 5n,
          },
        ],
        stream,
      };
    });
    const base = sessionWithBatches([]);
    const session: EpisodeSession = {
      ...base,
      manifest: {
        ...base.manifest,
        streams: streamIds.map((id) => ({
          id,
          kind: "unknown" as const,
          payload: { encoding: "fixture" },
          sourceName: `/${id}`,
          timeRange: request.window,
        })),
      },
      read,
    };
    const deliveryGroups: string[][] = [];
    const singularDeliveries: string[] = [];

    const windows = await readSynchronizedPlaybackBatchFallback(
      session,
      { streams: streamIds, timeNs: [5n] },
      {},
      {
        onStreamSettlement: ({ stream }) => singularDeliveries.push(stream),
        onStreamSettlements: (settlements) =>
          deliveryGroups.push(settlements.map(({ stream }) => stream)),
        settlementPriorityStreams: ["lidar", "camera", "lidar", "absent"],
      },
    );

    expect(read.mock.calls.map(([readRequest]) => readRequest.streams)).toEqual(
      [["lidar"], ["camera"]],
    );
    expect(deliveryGroups).toEqual([["lidar"], ["camera"]]);
    expect(singularDeliveries).toEqual(["lidar", "camera"]);
    expect(windows[0]).toMatchObject({
      framesByStream: {
        camera: [expect.objectContaining({ timestampNs: 5n })],
        lidar: [expect.objectContaining({ timestampNs: 5n })],
      },
      timeNs: 5n,
    });
  });

  it("does not emit single-tick settlements for a multi-tick batch", async () => {
    const onStreamSettlement = vi.fn();
    const onStreamSettlements = vi.fn();

    const windows = await readSynchronizedPlaybackBatchFallback(
      longHistorySession([1n, 2n]),
      { streams: ["stream"], timeNs: [1n, 2n] },
      {},
      { onStreamSettlement, onStreamSettlements },
    );

    expect(windows).toHaveLength(2);
    expect(onStreamSettlement).not.toHaveBeenCalled();
    expect(onStreamSettlements).not.toHaveBeenCalled();
  });

  it("returns the correct latest predecessor at the generic boundary", async () => {
    const frames = Array.from(
      { length: GENERIC_PLAYBACK_FALLBACK_MAX_MESSAGES_PER_STREAM },
      (_, index) => BigInt(index),
    );
    const session = longHistorySession(frames);

    const [window] = await readSynchronizedPlaybackBatchFallback(session, {
      streams: ["stream"],
      timeNs: [BigInt(frames.length + 10)],
    });

    expect(window?.frames[0]?.timestampNs).toBe(BigInt(frames.length - 1));
    expect(session.read).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: GENERIC_PLAYBACK_FALLBACK_MAX_MESSAGES_PER_STREAM + 1,
        streams: ["stream"],
      }),
    );
  });

  it("fails explicitly instead of returning an early prefix beyond the generic playback bound", async () => {
    const frames = Array.from(
      { length: GENERIC_PLAYBACK_FALLBACK_MAX_MESSAGES_PER_STREAM + 1 },
      (_, index) => BigInt(index),
    );
    const session = longHistorySession(frames);

    await expect(
      readSynchronizedPlaybackBatchFallback(session, {
        streams: ["stream"],
        timeNs: [BigInt(frames.length + 10)],
      }),
    ).rejects.toMatchObject({
      name: "EpisodeReadUnsupportedError",
      operation: "generic-playback-fallback",
    } satisfies Partial<EpisodeReadUnsupportedError>);
  });

  it("forwards cancellation through generic playback reads", async () => {
    const controller = new AbortController();
    const session = longHistorySession([1n]);

    await readSynchronizedPlaybackBatchFallback(
      session,
      { streams: ["stream"], timeNs: [2n] },
      { signal: controller.signal },
    );

    expect(session.read).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("does not enter a generic playback read after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const session = longHistorySession([1n]);

    await expect(
      readSynchronizedPlaybackBatchFallback(
        session,
        { streams: ["stream"], timeNs: [2n] },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(session.read).not.toHaveBeenCalled();
  });

  it("rejects policies the shared runtime cannot interpret consistently", async () => {
    const session = sessionWithBatches([]);
    await expect(
      readSynchronizedPlaybackBatchFallback(session, {
        streamPolicies: {
          stream: {
            mode: STREAM_SYNC_MODE.LATEST,
            toleranceAfterNs: 1n,
          },
        },
        streams: ["stream"],
        timeNs: [5n],
      }),
    ).rejects.toThrow("toleranceAfterNs");
  });

  it("provides transform windows when the adapter has no transform port", async () => {
    const session = sessionWithBatches([batch(2n), batch(1n)]);
    const transforms = createEpisodeTransformReadRuntime(session);

    await expect(transforms.readBootstrap?.()).resolves.toEqual([]);
    await expect(transforms.readTransforms(request)).resolves.toEqual([
      transform("frame-1", 1n),
      transform("frame-2", 2n),
    ]);
  });

  it("preserves accelerated exact placement reads", async () => {
    const placement = {
      indexedWindow: { endNs: 5n, startNs: 4n },
      samples: [transform("lidar", 5n)],
    };
    const readPlacement = vi.fn().mockResolvedValue(placement);
    const session = sessionWithBatches([], {
      transformRead: {
        readPlacement,
        readTransforms: vi.fn().mockResolvedValue([]),
      },
    });
    const transforms = createEpisodeTransformReadRuntime(session);
    const placementRequest = {
      requiredDynamicChildFrameIds: ["lidar"],
      timeNs: 5n,
    };

    await expect(transforms.readPlacement?.(placementRequest)).resolves.toBe(
      placement,
    );
    expect(readPlacement).toHaveBeenCalledExactlyOnceWith(placementRequest);
  });

  it("loads timeless transform bootstrap data through mandatory reads", async () => {
    const base = sessionWithBatches([batch(2n, [transform("static")])]);
    const session: EpisodeSession = {
      ...base,
      manifest: {
        ...base.manifest,
        streams: base.manifest.streams.map((stream) => ({
          ...stream,
          kind: "transform" as const,
        })),
      },
    };
    const transforms = createEpisodeTransformReadRuntime(session);

    await expect(transforms.readBootstrap?.()).resolves.toEqual([
      transform("static"),
    ]);
  });

  it("bounds generic transform input at the complete-stream boundary", async () => {
    const boundary = transformHistorySession(
      GENERIC_TRANSFORM_FALLBACK_MAX_MESSAGES_PER_STREAM,
    );
    await expect(
      readTransformsFallback(boundary, request),
    ).resolves.toHaveLength(GENERIC_TRANSFORM_FALLBACK_MAX_MESSAGES_PER_STREAM);

    const oversized = transformHistorySession(
      GENERIC_TRANSFORM_FALLBACK_MAX_MESSAGES_PER_STREAM + 1,
    );
    await expect(
      readTransformsFallback(oversized, request),
    ).rejects.toMatchObject({
      name: "EpisodeReadUnsupportedError",
      operation: "generic-transform-fallback",
    } satisfies Partial<EpisodeReadUnsupportedError>);
  });
});

function longHistorySession(timestamps: readonly bigint[]): EpisodeSession {
  const read = vi.fn(async function* (readRequest: ReadRequest) {
    const frames = timestamps
      .filter(
        (timestampNs) =>
          timestampNs >= readRequest.window.startNs &&
          timestampNs <= readRequest.window.endNs,
      )
      .slice(0, readRequest.limit)
      .map((timestampNs, sequence) => ({
        output: { resourceHints: { transferables: [] } },
        sequence,
        streamId: "stream",
        timestampNs,
      }));
    if (frames.length > 0) yield { frames, stream: "stream" };
  });
  return {
    dispose: vi.fn(),
    manifest: {
      episodeId: "long",
      streams: [
        {
          id: "stream",
          kind: "unknown",
          payload: { encoding: "test" },
          sourceName: "stream",
          timeRange: { endNs: 10_000n, startNs: 0n },
        },
      ],
      timeDomain: { id: "time", kind: "timestamp" },
      timeRange: { endNs: 10_000n, startNs: 0n },
    },
    read,
  };
}

function transformHistorySession(messageCount: number): EpisodeSession {
  const timestamps = Array.from({ length: messageCount }, (_, index) =>
    BigInt(index),
  );
  const base = longHistorySession(timestamps);
  return {
    ...base,
    read: vi.fn(async function* (readRequest) {
      const frames = timestamps
        .slice(0, readRequest.limit)
        .map((timestampNs) => ({
          output: {
            transforms: [transform(`frame-${timestampNs}`, timestampNs)],
          },
          streamId: "stream",
          timestampNs,
        }));
      if (frames.length > 0) yield { frames, stream: "stream" };
    }),
  };
}

function sessionWithBatches(
  batches: readonly FrameBatch[],
  accelerations: Pick<
    EpisodeSession,
    "playback" | "synchronizedRead" | "transformRead"
  > = {},
  read: EpisodeSession["read"] = async function* () {
    for (const value of batches) yield value;
  },
): EpisodeSession {
  return {
    ...accelerations,
    dispose: vi.fn(),
    manifest: {
      episodeId: "episode",
      streams: [
        {
          id: "stream",
          kind: "unknown",
          payload: { encoding: "fixture" },
          sourceName: "/stream",
          timeRange: request.window,
        },
      ],
      timeDomain: { id: "time", kind: "timestamp" },
      timeRange: request.window,
    },
    read,
  };
}

function batchWithTimes(timestamps: readonly bigint[]): FrameBatch {
  return {
    frames: timestamps.map((timestampNs, sequence) => ({
      output: { resourceHints: { transferables: [] } },
      sequence,
      streamId: "stream",
      timestampNs,
    })),
    stream: "stream",
  };
}

function batch(
  timestampNs: bigint,
  transforms = [transform(`frame-${timestampNs}`, timestampNs)],
): FrameBatch {
  return {
    frames: [
      {
        output: { transforms },
        streamId: "stream",
        timestampNs,
      },
    ],
    stream: "stream",
  };
}

function transform(childFrameId: string, timestampNs?: bigint) {
  return {
    childFrameId,
    parentFrameId: "world",
    quaternion: [0, 0, 0, 1] as const,
    ...(timestampNs === undefined ? {} : { timestampNs }),
    translation: [0, 0, 0] as const,
  };
}
