import { describe, expect, it, vi } from "vitest";
import { STREAM_SYNC_MODE } from "../ir";
import type { EpisodeSession, FrameBatch, ReadRequest } from "../ports";
import {
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
});

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
