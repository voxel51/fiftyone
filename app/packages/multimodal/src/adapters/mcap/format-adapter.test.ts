import { create } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";
import { PlaybackSyncMode, StreamInventorySchema } from "../../schemas/v1";
import { SCENE_SOURCE_METADATA } from "../../ir";
import type { ByteResources, EpisodeSource } from "../../ports";
import {
  defineEpisodeSessionContractTests,
  collectBatches,
} from "../../testing/adapter-contract";
import { createMcapFormatAdapter, createMcapManifest } from "./format-adapter";
import { McapBoundedReadCancelledError } from "./reader";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapDecodedMessage,
  type McapRawMessageRecordResult,
  type McapReadSynchronizedMessageBatchRequest,
  type McapResourceClient,
  type McapSynchronizedMessageWindow,
  type McapTopicNumericFields,
} from "./contracts/index";
import type { McapGridPreviewResult } from "./resource-client/grid-preview";

const sourceDescriptor = {
  sourceId: "fixture.mcap",
  url: "memory://fixture.mcap",
};

const source: EpisodeSource = {
  assets: {
    list: async () => [
      { id: "recording", mediaType: "application/x-mcap", role: "recording" },
    ],
    resolve: async () => sourceDescriptor,
  },
  episodeId: "mcap-contract",
};

const io: ByteResources = {
  readBytes: vi.fn(),
};

defineEpisodeSessionContractTests({
  createSession: () =>
    createMcapFormatAdapter({ createClient: createClient }).open(source, io),
  name: "MCAP",
});

