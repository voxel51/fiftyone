import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
} from "../../reader";
import { readMcapTopics } from "./read-topics";

function createChannel(
  options: Partial<McapTypes.TypedMcapRecords["Channel"]> = {},
): McapTypes.TypedMcapRecords["Channel"] {
  return {
    id: options.id ?? 1,
    messageEncoding: options.messageEncoding ?? "json",
    metadata: options.metadata ?? new Map(),
    schemaId: options.schemaId ?? 0,
    topic: options.topic ?? "/topic",
    type: "Channel",
  };
}

function createReader(
  options: Partial<McapIndexedReaderLike> = {},
): McapIndexedReaderLike {
  return {
    attachmentIndexes: options.attachmentIndexes,
    channelsById: options.channelsById ?? new Map(),
    chunkIndexes: options.chunkIndexes ?? [],
    header: options.header,
    metadataIndexes: options.metadataIndexes,
    readMessages:
      options.readMessages ??
      vi.fn(async function* () {
        for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
          yield message;
        }
      }),
    readIndexedMessages: options.readIndexedMessages,
    readIndexedMessageTimes: options.readIndexedMessageTimes,
    readLatestIndexedMessageTimes: options.readLatestIndexedMessageTimes,
    schemasById: options.schemasById ?? new Map(),
    statistics: options.statistics,
  };
}

