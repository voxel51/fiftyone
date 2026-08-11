import { create } from "@bufbuild/protobuf";
import { Quaternion, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlaybackSyncMode,
  StreamInventorySchema,
  type StreamInventory,
} from "../../schemas/v1";
import {
  BYTE_SOURCE_READ_PROFILE,
  SCENE_SOURCE_METADATA,
  STREAM_METADATA,
  type EpisodeRecordingFacts,
} from "../../ir";
import type {
  ByteResources,
  EpisodeSource,
  ReadContinuation,
} from "../../ports";
import {
  defineEpisodeSessionContractTests,
  collectBatches,
} from "../../testing/adapter-contract";
import {
  createMcapFormatAdapter,
  createMcapManifest,
  createMcapRawRecordCapability,
} from "./format-adapter";
import {
  initMcapCostDebugBridge,
  resetMcapCostDebugForTests,
} from "./instrumentation/host/mcap-cost-debug";
import { McapBoundedReadCancelledError } from "./reader";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapDecodedMessage,
  type McapRawMessageRecordResult,
  type McapRecordingInventory,
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

function recordingInventory(
  streams: readonly StreamInventory[],
  recordingFacts: EpisodeRecordingFacts = { format: "mcap" },
): McapRecordingInventory {
  return { recordingFacts, streams };
}

const io: ByteResources = {
  readBytes: vi.fn(),
};

afterEach(() => {
  window.history.replaceState(null, "", "/");
  resetMcapCostDebugForTests();
});

defineEpisodeSessionContractTests({
  createSession: () =>
    createMcapFormatAdapter({ createClient: createClient }).open(source, io),
  name: "MCAP",
});

