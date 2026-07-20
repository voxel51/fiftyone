import { describe, expect, it } from "vitest";
import { STREAM_KIND } from "../../ir";
import {
  isEpisodeReadCancelledError,
  type ByteResources,
  type EpisodeSource,
  type ReadRequest,
} from "../../ports";
import {
  collectBatches,
  defineEpisodeSessionContractTests,
} from "../../testing/adapter-contract";
import {
  readSynchronizedFallback,
  readSynchronizedWindow,
  readTransformsFallback,
  readTransformWindow,
} from "../../runtime";
import { createFixtureFormatAdapter } from "./fixture-adapter";

const source: EpisodeSource = {
  assets: {
    list: async () => [],
    resolve: async () => {
      throw new Error("Fixture adapter must not resolve physical assets");
    },
  },
  episodeId: "fixture-episode",
};

const io = {
  readBytes: async () => {
    throw new Error("Fixture adapter must not read physical bytes");
  },
} as unknown as ByteResources;

defineEpisodeSessionContractTests({
  createSession: () => createFixtureFormatAdapter().open(source, io),
  name: "fixture",
});

describe("fixture adapter pressure controls", () => {
  it("covers every stream kind", async () => {
    const session = await createFixtureFormatAdapter().open(source, io);
    try {
      expect(
        new Set(session.manifest.streams.map((stream) => stream.kind)),
      ).toEqual(new Set(Object.values(STREAM_KIND)));
    } finally {
      session.dispose();
    }
  });

  it("prioritizes current and playback work over queued idle work", async () => {
    const session = await createFixtureFormatAdapter({ latencyMs: 5 }).open(
      source,
      io,
    );
    const stream = session.manifest.streams[0].id;
    const completion: string[] = [];
    const request = (priority: ReadRequest["priority"]) =>
      collectBatches(
        session.read({
          priority,
          streams: [stream],
          window: session.manifest.timeRange,
        }),
      ).then(() => completion.push(priority ?? "playback"));
    try {
      await Promise.all([request("idle"), request("current")]);
      expect(completion).toEqual(["current", "idle"]);
    } finally {
      session.dispose();
    }
  });

  it("cancels queued and in-flight idle work on seek", async () => {
    const session = await createFixtureFormatAdapter({ latencyMs: 50 }).open(
      source,
      io,
    );
    const iterator = session
      .read({
        priority: "idle",
        streams: [session.manifest.streams[0].id],
        window: session.manifest.timeRange,
      })
      [Symbol.asyncIterator]();
    const pending = iterator.next();
    session.cancelIdle?.();
    await expect(pending).rejects.toSatisfy(isEpisodeReadCancelledError);
    session.dispose();
  });

  it("does not cancel current work when idle work is discarded", async () => {
    const session = await createFixtureFormatAdapter({ latencyMs: 5 }).open(
      source,
      io,
    );
    const pending = collectBatches(
      session.read({
        priority: "current",
        streams: [session.manifest.streams[0].id],
        window: session.manifest.timeRange,
      }),
    );
    session.cancelIdle?.();
    await expect(pending).resolves.toHaveLength(1);
    session.dispose();
  });

  it("activation fail-fasts the previous session's pending reads", async () => {
    const adapter = createFixtureFormatAdapter({ latencyMs: 50 });
    const first = await adapter.open(source, io);
    const second = await adapter.open(
      { ...source, episodeId: "fixture-episode-2" },
      io,
    );
    first.activate?.();
    const pending = first
      .read({
        streams: [first.manifest.streams[0].id],
        window: first.manifest.timeRange,
      })
      [Symbol.asyncIterator]()
      .next();
    second.activate?.();
    await expect(pending).rejects.toSatisfy(isEpisodeReadCancelledError);
    first.dispose();
    second.dispose();
  });

  it("contains injected decode failures as frame diagnostics", async () => {
    const streamId = `fixture-${STREAM_KIND.IMAGE}`;
    const session = await createFixtureFormatAdapter({
      poisonedFrame: { index: 1, streamId },
    }).open(source, io);
    try {
      const batches = await collectBatches(
        session.read({
          streams: [streamId],
          window: session.manifest.timeRange,
        }),
      );
      expect(batches[0].frames[1].output.diagnostics).toEqual([
        expect.objectContaining({ code: "fixture-decode-failed" }),
      ]);
    } finally {
      session.dispose();
    }
  });

  it("does not advance production beyond a stalled consumer", async () => {
    const session = await createFixtureFormatAdapter().open(source, io);
    const iterator = session
      .read({
        streams: session.manifest.streams.map((stream) => stream.id),
        window: session.manifest.timeRange,
      })
      [Symbol.asyncIterator]();
    try {
      await iterator.next();
      expect(session.stats?.().returnedBatches).toBe(1);
    } finally {
      await iterator.return?.();
      session.dispose();
    }
  });

  it("keeps adapter accelerations equivalent to runtime fallbacks", async () => {
    const session = await createFixtureFormatAdapter().open(source, io);
    const request: ReadRequest = {
      streams: session.manifest.streams.map((stream) => stream.id),
      window: session.manifest.timeRange,
    };
    try {
      expect(await readSynchronizedWindow(session, request)).toEqual(
        await readSynchronizedFallback(session, request),
      );
      expect(await readTransformWindow(session, request)).toEqual(
        await readTransformsFallback(session, request),
      );
    } finally {
      session.dispose();
    }
  });
});