describe("readMcapTopics", () => {
  it("aggregates cloneable recording facts from resident summary indexes", () => {
    const messageCount = 9_007_199_254_740_993_123n;
    const result = readMcapTopics(
      createReader({
        attachmentIndexes: [
          {
            createTime: 2n,
            dataSize: 128n,
            length: 160n,
            logTime: 3n,
            mediaType: "application/yaml",
            name: "calibration.yaml",
            offset: 10n,
            type: "AttachmentIndex",
          },
        ],
        channelsById: new Map([
          [1, createChannel({ id: 1, schemaId: 1, topic: "/shared" })],
          [2, createChannel({ id: 2, schemaId: 1, topic: "/shared" })],
          [3, createChannel({ id: 3, schemaId: 0, topic: "/raw" })],
        ]),
        chunkIndexes: [
          {
            chunkLength: 120n,
            chunkStartOffset: 10n,
            compressedSize: 100n,
            compression: "",
            messageEndTime: 2n,
            messageIndexLength: 20n,
            messageIndexOffsets: new Map([
              [1, 80n],
              [2, 90n],
            ]),
            messageStartTime: 1n,
            type: "ChunkIndex",
            uncompressedSize: 100n,
          },
          {
            chunkLength: 90n,
            chunkStartOffset: 130n,
            compressedSize: 50n,
            compression: "zstd",
            messageEndTime: 4n,
            messageIndexLength: 20n,
            messageIndexOffsets: new Map([
              [1, 180n],
              [3, 190n],
            ]),
            messageStartTime: 2n,
            type: "ChunkIndex",
            uncompressedSize: 200n,
          },
          {
            chunkLength: 100n,
            chunkStartOffset: 220n,
            compressedSize: 75n,
            compression: "zstd",
            messageEndTime: 7n,
            messageIndexLength: 0n,
            messageIndexOffsets: new Map(),
            messageStartTime: 5n,
            type: "ChunkIndex",
            uncompressedSize: 300n,
          },
        ],
        header: { library: "libmcap 0.8.0", profile: "ros2", type: "Header" },
        metadataIndexes: [
          {
            length: 64n,
            name: "rosbag2",
            offset: 320n,
            type: "MetadataIndex",
          },
        ],
        schemasById: new Map([
          [
            1,
            {
              data: new Uint8Array([1]),
              encoding: "ros2msg",
              id: 1,
              name: "example/msg/State",
              type: "Schema",
            },
          ],
        ]),
        statistics: {
          attachmentCount: 1,
          channelCount: 3,
          channelMessageCounts: new Map(),
          chunkCount: 3,
          messageCount,
          messageEndTime: 7n,
          messageStartTime: 1n,
          metadataCount: 1,
          schemaCount: 1,
          type: "Statistics",
        },
      }),
    );

    expect(result.recordingFacts).toMatchObject({
      channelCount: 3,
      format: "mcap",
      messageCount: messageCount.toString(),
      mcap: {
        attachmentCount: 1,
        attachments: [
          {
            dataSizeBytes: "128",
            mediaType: "application/yaml",
            name: "calibration.yaml",
          },
        ],
        chunkCount: 3,
        compression: [
          {
            chunkCount: 1,
            codec: "none",
            compressedBytes: "100",
            uncompressedBytes: "100",
          },
          {
            chunkCount: 2,
            codec: "zstd",
            compressedBytes: "125",
            uncompressedBytes: "500",
          },
        ],
        library: "libmcap 0.8.0",
        medianChannelsPerChunk: 2,
        medianChunkSizeBytes: "75",
        medianChunkSpanNs: "2",
        messageIndexStatus: "partial",
        metadataRecordCount: 1,
        metadataRecordNames: ["rosbag2"],
        profile: "ros2",
      },
      schemaCount: 1,
      schemaCoverage: {
        embeddedSchemaChannelCount: 2,
        missingSchemaChannelCount: 1,
      },
      topicCount: 2,
    });
    expect(result.recordingFacts.mcap?.compressionRatio).toBeCloseTo(600 / 225);
  });

  it("treats schema records without an embedded definition as missing", () => {
    const result = readMcapTopics(
      createReader({
        channelsById: new Map([
          [1, createChannel({ id: 1, schemaId: 1, topic: "/placeholder" })],
        ]),
        schemasById: new Map([
          [
            1,
            {
              data: new Uint8Array(),
              encoding: "",
              id: 1,
              name: "example/msg/Placeholder",
              type: "Schema",
            },
          ],
        ]),
      }),
    );

    expect(result.recordingFacts.schemaCoverage).toEqual({
      embeddedSchemaChannelCount: 0,
      missingSchemaChannelCount: 1,
    });
  });

  it("reports absent and unknown index summaries without scanning", () => {
    const absent = readMcapTopics(
      createReader({
        chunkIndexes: [
          {
            chunkLength: 100n,
            chunkStartOffset: 10n,
            compressedSize: 80n,
            compression: "zstd",
            messageEndTime: 2n,
            messageIndexLength: 0n,
            messageIndexOffsets: new Map(),
            messageStartTime: 1n,
            type: "ChunkIndex",
            uncompressedSize: 100n,
          },
        ],
      }),
    );
    const unknown = readMcapTopics(createReader());

    expect(absent.recordingFacts.mcap?.messageIndexStatus).toBe("absent");
    expect(unknown.recordingFacts.mcap?.messageIndexStatus).toBe("unknown");
    expect(unknown.recordingFacts.messageCount).toBeUndefined();
  });

  it("gates exact browsing on usable per-channel message indexes", () => {
    const indexedReader = createReader({
      channelsById: new Map([
        [1, createChannel({ id: 1, topic: "/indexed" })],
        [2, createChannel({ id: 2, topic: "/plain" })],
      ]),
      chunkIndexes: [
        {
          chunkLength: 100n,
          chunkStartOffset: 10n,
          compressedSize: 10n,
          compression: "",
          messageEndTime: 2n,
          messageIndexLength: 20n,
          messageIndexOffsets: new Map([[1, 80n]]),
          messageStartTime: 1n,
          type: "ChunkIndex",
          uncompressedSize: 100n,
        },
      ],
      readIndexedMessageTimes: vi.fn(async function* () {
        for (const entry of [] as McapIndexedMessageTime[]) yield entry;
      }),
      readIndexedMessages: vi.fn(),
      readLatestIndexedMessageTimes: vi.fn(),
    });

    const topics = readMcapTopics(indexedReader).streams;

    expect(topics[0]?.metadata["mcap.exact_browsing"]).toBe("true");
    expect(topics[1]?.metadata["mcap.exact_browsing"]).toBe("false");
    expect(
      readMcapTopics(
        createReader({
          channelsById: new Map([[1, createChannel({ id: 1 })]]),
        }),
      ).streams[0]?.metadata["mcap.exact_browsing"],
    ).toBe("false");
  });

  it("does not trust source-authored exact-browsing metadata", () => {
    const topics = readMcapTopics(
      createReader({
        channelsById: new Map([
          [
            1,
            createChannel({
              id: 1,
              metadata: new Map([["mcap.exact_browsing", "true"]]),
            }),
          ],
        ]),
      }),
    ).streams;

    expect(topics[0]?.metadata["mcap.exact_browsing"]).toBe("false");
  });

  it("requires indexes for every channel sharing a logical topic", () => {
    const channelsById = new Map([
      [1, createChannel({ id: 1, topic: "/state" })],
      [2, createChannel({ id: 2, topic: "/state" })],
    ]);
    const indexedMethods = {
      readIndexedMessageTimes: vi.fn(async function* () {
        for (const entry of [] as McapIndexedMessageTime[]) yield entry;
      }),
      readIndexedMessages: vi.fn(),
      readLatestIndexedMessageTimes: vi.fn(),
    };
    const oneIndexed = readMcapTopics(
      createReader({
        channelsById,
        chunkIndexes: [
          {
            chunkLength: 100n,
            chunkStartOffset: 10n,
            compressedSize: 10n,
            compression: "",
            messageEndTime: 2n,
            messageIndexLength: 20n,
            messageIndexOffsets: new Map([[1, 80n]]),
            messageStartTime: 1n,
            type: "ChunkIndex",
            uncompressedSize: 100n,
          },
        ],
        ...indexedMethods,
      }),
    ).streams;
    expect(
      oneIndexed.map((topic) => topic.metadata["mcap.exact_browsing"]),
    ).toEqual(["false", "false"]);

    const fullyIndexed = readMcapTopics(
      createReader({
        channelsById,
        chunkIndexes: [
          {
            chunkLength: 100n,
            chunkStartOffset: 10n,
            compressedSize: 10n,
            compression: "",
            messageEndTime: 2n,
            messageIndexLength: 20n,
            messageIndexOffsets: new Map([
              [1, 80n],
              [2, 90n],
            ]),
            messageStartTime: 1n,
            type: "ChunkIndex",
            uncompressedSize: 100n,
          },
        ],
        ...indexedMethods,
      }),
    ).streams;
    expect(
      fullyIndexed.map((topic) => topic.metadata["mcap.exact_browsing"]),
    ).toEqual(["true", "true"]);
  });

  it("stamps every topic with the scene's start time", () => {
    const reader = createReader({
      channelsById: new Map([
        [1, createChannel({ id: 1, topic: "/a" })],
        [2, createChannel({ id: 2, topic: "/b" })],
      ]),
      statistics: {
        attachmentCount: 0,
        channelCount: 2,
        channelMessageCounts: new Map(),
        chunkCount: 0,
        messageCount: 0n,
        messageEndTime: 0n,
        messageStartTime: 1700000000000000000n,
        metadataCount: 0,
        schemaCount: 0,
        type: "Statistics",
      },
    });

    const topics = readMcapTopics(reader).streams;

    expect(
      topics.map((topic) => topic.metadata["mcap.scene_start_time_ns"]),
    ).toEqual(["1700000000000000000", "1700000000000000000"]);
  });

  it("defaults the scene start time to 0 when statistics are unavailable", () => {
    const reader = createReader({
      channelsById: new Map([[1, createChannel({ id: 1 })]]),
    });

    const topics = readMcapTopics(reader).streams;

    expect(topics[0]?.metadata["mcap.scene_start_time_ns"]).toBe("0");
  });

  it("doesn't clobber a channel that already has a literal mcap.scene_start_time_ns key", () => {
    // Matches the existing putDerivedMetadata convention used by every
    // other derived key in this function (e.g. mcap.channel_id).
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            metadata: new Map([["mcap.scene_start_time_ns", "42"]]),
          }),
        ],
      ]),
      statistics: {
        attachmentCount: 0,
        channelCount: 1,
        channelMessageCounts: new Map(),
        chunkCount: 0,
        messageCount: 0n,
        messageEndTime: 0n,
        messageStartTime: 999n,
        metadataCount: 0,
        schemaCount: 0,
        type: "Statistics",
      },
    });

    const topics = readMcapTopics(reader).streams;

    expect(topics[0]?.metadata["mcap.scene_start_time_ns"]).toBe("42");
  });
});