describe("MCAP format adapter", () => {
  it("activates the source before uncached bootstrap reads", async () => {
    const calls: string[] = [];
    const client = createClient();
    client.activateSource = vi.fn(() => calls.push("activate"));
    vi.mocked(client.readTimelineRange).mockImplementation(async () => {
      calls.push("timeline");
      return {
        activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
        endTimeNs: 2n,
        startTimeNs: 1n,
      };
    });
    vi.mocked(client.readTopics).mockImplementation(async () => {
      calls.push("topics");
      return [];
    });

    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(source, io);

    expect(calls).toEqual(["activate", "timeline", "topics"]);
    session.dispose();
  });

  it("forwards seek-runway cancellation to the resource client", async () => {
    const client = createClient();
    client.cancelRunwayReads = vi.fn();
    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(source, io);

    session.cancelRunway?.();

    expect(client.cancelRunwayReads).toHaveBeenCalledOnce();
    session.dispose();
  });

  it("does not claim ownership when an abandoned open finishes resolving", async () => {
    const controller = new AbortController();
    const client = createClient();
    client.activateSource = vi.fn();
    const createClientForOpen = vi.fn(() => client);
    const cancelledSource: EpisodeSource = {
      ...source,
      assets: {
        ...source.assets,
        resolve: async () => {
          controller.abort();
          return sourceDescriptor;
        },
      },
    };

    await expect(
      createMcapFormatAdapter({
        createClient: createClientForOpen,
      }).open(cancelledSource, io, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "EpisodeReadCancelledError" });
    expect(createClientForOpen).not.toHaveBeenCalled();
    expect(client.activateSource).not.toHaveBeenCalled();
  });

  it("forwards open cancellation through asset resolution and inventory", async () => {
    const controller = new AbortController();
    const client = createClient();
    const list = vi.fn(async () => [
      { id: "recording", mediaType: "application/x-mcap", role: "recording" },
    ]);
    const resolve = vi.fn(async () => sourceDescriptor);
    const cancellableSource: EpisodeSource = {
      assets: { list, resolve },
      episodeId: "mcap-cancellable-open",
    };

    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(cancellableSource, io, { signal: controller.signal });

    expect(list).toHaveBeenCalledWith({ signal: controller.signal });
    expect(resolve).toHaveBeenCalledWith("recording", {
      signal: controller.signal,
    });
    expect(client.readTimelineRange).toHaveBeenCalledWith(expect.any(Object), {
      signal: controller.signal,
    });
    expect(client.readTopics).toHaveBeenCalledWith(expect.any(Object), {
      signal: controller.signal,
    });
    session.dispose();
  });

  it("forwards prewarm cancellation into asset inventory", async () => {
    const controller = new AbortController();
    const resolve = vi.fn();
    const prewarmSource: EpisodeSource = {
      assets: {
        list: vi.fn(async (options) => {
          expect(options?.signal).toBe(controller.signal);
          controller.abort();
          return [];
        }),
        resolve,
      },
      episodeId: "mcap-prewarm-cancel",
    };

    await expect(
      createMcapFormatAdapter({ createClient }).prewarm?.(prewarmSource, io, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "EpisodeReadCancelledError" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("names streams as topics for the shared viewer", async () => {
    const session = await createMcapFormatAdapter({
      createClient,
    }).open(source, io);
    try {
      expect(session.terminology?.stream).toEqual({
        plural: "topics",
        singular: "topic",
      });
    } finally {
      session.dispose();
    }
  });

  it("stores only valid episode-average topic rates", () => {
    const topic = (recordCount?: string) =>
      create(StreamInventorySchema, {
        displayName: "/camera",
        metadata: { "mcap.topic": "/camera" },
        ...(recordCount !== undefined ? { recordCount } : {}),
        streamId: "camera",
      });
    const rateFor = (
      range: { readonly endTimeNs: bigint; readonly startTimeNs: bigint },
      recordCount?: string,
    ) =>
      createMcapManifest("episode", range, [topic(recordCount)]).streams[0]
        ?.approxRateHz;

    expect(
      rateFor({ endTimeNs: 10_000_000_000n, startTimeNs: 0n }, "300"),
    ).toBe(30);
    expect(rateFor({ endTimeNs: 1n, startTimeNs: 1n }, "300")).toBeUndefined();
    expect(rateFor({ endTimeNs: 0n, startTimeNs: 1n }, "300")).toBeUndefined();
    expect(
      rateFor({ endTimeNs: 10_000_000_000n, startTimeNs: 0n }, "invalid"),
    ).toBeUndefined();
    expect(
      rateFor({ endTimeNs: 10_000_000_000n, startTimeNs: 0n }),
    ).toBeUndefined();
  });

  it("shares one cumulative bounded-read allowance across jobs", async () => {
    const client = createClient();
    const continuation = { cursor: 1 };
    vi.mocked(client.readBoundedMessages).mockResolvedValue({
      continuation,
      coverageByTopic: new Map([["/camera", [{ endNs: 1n, startNs: 1n }]]]),
      messages: [
        {
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          channelId: 1,
          decoded: {
            decoderId: "fixture",
            decoderVersion: "1",
            output: { resourceHints: { transferables: [] } },
            payload: { encoding: "fixture" },
          },
          logTimeNs: 1n,
          publishTimeNs: 2n,
          sequence: 7,
          timelineTimeNs: 1n,
          topic: "/camera",
        },
      ],
      resumeAtNs: 2n,
      stopReason: "horizon-reached",
      usage: {
        chunksOpened: 1,
        decompressedBytes: 300,
        decompressionCacheHits: 0,
        elapsedMs: 10,
        logicalSourceBytes: 100,
        logicalUncompressedBytes: 300,
        messagesDecoded: 1,
        transferredBytes: 100,
      },
    });
    const session = await createMcapFormatAdapter({
      boundedChunksPerGrant: 2,
      boundedChunksPerSource: 4,
      createClient: () => client,
    }).open(source, io);
    const allowance = {
      maxMessages: 10,
      maxSourceBytes: 1_000,
      maxUncompressedBytes: 3_000,
      maxWallTimeMs: 1_000,
    };
    const account = session.boundedRead?.openAccount(allowance);
    const grant = {
      maxMessages: 5,
      maxSourceBytes: 500,
      maxUncompressedBytes: 1_500,
      maxWallTimeMs: 500,
    };

    const result = await account?.createJob().read({
      admissionEndNs: 1n,
      budget: grant,
      streams: ["camera"],
      window: { endNs: 2n, startNs: 1n },
    });

    expect(result?.batches).toHaveLength(1);
    expect(result?.continuation).toBe(continuation);
    expect(result?.resumeAtNs).toBe(2n);
    expect(result?.coverageByStream.get("camera")).toEqual([
      { endNs: 1n, startNs: 1n },
    ]);
    expect(client.readBoundedMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        admissionEndNs: 1n,
        endTimeNs: 2n,
        startTimeNs: 1n,
      }),
      expect.objectContaining({ priority: "bulk" }),
    );
    expect(account?.remaining()).toEqual({
      maxMessages: 9,
      maxSourceBytes: 900,
      maxUncompressedBytes: 2_700,
      maxWallTimeMs: 990,
    });
    const cacheWarmReservation = account?.reserve({
      maxMessages: 0,
      maxSourceBytes: 200,
      maxUncompressedBytes: 0,
      maxWallTimeMs: 100,
    });
    cacheWarmReservation?.commit(
      {
        chunksOpened: 0,
        decompressedBytes: 0,
        decompressionCacheHits: 0,
        elapsedMs: 5,
        logicalSourceBytes: 100,
        logicalUncompressedBytes: 0,
        messagesDecoded: 0,
        transferredBytes: 0,
      },
      { exact: true },
    );
    expect(account?.remaining()).toEqual({
      maxMessages: 9,
      maxSourceBytes: 800,
      maxUncompressedBytes: 2_700,
      maxWallTimeMs: 985,
    });
    expect(
      account?.reserve({
        maxMessages: 0,
        maxSourceBytes: 801,
        maxUncompressedBytes: 0,
        maxWallTimeMs: 0,
      }),
    ).toBeUndefined();
    expect(() =>
      session.boundedRead?.openAccount({
        ...allowance,
        maxSourceBytes: 2_000,
      }),
    ).toThrow("already open");
    session.dispose();
  });

  it("retains a cancelled grant after receiving partial usage", async () => {
    const client = createClient();
    const partialUsage = {
      chunksOpened: 1,
      decompressedBytes: 300,
      decompressionCacheHits: 0,
      elapsedMs: 12,
      logicalSourceBytes: 200,
      logicalUncompressedBytes: 600,
      messagesDecoded: 2,
      transferredBytes: 128,
    };
    vi.mocked(client.readBoundedMessages).mockRejectedValue(
      new McapBoundedReadCancelledError(partialUsage),
    );
    const session = await createMcapFormatAdapter({
      boundedChunksPerGrant: 2,
      boundedChunksPerSource: 4,
      createClient: () => client,
    }).open(source, io);
    const account = session.boundedRead?.openAccount({
      maxMessages: 10,
      maxSourceBytes: 1_000,
      maxUncompressedBytes: 3_000,
      maxWallTimeMs: 1_000,
    });

    await expect(
      account?.createJob().read({
        budget: {
          maxMessages: 5,
          maxSourceBytes: 500,
          maxUncompressedBytes: 1_500,
          maxWallTimeMs: 500,
        },
        streams: ["camera"],
        window: { endNs: 2n, startNs: 1n },
      }),
    ).rejects.toMatchObject({ name: "EpisodeReadCancelledError" });

    expect(account?.remaining()).toEqual({
      maxMessages: 5,
      maxSourceBytes: 500,
      maxUncompressedBytes: 1_500,
      maxWallTimeMs: 500,
    });
    session.dispose();
  });

  it("cancels after completed physical work without committing a continuation", async () => {
    const client = createClient();
    const controller = new AbortController();
    const completedUsage = {
      chunksOpened: 1,
      decompressedBytes: 0,
      decompressionCacheHits: 1,
      elapsedMs: 8,
      logicalSourceBytes: 200,
      logicalUncompressedBytes: 600,
      messagesDecoded: 0,
      transferredBytes: 0,
    };
    vi.mocked(client.readBoundedMessages).mockImplementation(async () => {
      controller.abort();
      return {
        continuation: { cursor: 2 },
        coverageByTopic: new Map(),
        messages: [],
        stopReason: "budget-exhausted",
        usage: completedUsage,
      };
    });
    const session = await createMcapFormatAdapter({
      boundedChunksPerGrant: 1,
      boundedChunksPerSource: 2,
      createClient: () => client,
    }).open(source, io);
    const account = session.boundedRead?.openAccount({
      maxMessages: 10,
      maxSourceBytes: 1_000,
      maxUncompressedBytes: 3_000,
      maxWallTimeMs: 1_000,
    });

    await expect(
      account?.createJob().read({
        budget: {
          maxMessages: 5,
          maxSourceBytes: 500,
          maxUncompressedBytes: 1_500,
          maxWallTimeMs: 500,
        },
        signal: controller.signal,
        streams: ["camera"],
        window: { endNs: 2n, startNs: 1n },
      }),
    ).rejects.toMatchObject({ name: "EpisodeReadCancelledError" });
    expect(account?.remaining()).toEqual({
      maxMessages: 5,
      maxSourceBytes: 500,
      maxUncompressedBytes: 1_500,
      maxWallTimeMs: 500,
    });
    session.dispose();
  });

  it("suppresses a bounded result completed after its source session is disposed", async () => {
    const client = createClient();
    let resolveRead:
      | ((
          value: Awaited<ReturnType<typeof client.readBoundedMessages>>,
        ) => void)
      | undefined;
    vi.mocked(client.readBoundedMessages).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const session = await createMcapFormatAdapter({
      boundedChunksPerGrant: 1,
      boundedChunksPerSource: 2,
      createClient: () => client,
    }).open(source, io);
    const read = session.boundedRead
      ?.openAccount({
        maxMessages: 10,
        maxSourceBytes: 1_000,
        maxUncompressedBytes: 3_000,
        maxWallTimeMs: 1_000,
      })
      .createJob()
      .read({
        budget: {
          maxMessages: 5,
          maxSourceBytes: 500,
          maxUncompressedBytes: 1_500,
          maxWallTimeMs: 500,
        },
        streams: ["camera"],
        window: { endNs: 2n, startNs: 1n },
      });

    session.dispose();
    resolveRead?.({
      coverageByTopic: new Map(),
      messages: [],
      stopReason: "budget-exhausted",
      usage: {
        chunksOpened: 1,
        decompressedBytes: 0,
        decompressionCacheHits: 1,
        elapsedMs: 5,
        logicalSourceBytes: 100,
        logicalUncompressedBytes: 300,
        messagesDecoded: 0,
        transferredBytes: 0,
      },
    });

    await expect(read).rejects.toMatchObject({
      name: "EpisodeReadCancelledError",
    });
  });

  it("opens from grid bootstrap hints without repeating inventory reads", async () => {
    const client = createClient();
    const manifest = createMcapManifest(
      "mcap-contract",
      { endTimeNs: 2n, startTimeNs: 1n },
      await client.readTopics({ source: sourceDescriptor }),
    );
    vi.mocked(client.readTopics).mockClear();
    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(
      {
        ...source,
        manifestHint: manifest,
        playbackHint: {
          byteTimeline: [
            {
              cumulativeCompressedBytes: 32,
              endTimeNs: 2n,
              startOffsetBytes: 0n,
            },
          ],
          endNs: 2n,
          startNs: 1n,
          timeDomainId: MCAP_ACTIVE_TIMELINE.LOG,
        },
      },
      io,
    );

    expect(client.readTimelineRange).not.toHaveBeenCalled();
    expect(client.readTopics).not.toHaveBeenCalled();
    expect(session.playback?.timeline.byteTimeline).toHaveLength(1);
    session.dispose();
  });

  it("selects a preview by stable source name before channel ids are known", async () => {
    const request = vi.fn(
      async (): Promise<McapGridPreviewResult> => ({
        bootstrapTimelineRange: {
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          endTimeNs: 2n,
          startTimeNs: 1n,
        },
        bootstrapTopics: [
          create(StreamInventorySchema, {
            displayName: "/camera/front",
            metadata: { "mcap.topic": "/camera/front" },
            payload: { encoding: "ros2", schema: "sensor_msgs/msg/Image" },
            recordCount: "1",
            streamId: "7",
          }),
        ],
        state: {
          error: null,
          frame: null,
          hasPreviewTopics: true,
          streamTopic: "/camera/front",
          streamTopics: ["/camera/front"],
          status: "empty",
        },
      }),
    );
    const pool = {
      acquire: vi.fn(),
      release: vi.fn(),
      request,
    };
    const adapter = createMcapFormatAdapter({
      getPreviewPool: () => pool,
    });
    const preview = await adapter.openPreview?.(source, io);
    if (!preview) throw new Error("Expected MCAP preview support");

    const result = await preview.read({ sourceName: "/camera/front" });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ selectedStreamTopic: "/camera/front" }),
      expect.any(Object),
    );
    expect(result).toMatchObject({
      bootstrapTimeline: { endNs: 2n, startNs: 1n },
      streamId: "7",
      streamSourceName: "/camera/front",
      streamSourceNames: ["/camera/front"],
    });
    preview.dispose();
    expect(pool.release).toHaveBeenCalledTimes(1);
  });

  it("normalizes adapter metadata references to stable stream IDs", () => {
    const manifest = createMcapManifest(
      "episode",
      { endTimeNs: 2n, startTimeNs: 1n },
      [
        create(StreamInventorySchema, {
          displayName: "/camera/image",
          metadata: {
            "mcap.topic": "/camera/image",
            [SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID]: "/camera/info",
          },
          streamId: "7",
        }),
        create(StreamInventorySchema, {
          displayName: "/camera/info",
          metadata: { "mcap.topic": "/camera/info" },
          streamId: "8",
        }),
      ],
    );

    expect(manifest.streams[0]).toMatchObject({
      id: "7",
      metadata: {
        [SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID]: "8",
      },
      sourceName: "/camera/image",
    });
  });

  it("maps topic identity and source timestamps into the shared frame IR", async () => {
    const session = await createMcapFormatAdapter({
      createClient,
    }).open(source, io);
    try {
      const batches = await collectBatches(
        session.read({
          streams: ["camera"],
          window: session.manifest.timeRange,
        }),
      );
      expect(batches).toEqual([
        expect.objectContaining({
          stream: "camera",
          frames: [
            expect.objectContaining({
              recordId: "indexed-record:camera:1",
              sequence: 7,
              sourceTimestamps: {
                logTime: 1n,
                publishTime: 2n,
              },
              streamId: "camera",
              timestampNs: 1n,
            }),
          ],
        }),
      ]);
    } finally {
      session.dispose();
    }
  });

  it("exposes numeric-series and raw-record semantic capabilities", async () => {
    const client = createClient();
    client.readNumericSeriesSlice = vi.fn(async () => ({
      baseTimeNs: 1n,
      coverageByTopic: new Map([["/camera", [{ endNs: 1n, startNs: 1n }]]]),
      series: [],
      skippedByTopic: new Map([["/camera", [{ endNs: 2n, startNs: 2n }]]]),
      stopReason: "oversized-source-unit" as const,
      usage: {
        chunksOpened: 0,
        decompressedBytes: 0,
        decompressionCacheHits: 0,
        elapsedMs: 1,
        logicalSourceBytes: 0,
        logicalUncompressedBytes: 0,
        messagesDecoded: 0,
        transferredBytes: 0,
      },
    }));
    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(source, io);
    try {
      await expect(
        session.numericSeries?.enumerateNumericFields(),
      ).resolves.toEqual([
        {
          availability: "ready",
          encoding: "json",
          fields: [{ path: "exposure", valueType: "double" }],
          sampled: undefined,
          sourceName: "/camera",
          streamId: "camera",
        },
      ]);
      await expect(
        session.numericSeries?.readNumericSeries({
          fields: ["exposure"],
          stream: "camera",
          window: session.manifest.timeRange,
        }),
      ).resolves.toEqual({
        baseTimeNs: 1n,
        fields: [
          {
            path: "exposure",
            timesSec: new Float64Array([0, 0.000000001]),
            values: new Float64Array([3, 4]),
          },
        ],
        sampleCount: 2,
        streamId: "camera",
        truncated: false,
      });
      const budget = {
        maxMessages: 10,
        maxSourceBytes: 1_000,
        maxUncompressedBytes: 1_000,
        maxWallTimeMs: 100,
      };
      const slice = await session.numericSeries?.readNumericSeriesSlice?.({
        absoluteBudget: budget,
        absoluteMaxChunks: 2,
        budget,
        maxChunks: 1,
        selections: [{ fields: ["exposure"], stream: "camera" }],
        window: session.manifest.timeRange,
      });
      expect(slice?.coverageByStream.get("camera")).toEqual([
        { endNs: 1n, startNs: 1n },
      ]);
      expect(slice?.unavailableByStream?.get("camera")).toEqual([
        { endNs: 2n, startNs: 2n },
      ]);
      await expect(session.rawRecords?.listRawRecordStreams()).resolves.toEqual(
        [
          {
            encoding: "unknown",
            sampleCount: 1,
            schemaName: null,
            sourceName: "/camera",
            streamId: "camera",
          },
        ],
      );
      await expect(
        session.rawRecords?.readRawRecord({
          stream: "camera",
          timestampNs: 1n,
        }),
      ).resolves.toMatchObject({
        sourceName: "/camera",
        status: "empty",
        streamId: "camera",
      });
    } finally {
      session.dispose();
    }
  });

  it("forwards per-call cancellation to raw and point-cloud capabilities", async () => {
    const client = createClient();
    client.readPointCloudChannel = vi.fn(async () => ({}) as never);
    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(source, io);
    const controller = new AbortController();
    try {
      await session.rawRecords?.listRawRecordStreams({
        signal: controller.signal,
      });
      await session.rawRecords?.readRawRecord({
        signal: controller.signal,
        stream: "camera",
        timestampNs: 1n,
      });
      await session.pointCloudProjection?.readChannel({
        activeColorBy: "ring",
        capacity: 1,
        sampledPointCount: 1,
        samplePlanKey: "1:1",
        signal: controller.signal,
        sourceIndices: new Uint32Array([0]),
        stream: "camera",
        timestampNs: 1n,
      });

      expect(client.readTopics).toHaveBeenLastCalledWith(expect.any(Object), {
        signal: controller.signal,
      });
      expect(client.readRawMessageRecord).toHaveBeenCalledWith(
        expect.any(Object),
        { signal: controller.signal },
      );
      expect(client.readPointCloudChannel).toHaveBeenCalledWith(
        expect.any(Object),
        { signal: controller.signal },
      );
    } finally {
      session.dispose();
    }
  });
});

