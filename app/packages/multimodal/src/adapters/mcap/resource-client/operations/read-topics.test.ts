import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { McapIndexedReaderLike } from "../../reader";
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
    schemasById: options.schemasById ?? new Map(),
    statistics: options.statistics,
  };
}

describe("readMcapTopics", () => {
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
