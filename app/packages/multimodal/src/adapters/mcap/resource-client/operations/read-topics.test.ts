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
    channelsById: options.channelsById ?? new Map(),
    chunkIndexes: options.chunkIndexes ?? [],
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

    const topics = readMcapTopics(indexedReader);

    expect(topics[0]?.metadata["mcap.exact_browsing"]).toBe("true");
    expect(topics[1]?.metadata["mcap.exact_browsing"]).toBe("false");
    expect(
      readMcapTopics(
        createReader({
          channelsById: new Map([[1, createChannel({ id: 1 })]]),
        }),
      )[0]?.metadata["mcap.exact_browsing"],
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
    );

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
    );
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
    );
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

    const topics = readMcapTopics(reader);

    expect(
      topics.map((topic) => topic.metadata["mcap.scene_start_time_ns"]),
    ).toEqual(["1700000000000000000", "1700000000000000000"]);
  });

  it("defaults the scene start time to 0 when statistics are unavailable", () => {
    const reader = createReader({
      channelsById: new Map([[1, createChannel({ id: 1 })]]),
    });

    const topics = readMcapTopics(reader);

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

    const topics = readMcapTopics(reader);

    expect(topics[0]?.metadata["mcap.scene_start_time_ns"]).toBe("42");
  });
});
