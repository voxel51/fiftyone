import { describe, expect, it, vi } from "vitest";
import { STREAM_KIND } from "../../ir";
import type { ByteResources, EpisodeSource } from "../../ports";
import {
  collectBatches,
  defineEpisodeSessionContractTests,
} from "../../testing/adapter-contract";
import { createFixtureFormatAdapter } from "./fixture-adapter";

const source: EpisodeSource = {
  assets: {
    list: () => Promise.resolve([]),
    resolve: () =>
      Promise.reject(
        new Error("Fixture adapter must not resolve physical assets"),
      ),
  },
  episodeId: "fixture-episode",
};

const io: ByteResources = {
  readBytes: () =>
    Promise.reject(new Error("Fixture adapter must not read physical bytes")),
};

defineEpisodeSessionContractTests({
  createActivationPair: async () => {
    const adapter = createFixtureFormatAdapter({ latencyMs: 50 });
    return [
      await adapter.open(source, io),
      await adapter.open({ ...source, episodeId: "fixture-episode-2" }, io),
    ];
  },
  createDelayedSession: () =>
    createFixtureFormatAdapter({ latencyMs: 20 }).open(source, io),
  createPoisonedSession: async () => {
    const streamId = `fixture-${STREAM_KIND.IMAGE}`;
    return {
      session: await createFixtureFormatAdapter({
        poisonedFrame: { index: 1, streamId },
      }).open(source, io),
      streamId,
    };
  },
  createSession: () => createFixtureFormatAdapter().open(source, io),
  name: "fixture",
});

describe("fixture adapter pressure controls", () => {
  it("forwards open cancellation to asset inventory and stops before session creation", async () => {
    const controller = new AbortController();
    const list = vi.fn((options?: { readonly signal?: AbortSignal }) => {
      expect(options?.signal).toBe(controller.signal);
      controller.abort();
      return Promise.resolve([]);
    });
    const cancellableSource: EpisodeSource = {
      assets: { list, resolve: vi.fn() },
      episodeId: "fixture-cancel",
    };

    await expect(
      createFixtureFormatAdapter().open(cancellableSource, io, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(list).toHaveBeenCalledOnce();
  });

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

  it("serves selectable lightweight previews through the preview port", async () => {
    const adapter = createFixtureFormatAdapter();
    const preview = await adapter.openPreview?.(source, io);
    if (!preview) throw new Error("Fixture preview session did not open");
    try {
      const first = await preview.read();
      expect(first).toMatchObject({
        frame: { kind: "image" },
        status: "ready",
        streamId: `fixture-${STREAM_KIND.IMAGE}`,
        streamSourceName: "Fixture image",
      });
      expect(first.bootstrapManifest?.episodeId).toBe("fixture-episode");
      expect(first.bootstrapTimeline?.timeDomainId).toBe("fixture-time");
      await expect(
        preview.read({ sourceName: "Fixture point-cloud" }),
      ).resolves.toMatchObject({
        frame: { kind: "point-cloud" },
        status: "ready",
        streamId: `fixture-${STREAM_KIND.POINT_CLOUD}`,
      });
    } finally {
      preview.dispose();
    }
  });

  it("scales as a configurable-rate bounded performance source", async () => {
    const session = await createFixtureFormatAdapter({
      frameCount: 1_000,
      rateHz: 60,
      seed: 51,
    }).open(source, io);
    try {
      const image = session.manifest.streams.find(
        (stream) => stream.kind === STREAM_KIND.IMAGE,
      );
      if (!image) throw new Error("Fixture image stream is missing");
      expect(image.approxRateHz).toBe(60);
      const batches = await collectBatches(
        session.read({
          limit: 120,
          streams: [image.id],
          window: session.manifest.timeRange,
        }),
      );
      expect(batches).toHaveLength(1);
      expect(batches[0].frames).toHaveLength(120);
      expect(session.stats?.().decodedFrames).toBe(120);
    } finally {
      session.dispose();
    }
  });
});
