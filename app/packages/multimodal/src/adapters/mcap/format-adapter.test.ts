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
    const session = await createMcapFormatAdapter({
      createClient,
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
