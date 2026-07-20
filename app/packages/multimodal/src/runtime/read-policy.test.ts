import { describe, expect, it, vi } from "vitest";
import type { EpisodeSession, FrameBatch, ReadRequest } from "../ports";
import {
  readFrameBatches,
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
});

function sessionWithBatches(
  batches: readonly FrameBatch[],
  accelerations: Pick<
    EpisodeSession,
    "synchronizedRead" | "transformRead"
  > = {},
): EpisodeSession {
  return {
    ...accelerations,
    dispose: vi.fn(),
    manifest: {
      episodeId: "episode",
      streams: [],
      timeDomain: { id: "time", kind: "timestamp" },
      timeRange: request.window,
    },
    async *read() {
      for (const value of batches) yield value;
    },
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

function transform(childFrameId: string, timestampNs: bigint) {
  return {
    childFrameId,
    parentFrameId: "world",
    quaternion: [0, 0, 0, 1] as const,
    timestampNs,
    translation: [0, 0, 0] as const,
  };
}
