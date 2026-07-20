import { describe, expect, it, vi } from "vitest";
import type { StreamInventory } from "../../schemas/v1";
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
  type McapResourceClient,
} from "./types";

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

const io = {
  readBytes: vi.fn(),
} as unknown as ByteResources;

defineEpisodeSessionContractTests({
  createSession: () =>
    createMcapFormatAdapter({ createClient: createClient }).open(source, io),
  name: "MCAP",
});

describe("MCAP format adapter", () => {
  it("normalizes adapter metadata references to stable stream IDs", () => {
    const manifest = createMcapManifest(
      "episode",
      { endTimeNs: 2n, startTimeNs: 1n },
      [
        {
          displayName: "/camera/image",
          metadata: {
            "mcap.topic": "/camera/image",
            [SCENE_SOURCE_METADATA.CALIBRATION_STREAM_ID]: "/camera/info",
          },
          streamId: "7",
        },
        {
          displayName: "/camera/info",
          metadata: { "mcap.topic": "/camera/info" },
          streamId: "8",
        },
      ] as unknown as StreamInventory[],
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
    enumerateNumericFields: vi.fn(async () => [
      {
        availability: "ready",
        encoding: "json",
        fields: [{ path: "exposure", valueType: "double" }],
        topic: "/camera",
      },
    ]),
    readDecodedMessages: vi.fn(async function* () {
      yield message;
    }),
    readTimelineRange: vi.fn(async () => ({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: 2n,
      startTimeNs: 1n,
    })),
    readTopics: vi.fn(async () => [
      {
        displayName: "Camera",
        metadata: { "mcap.topic": "/camera" },
        payload: { encoding: "ros2", schema: "sensor_msgs/msg/Image" },
        recordCount: "1",
        streamId: "camera",
      } as unknown as StreamInventory,
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
    readRawMessageRecord: vi.fn(async () => ({
      messageEncoding: "json",
      schemaName: null,
      status: "empty",
      topic: "/camera",
      validFromNs: 1n,
      validUntilNs: 2n,
    })),
  } as unknown as McapResourceClient;
}