function createClient(): McapResourceClient {
  const message: McapDecodedMessage = {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    channelId: 1,
    decoded: {
      decoderId: "fixture",
      decoderVersion: "1",
      output: { resourceHints: { transferables: [] } },
      payload: { encoding: "fixture" },
    },
    logTimeNs: 1n,
    publishTimeNs: 2n,
    recordId: "indexed-record:camera:1",
    sequence: 7,
    timelineTimeNs: 1n,
    topic: "/camera",
  };
  return {
    dispose: vi.fn(),
    enumerateNumericFields: vi.fn(
      async (): Promise<readonly McapTopicNumericFields[]> => [
        {
          availability: "ready",
          encoding: "json",
          fields: [{ path: "exposure", valueType: "double" }],
          topic: "/camera",
        },
      ],
    ),
    readBoundedMessages: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      yield message;
    }),
    readFrameTransformBootstrap: vi.fn(async () => ({ samples: [] })),
    readFrameTransformWindow: vi.fn(async () => ({ samples: [] })),
    readSynchronizedMessages: vi.fn(async (request) => ({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: request.timeNs,
      messages: [message],
      messagesByTopic: { [message.topic]: [message] },
      startTimeNs: request.timeNs,
      streamPolicies: Object.fromEntries(
        request.topics.map((topic: string) => [
          topic,
          {
            endTimeNs: request.timeNs,
            limit: 1,
            mode: PlaybackSyncMode.LATEST,
          },
        ]),
      ),
      timeNs: request.timeNs,
    })),
    readSynchronizedMessageBatch: vi.fn(
      async (
        request: McapReadSynchronizedMessageBatchRequest,
      ): Promise<readonly McapSynchronizedMessageWindow[]> =>
        request.timeNs.map((timeNs) => ({
          activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
          endTimeNs: timeNs,
          messages: [message],
          messagesByTopic: { [message.topic]: [message] },
          startTimeNs: timeNs,
          streamPolicies: Object.fromEntries(
            request.topics.map((topic: string) => [
              topic,
              {
                endTimeNs: timeNs,
                limit: 1,
                mode: PlaybackSyncMode.LATEST,
              },
            ]),
          ),
          timeNs,
        })),
    ),
    readTimelineRange: vi.fn(async () => ({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: 2n,
      startTimeNs: 1n,
    })),
    readTopicTimeBounds: vi.fn(async () => [
      {
        firstMessageTimeNs: 1n,
        lastMessageTimeNs: 2n,
        topic: "/camera",
      },
    ]),
    readTopics: vi.fn(async () => [
      create(StreamInventorySchema, {
        displayName: "Camera",
        metadata: { "mcap.topic": "/camera" },
        payload: { encoding: "ros2", schema: "sensor_msgs/msg/Image" },
        recordCount: "1",
        streamId: "camera",
      }),
    ]),
    readNumericSeries: vi.fn(async () => ({
      baseTimeNs: 1n,
      fields: [
        {
          path: "exposure",
          timesSec: new Float64Array([0, 0.000000001]),
          values: new Float64Array([3, 4]),
        },
      ],
      messageCount: 2,
      topic: "/camera",
      truncated: false,
    })),
    readRawMessageRecord: vi.fn(
      async (): Promise<McapRawMessageRecordResult> => ({
        messageEncoding: "json",
        schemaName: null,
        status: "empty",
        topic: "/camera",
        validFromNs: 1n,
        validUntilNs: 2n,
      }),
    ),
  };
}