describe("MCAP format adapter", () => {
  it("assembles source-consistent common and application support facts", () => {
    const manifest = createMcapManifest(
      "episode",
      { endTimeNs: 40_000_000_000n, startTimeNs: 10_000_000_000n },
      recordingInventory(
        [
          create(StreamInventorySchema, {
            metadata: { "mcap.topic": "/camera" },
            payload: {
              encoding: "cdr",
              schema: "sensor_msgs/msg/Image",
            },
            streamId: "1",
          }),
          create(StreamInventorySchema, {
            metadata: {
              "mcap.topic": "/state",
              [STREAM_METADATA.DECODE_STATUS]: "decodable",
            },
            payload: { encoding: "json", schema: "example.State" },
            streamId: "2",
          }),
          create(StreamInventorySchema, {
            metadata: {
              "mcap.topic": "/opaque",
              [STREAM_METADATA.DECODE_STATUS]: "schema-unavailable",
            },
            payload: { encoding: "cdr" },
            streamId: "3",
          }),
        ],
        {
          channelCount: 3,
          format: "mcap",
          messageCount: "9007199254740993123",
          schemaCount: 2,
          topicCount: 3,
        },
      ),
      {
        readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
        sizeBytes: "2845415834",
      },
    );

    expect(manifest.recordingFacts).toEqual({
      applicationSupport: {
        inspectableStreamCount: 1,
        renderableStreamCount: 1,
        unavailableStreamCount: 1,
      },
      channelCount: 3,
      durationNs: "30000000000",
      endTimeNs: "40000000000",
      format: "mcap",
      messageCount: "9007199254740993123",
      readProfile: "remote",
      schemaCount: 2,
      sizeBytes: "2845415834",
      startTimeNs: "10000000000",
      topicCount: 3,
    });
  });

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
      return recordingInventory([]);
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

  it("exposes demand-driven bounded transform topology and maps topic identities", async () => {
    const client = createClient();
    const continuation = { cursor: 1 } as ReadContinuation;
    vi.mocked(client.readTopics).mockResolvedValue(
      recordingInventory([
        create(StreamInventorySchema, {
          displayName: "/tf",
          metadata: { "mcap.topic": "/tf" },
          payload: { encoding: "ros2", schema: "tf2_msgs/msg/TFMessage" },
          recordCount: "10",
          streamId: "tf",
        }),
        create(StreamInventorySchema, {
          displayName: "/points",
          metadata: { "mcap.topic": "/points" },
          payload: {
            encoding: "ros2",
            schema: "sensor_msgs/msg/PointCloud2",
          },
          recordCount: "10",
          streamId: "points",
        }),
      ]),
    );
    const topologyUsage = {
      chunksOpened: 1,
      decompressedBytes: 1_024,
      decompressionCacheHits: 0,
      elapsedMs: 3,
      logicalSourceBytes: 512,
      logicalUncompressedBytes: 1_024,
      messagesDecoded: 5,
      transferredBytes: 512,
    };
    client.readTransformTopology = vi
      .fn()
      .mockResolvedValueOnce({
        continuation,
        coverageByTopic: new Map([["/tf", [{ endNs: 1n, startNs: 1n }]]]),
        edges: [
          {
            childFrameId: "lidar",
            kind: "temporal" as const,
            occurrenceCount: 4,
            parentFrameId: "base_link",
            sourceName: "/tf",
            sourceStreamId: "/tf",
          },
        ],
        frameUses: [
          {
            frameId: "lidar",
            sourceName: "/points",
            streamId: "/points",
          },
        ],
        stopReason: "budget-exhausted" as const,
        usage: topologyUsage,
      })
      .mockResolvedValueOnce({
        coverageByTopic: new Map([["/tf", [{ endNs: 2n, startNs: 2n }]]]),
        edges: [],
        frameUses: [
          {
            frameId: "lidar",
            sourceName: "/points",
            streamId: "/points",
          },
          {
            frameId: "camera",
            sourceName: "/camera",
            streamId: "/camera",
          },
        ],
        stopReason: "source-exhausted" as const,
        usage: topologyUsage,
      });
    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(source, io);
    try {
      expect(session.transformTopology).toBeDefined();
      expect(client.readTransformTopology).not.toHaveBeenCalled();

      const budget = {
        maxMessages: 10_000,
        maxSourceBytes: 16 * 1024 * 1024,
        maxUncompressedBytes: 32 * 1024 * 1024,
        maxWallTimeMs: 500,
      };
      const result = await session.transformTopology?.scan({ budget });

      expect(client.readTransformTopology).toHaveBeenCalledWith(
        expect.objectContaining({
          budget,
          frameUseTopics: ["/points"],
          maxChunks: 4,
        }),
        { priority: "bulk", signal: undefined },
      );
      expect(result?.edges[0]?.sourceStreamId).toBe("tf");
      expect(result?.continuation).toBe(continuation);

      const resumed = await session.transformTopology?.scan({
        budget,
        continuation,
      });

      expect(client.readTransformTopology).toHaveBeenLastCalledWith(
        expect.objectContaining({ continuation }),
        { priority: "bulk", signal: undefined },
      );
      expect(resumed?.frameUses).toEqual([
        {
          frameId: "camera",
          sourceName: "/camera",
          streamId: "/camera",
        },
        {
          frameId: "lidar",
          sourceName: "/points",
          streamId: "points",
        },
      ]);
    } finally {
      session.dispose();
    }
  });

  it("charges failed topology grants conservatively", async () => {
    const client = createClient();
    vi.mocked(client.readTopics).mockResolvedValue(
      recordingInventory([
        create(StreamInventorySchema, {
          displayName: "/tf",
          metadata: { "mcap.topic": "/tf" },
          payload: { encoding: "ros2", schema: "tf2_msgs/msg/TFMessage" },
          streamId: "tf",
        }),
      ]),
    );
    client.readTransformTopology = vi.fn(async () => {
      throw new Error("transform decode failed");
    });
    const allowance = {
      maxMessages: 10,
      maxSourceBytes: 1_000,
      maxUncompressedBytes: 2_000,
      maxWallTimeMs: 100,
    };
    const session = await createMcapFormatAdapter({
      boundedSourceAllowance: allowance,
      createClient: () => client,
    }).open(source, io);
    try {
      await expect(
        session.transformTopology?.scan({ budget: allowance }),
      ).rejects.toThrow("transform decode failed");

      await expect(
        session.transformTopology?.scan({ budget: allowance }),
      ).resolves.toMatchObject({ stopReason: "account-exhausted" });
      expect(client.readTransformTopology).toHaveBeenCalledOnce();
    } finally {
      session.dispose();
    }
  });

  it("samples topology through exact-time playback reads without resuming the aggregate scan", async () => {
    const client = createClient();
    client.readTransformTopology = vi.fn();
    vi.mocked(client.readTimelineRange).mockResolvedValue({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: 200n,
      startTimeNs: 100n,
    });
    vi.mocked(client.readTopics).mockResolvedValue(
      recordingInventory([
        create(StreamInventorySchema, {
          displayName: "/tf",
          metadata: { "mcap.topic": "/tf" },
          payload: { encoding: "ros2", schema: "tf2_msgs/msg/TFMessage" },
          streamId: "tf",
        }),
        create(StreamInventorySchema, {
          displayName: "/tf_static",
          metadata: { "mcap.topic": "/tf_static" },
          payload: { encoding: "ros2", schema: "tf2_msgs/msg/TFMessage" },
          streamId: "tf-static",
        }),
      ]),
    );
    vi.mocked(client.readFrameTransformBootstrap).mockResolvedValue({
      samples: [
        {
          childFrameId: "base_link",
          parentFrameId: "map",
          rotation: new Quaternion(),
          sourceName: "/tf_static",
          translation: new Vector3(),
        },
      ],
    });
    vi.mocked(client.readFrameTransformWindow).mockResolvedValue({
      samples: [
        {
          childFrameId: "lidar",
          parentFrameId: "base_link",
          rotation: new Quaternion(),
          sourceName: "/tf",
          timeNs: 150n,
          translation: new Vector3(),
        },
      ],
    });
    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(source, io);
    const controller = new AbortController();
    try {
      const result = await session.transformTopology?.sample?.({
        signal: controller.signal,
        timeNs: 175n,
      });

      expect(client.readTransformTopology).not.toHaveBeenCalled();
      expect(client.readFrameTransformBootstrap).toHaveBeenCalledWith(
        { source: sourceDescriptor },
        { signal: controller.signal },
      );
      expect(client.readFrameTransformWindow).toHaveBeenCalledWith(
        expect.objectContaining({ endTimeNs: 175n, startTimeNs: 175n }),
        { priority: "current", signal: controller.signal },
      );
      expect(result).toMatchObject({
        edges: [
          {
            childFrameId: "lidar",
            kind: "temporal",
            parentFrameId: "base_link",
            sourceName: "/tf",
            sourceStreamId: "tf",
          },
          {
            childFrameId: "base_link",
            kind: "static",
            parentFrameId: "map",
            sourceName: "/tf_static",
            sourceStreamId: "tf-static",
          },
        ],
        sampledAtNs: 175n,
      });
    } finally {
      session.dispose();
    }
  });

  it("recognizes Foxglove frame-transform schemas as topology-capable", async () => {
    const client = createClient();
    client.readTransformTopology = vi.fn();
    vi.mocked(client.readTopics).mockResolvedValue(
      recordingInventory([
        create(StreamInventorySchema, {
          displayName: "/tf",
          metadata: { "mcap.topic": "/tf" },
          payload: {
            encoding: "protobuf",
            schema: "foxglove.FrameTransform",
          },
          recordCount: "3",
          streamId: "tf",
        }),
      ]),
    );

    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(source, io);
    try {
      expect(session.manifest.streams[0]?.kind).toBe("transform");
      expect(session.transformTopology).toBeDefined();
      expect(client.readTransformTopology).not.toHaveBeenCalled();
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
      createMcapManifest(
        "episode",
        range,
        recordingInventory([topic(recordCount)]),
      ).streams[0]?.approxRateHz;

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

  it("retains a cancelled grant while reporting its best-effort partial usage", async () => {
    window.history.replaceState(null, "", "/?mcapCostDebug=1");
    const bridge = initMcapCostDebugBridge();
    if (!bridge) throw new Error("expected MCAP cost bridge");
    bridge.beginCapture({ captureId: "bounded-cancel" });
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
    expect(
      bridge
        .snapshot()
        .events.find((event) => event.operation === "bounded-read-grant"),
    ).toMatchObject({
      chunksOpened: partialUsage.chunksOpened,
      decompressedBytes: partialUsage.decompressedBytes,
      decompressionCacheHits: partialUsage.decompressionCacheHits,
      durationMs: partialUsage.elapsedMs,
      logicalSourceBytes: partialUsage.logicalSourceBytes,
      logicalUncompressedBytes: partialUsage.logicalUncompressedBytes,
      messagesDecoded: partialUsage.messagesDecoded,
      stopReason: "cancelled",
      transferredBytes: partialUsage.transferredBytes,
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

  it("correlates debug batch demand with worker attribution", async () => {
    window.history.replaceState(null, "", "/?mcapCostDebug=1");
    const client = createClient();
    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(source, io);

    await session.playback?.readSynchronizedBatch({
      streams: ["camera"],
      timeNs: [1n],
    });

    expect(client.readSynchronizedMessageBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        mcapDataRequestId: expect.stringMatching(/^mcap-data:\d+$/),
      }),
      undefined,
    );
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
      recordingInventory([
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
      ]),
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
            supportsExactBrowsing: false,
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

  it("preserves channel identity when two schemas share one topic", async () => {
    const client = createClient();
    vi.mocked(client.readTopics).mockResolvedValue(
      recordingInventory([
        create(StreamInventorySchema, {
          displayName: "/shared",
          metadata: {
            "mcap.channel_id": "1",
            "mcap.message_encoding": "json",
            "mcap.schema_name": "SchemaA",
            "mcap.topic": "/shared",
          },
          streamId: "1",
        }),
        create(StreamInventorySchema, {
          displayName: "/shared",
          metadata: {
            "mcap.channel_id": "2",
            "mcap.message_encoding": "protobuf",
            "mcap.schema_name": "SchemaB",
            "mcap.topic": "/shared",
          },
          streamId: "2",
        }),
      ]),
    );
    vi.mocked(client.readRawMessageRecord).mockImplementation(
      async (request) => ({
        messageEncoding: request.channelId === 2 ? "protobuf" : "json",
        schemaName: request.channelId === 2 ? "SchemaB" : "SchemaA",
        status: "empty",
        topic: request.topic,
        validFromNs: 0n,
        validUntilNs: 1n,
      }),
    );
    const capability = createMcapRawRecordCapability({
      client,
      source: sourceDescriptor,
    });

    const streams = await capability.listRawRecordStreams();
    expect(streams).toHaveLength(2);
    expect(new Set(streams.map((stream) => stream.streamId)).size).toBe(2);
    expect(streams[0]?.streamId).toContain("mcap-channel:1:");

    const selected = streams[1];
    if (!selected) throw new Error("expected the second raw channel");
    const result = await capability.readRawRecord({
      stream: selected.streamId,
      timestampNs: 0n,
    });
    expect(client.readRawMessageRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ channelId: 2, topic: "/shared" }),
      expect.objectContaining({ priority: "idle" }),
    );
    expect(result).toMatchObject({
      encoding: "protobuf",
      schemaName: "SchemaB",
      streamId: selected.streamId,
    });
  });

  it("falls back from malformed channel metadata to a numeric inventory id", async () => {
    const client = createClient();
    vi.mocked(client.readTopics).mockResolvedValue(
      recordingInventory([
        create(StreamInventorySchema, {
          displayName: "/shared",
          metadata: { "mcap.channel_id": " ", "mcap.topic": "/shared" },
          streamId: "1",
        }),
        create(StreamInventorySchema, {
          displayName: "/shared",
          metadata: { "mcap.channel_id": "2", "mcap.topic": "/shared" },
          streamId: "2",
        }),
      ]),
    );
    vi.mocked(client.readRawMessageRecord).mockResolvedValue({
      messageEncoding: "json",
      schemaName: null,
      status: "empty",
      topic: "/shared",
      validFromNs: 0n,
      validUntilNs: 1n,
    });
    const capability = createMcapRawRecordCapability({
      client,
      source: sourceDescriptor,
    });

    const streams = await capability.listRawRecordStreams();
    const first = streams[0];
    if (!first) throw new Error("expected the first raw channel");
    await capability.readRawRecord({ stream: first.streamId, timestampNs: 0n });

    expect(client.readRawMessageRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ channelId: 1, topic: "/shared" }),
      expect.objectContaining({ priority: "idle" }),
    );
  });

  it("does not parse non-decimal synthetic channel ids", async () => {
    const client = createClient();
    vi.mocked(client.readRawMessageRecord).mockImplementation(
      async (request) => ({
        messageEncoding: "json",
        schemaName: null,
        status: "empty",
        topic: request.topic,
        validFromNs: 0n,
        validUntilNs: 1n,
      }),
    );
    const capability = createMcapRawRecordCapability({
      client,
      source: sourceDescriptor,
    });

    for (const stream of [
      "mcap-channel::%2Fshared",
      "mcap-channel:+1:%2Fshared",
      "mcap-channel:-1:%2Fshared",
      "mcap-channel:1e0:%2Fshared",
    ]) {
      await capability.readRawRecord({ stream, timestampNs: 0n });
      expect(client.readRawMessageRecord).toHaveBeenLastCalledWith(
        expect.objectContaining({ topic: stream }),
        expect.objectContaining({ priority: "idle" }),
      );
      expect(client.readRawMessageRecord).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ channelId: expect.anything() }),
        expect.any(Object),
      );
    }
  });

  it("adapts indexed topic browsing onto explicit interactive reads", async () => {
    const client = createClient();
    client.readTopics = vi.fn(async () =>
      recordingInventory([
        create(StreamInventorySchema, {
          displayName: "Camera",
          metadata: {
            "mcap.exact_browsing": "true",
            "mcap.topic": "/camera",
          },
          recordCount: "3",
          streamId: "camera",
        }),
      ]),
    );
    client.readRawMessageAtCursor = vi.fn(async () => ({
      cursor: "cursor-2",
      logTimeNs: 2n,
      messageEncoding: "json",
      schemaName: "test.State",
      status: "ok" as const,
      topic: "/camera",
      validFromNs: 2n,
      validUntilNs: 3n,
    }));
    client.readMessageIndexWindow = vi.fn(async () => ({
      entries: [
        { cursor: "cursor-1", logTimeNs: 1n },
        { cursor: "cursor-2", logTimeNs: 2n },
      ],
      hasNext: true,
      hasPrevious: false,
      selectedCursor: "cursor-2",
    }));
    const session = await createMcapFormatAdapter({
      createClient: () => client,
    }).open(source, io);
    const controller = new AbortController();
    try {
      await expect(session.rawRecords?.listRawRecordStreams()).resolves.toEqual(
        [
          expect.objectContaining({
            streamId: "camera",
            supportsExactBrowsing: true,
          }),
        ],
      );
      await expect(
        session.rawRecords?.readRawRecordAtCursor?.({
          cursor: "cursor-2",
          signal: controller.signal,
          stream: "camera",
        }),
      ).resolves.toMatchObject({ cursor: "cursor-2", streamId: "camera" });
      await expect(
        session.rawRecords?.readRawRecordIndexWindow?.({
          after: 5,
          anchorCursor: "cursor-2",
          before: 5,
          signal: controller.signal,
          stream: "camera",
        }),
      ).resolves.toEqual({
        entries: [
          { cursor: "cursor-1", timestampNs: 1n },
          { cursor: "cursor-2", timestampNs: 2n },
        ],
        hasNext: true,
        hasPrevious: false,
        selectedCursor: "cursor-2",
      });

      expect(client.readRawMessageAtCursor).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: "cursor-2", topic: "/camera" }),
        { priority: "current", signal: controller.signal },
      );
      expect(client.readMessageIndexWindow).toHaveBeenCalledWith(
        expect.objectContaining({ anchorCursor: "cursor-2", topic: "/camera" }),
        { priority: "current", signal: controller.signal },
      );
    } finally {
      session.dispose();
    }
  });

  it("preserves exact channel identity and bulk copy attribution", async () => {
    const client = createClient();
    client.readTopics = vi.fn(async () =>
      recordingInventory(
        [1, 2].map((channelId) =>
          create(StreamInventorySchema, {
            displayName: "/shared",
            metadata: {
              "mcap.channel_id": String(channelId),
              "mcap.exact_browsing": "true",
              "mcap.topic": "/shared",
            },
            streamId: String(channelId),
          }),
        ),
      ),
    );
    client.readRawMessageAtCursor = vi.fn(async () => ({
      cursor: "cursor-2",
      logTimeNs: 2n,
      messageEncoding: "json",
      schemaName: null,
      status: "ok" as const,
      topic: "/shared",
      validFromNs: 2n,
      validUntilNs: 3n,
    }));
    client.readMessageIndexWindow = vi.fn(async () => ({
      entries: [{ cursor: "cursor-2", logTimeNs: 2n }],
      hasNext: false,
      hasPrevious: false,
      selectedCursor: "cursor-2",
    }));
    const capability = createMcapRawRecordCapability({
      client,
      source: sourceDescriptor,
    });
    const streams = await capability.listRawRecordStreams();
    const selected = streams[1];
    if (!selected) throw new Error("expected the second raw channel");

    await capability.readRawRecordIndexWindow?.({
      after: 1,
      anchorTimestampNs: 2n,
      before: 1,
      stream: selected.streamId,
    });
    await capability.readRawRecordAtCursor?.({
      cursor: "cursor-2",
      includeFullJson: true,
      intent: "export",
      stream: selected.streamId,
    });

    expect(client.readMessageIndexWindow).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 2, topic: "/shared" }),
      expect.objectContaining({ priority: "current" }),
    );
    expect(client.readRawMessageAtCursor).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 2, topic: "/shared" }),
      expect.objectContaining({ priority: "bulk" }),
    );
  });

  it("requires both authoritative metadata and exact client methods", async () => {
    const metadataOnlyClient = createClient();
    metadataOnlyClient.readTopics = vi.fn(async () =>
      recordingInventory([
        create(StreamInventorySchema, {
          metadata: {
            "mcap.exact_browsing": "true",
            "mcap.topic": "/camera",
          },
          streamId: "camera",
        }),
      ]),
    );
    const metadataOnly = createMcapRawRecordCapability({
      client: metadataOnlyClient,
      source: sourceDescriptor,
    });

    await expect(metadataOnly.listRawRecordStreams()).resolves.toEqual([
      expect.objectContaining({ supportsExactBrowsing: false }),
    ]);
    expect(metadataOnly.readRawRecordAtCursor).toBeUndefined();
    expect(metadataOnly.readRawRecordIndexWindow).toBeUndefined();

    const methodsOnlyClient = createClient();
    methodsOnlyClient.readRawMessageAtCursor = vi.fn();
    methodsOnlyClient.readMessageIndexWindow = vi.fn();
    const methodsOnly = createMcapRawRecordCapability({
      client: methodsOnlyClient,
      source: sourceDescriptor,
    });

    await expect(methodsOnly.listRawRecordStreams()).resolves.toEqual([
      expect.objectContaining({ supportsExactBrowsing: false }),
    ]);
    expect(methodsOnly.readRawRecordAtCursor).toBeTypeOf("function");
    expect(methodsOnly.readRawRecordIndexWindow).toBeTypeOf("function");
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
        { priority: "idle", signal: controller.signal },
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
    readTopics: vi.fn(async () =>
      recordingInventory([
        create(StreamInventorySchema, {
          displayName: "Camera",
          metadata: { "mcap.topic": "/camera" },
          payload: { encoding: "ros2", schema: "sensor_msgs/msg/Image" },
          recordCount: "1",
          streamId: "camera",
        }),
      ]),
    ),
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
