import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../client/resources";
import type { DecodeResourceClient } from "../../../client/resources";
import type { DecodedOutput } from "../../../decoders";
import { PlaybackSyncMode } from "../../../schemas/v1";
import { VISUALIZATION_KIND } from "../../../visualization";
import { createInlineMcapResourceClient } from "./inline";
import { MCAP_ACTIVE_TIMELINE } from "../types";

describe("MCAP resources", () => {
  it("reads topic inventory from summary channels without scanning messages", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              7,
              createChannel({
                id: 7,
                metadata: new Map([["frame_id", "cam-front"]]),
                topic: "/camera",
              }),
            ],
            [
              8,
              createChannel({
                id: 8,
                metadata: new Map([["frame_id", "cam-left"]]),
                topic: "/camera",
              }),
            ],
            [9, createChannel({ id: 9, schemaId: 4, topic: "/lidar" })],
          ]),
          readMessages,
          schemasById: new Map([
            [
              3,
              createSchema(new Uint8Array([9]), {
                name: "foxglove.CompressedImage",
              }),
            ],
            [
              4,
              createSchema(new Uint8Array([8]), {
                id: 4,
                name: "foxglove.PointCloud",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([
              [7, 2n],
              [8, 3n],
              [9, 5n],
            ]),
          }),
        })
      ),
    });

    const topics = await client.readTopics({ source });

    expect(topics.map((topic) => topic.streamId)).toEqual(["7", "8", "9"]);
    expect(topics.map((topic) => topic.recordCount)).toEqual(["2", "3", "5"]);
    expect(topics[0]).toMatchObject({
      displayName: "/camera",
      metadata: {
        frame_id: "cam-front",
        "mcap.channel_id": "7",
        "mcap.channel_metadata.frame_id": "cam-front",
        "mcap.message_encoding": "protobuf",
        "mcap.schema_encoding": "protobuf",
        "mcap.schema_id": "3",
        "mcap.schema_name": "foxglove.CompressedImage",
        "mcap.topic": "/camera",
      },
      payload: {
        encoding: "protobuf",
        schema: "foxglove.CompressedImage",
        schemaEncoding: "protobuf",
      },
    });
    expect(topics[2]).toMatchObject({
      displayName: "/lidar",
      payload: {
        encoding: "protobuf",
        schema: "foxglove.PointCloud",
        schemaEncoding: "protobuf",
      },
      streamId: "9",
    });
    expect(readMessages).not.toHaveBeenCalled();
    expect(decodeClient.decode).not.toHaveBeenCalled();
  });

  it("matches MCAP adapter topic fallbacks for missing schema and stats", async () => {
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              7,
              createChannel({
                id: 7,
                metadata: new Map([["source", "camera"]]),
                schemaId: 0,
              }),
            ],
            [
              8,
              createChannel({
                id: 8,
                metadata: new Map([["source", "lidar"]]),
                schemaId: 99,
                topic: "/lidar",
              }),
            ],
          ]),
          schemasById: new Map(),
        })
      ),
    });

    const topics = await client.readTopics({
      source: createMcapSourceDescriptor(),
    });

    expect(topics).toMatchObject([
      {
        metadata: {
          source: "camera",
          "mcap.schema_id": "0",
        },
        payload: {
          encoding: "protobuf",
        },
        recordCount: "0",
        streamId: "7",
      },
      {
        metadata: {
          source: "lidar",
          "mcap.schema_id": "99",
        },
        payload: {
          encoding: "protobuf",
        },
        recordCount: "0",
        streamId: "8",
      },
    ]);
    expect(topics[0]?.payload?.schema).toBeUndefined();
    expect(topics[0]?.payload?.schemaEncoding).toBeUndefined();
    expect(topics[1]?.payload?.schema).toBeUndefined();
    expect(topics[1]?.payload?.schemaEncoding).toBeUndefined();
  });

  it("decodes log-timeline messages through the generic decode client", async () => {
    const source = createMcapSourceDescriptor();
    const schemaData = new Uint8Array([9, 8, 7]);
    const messageBytes = new Uint8Array([1, 2, 3]);
    const message = createMessage(messageBytes);
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([[7, createChannel()]]),
          messages: [message],
          schemasById: new Map([[3, createSchema(schemaData)]]),
        })
      ),
    });

    const messages = await collect(
      client.readDecodedMessages({
        limit: 1,
        source,
        topics: ["/topic"],
      })
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      channelId: 7,
      logTimeNs: 100n,
      publishTimeNs: 101n,
      sequence: 2,
      timelineTimeNs: 100n,
      topic: "/topic",
    });
    expect(decodeClient.decode).toHaveBeenCalledWith({
      bytes: messageBytes,
      cache: {
        decoderOptionsKey: "activeTimeline=log",
        recordId: expect.stringMatching(/^7:100:101:2:3:[0-9a-f]{8}$/),
        source,
        streamId: "/topic",
        timeNs: 100n,
      },
      context: {
        schemaData,
        sourceTimestamps: {
          logTime: 100n,
          publishTime: 101n,
        },
        streamId: "/topic",
        timeRangeStartKey: "logTime",
      },
      payload: {
        encoding: "protobuf",
        schema: "foxglove.CompressedImage",
        schemaEncoding: "protobuf",
      },
    });
  });

  it("does not decode messages when the decoded-message limit is invalid", async () => {
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          messages: [createMessage(new Uint8Array([1]))],
        })
      ),
    });

    await expect(
      collect(
        client.readDecodedMessages({
          limit: 0,
          source: createMcapSourceDescriptor(),
          topics: ["/topic"],
        })
      )
    ).resolves.toEqual([]);
    expect(decodeClient.decode).not.toHaveBeenCalled();
  });

  it("reads synchronized playback batches with one raw scan and shared decode work", async () => {
    const source = createMcapSourceDescriptor();
    const messages = [
      createMessage(new Uint8Array([1]), {
        channelId: 7,
        logTime: 90n,
        publishTime: 91n,
      }),
      createMessage(new Uint8Array([2]), {
        channelId: 8,
        logTime: 108n,
        publishTime: 109n,
      }),
      createMessage(new Uint8Array([3]), {
        channelId: 7,
        logTime: 130n,
        publishTime: 131n,
      }),
    ];
    const decodeClient = createTestDecodeClient();
    const readMessages = vi.fn(async function* () {
      for (const message of messages) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
            [8, createChannel({ id: 8, topic: "/lidar" })],
          ]),
          readMessages,
        })
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n, 105n],
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      topics: ["/camera", "/lidar"],
    });

    expect(windows).toHaveLength(2);
    expect(
      windows[0]?.messages.map((message) => message.timelineTimeNs)
    ).toEqual([90n, 108n]);
    expect(
      windows[1]?.messages.map((message) => message.timelineTimeNs)
    ).toEqual([90n, 108n]);
    expect(readMessages).toHaveBeenCalledTimes(1);
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
  });

  it("keeps synchronized decode cache entries distinct for changed payloads", async () => {
    const source = createMcapSourceDescriptor();
    const messages = [
      createMessage(new Uint8Array([1]), {
        logTime: 100n,
        publishTime: 101n,
        sequence: 2,
      }),
      createMessage(new Uint8Array([2]), {
        logTime: 100n,
        publishTime: 101n,
        sequence: 2,
      }),
    ];
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          messages,
        })
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n],
      source,
      defaultStreamPolicy: {
        limit: 2,
        mode: PlaybackSyncMode.STRICT,
      },
      topics: ["/topic"],
    });

    expect(windows[0]?.messages).toHaveLength(2);
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
  });

  it("uses indexed message times to read only selected synchronized messages", async () => {
    const source = createMcapSourceDescriptor();
    const camera = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 90n,
      publishTime: 91n,
    });
    const lidar = createMessage(new Uint8Array([2]), {
      channelId: 8,
      logTime: 108n,
      publishTime: 109n,
    });
    const lateCamera = createMessage(new Uint8Array([3]), {
      channelId: 7,
      logTime: 130n,
      publishTime: 131n,
    });
    const decodeClient = createTestDecodeClient();
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime("/camera", 7, 90n, 900n);
      yield createIndexedMessageTime("/lidar", 8, 108n, 1080n);
      yield createIndexedMessageTime("/camera", 7, 130n, 1300n);
    });
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
      readonly topics?: readonly string[];
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      expect(args?.startTime).toBe(args?.endTime);
      const topic = args?.topics?.[0];
      if (topic === "/camera" && args?.startTime === 90n) {
        yield camera;
      }
      if (topic === "/lidar" && args?.startTime === 108n) {
        yield lidar;
      }
      if (topic === "/camera" && args?.startTime === 130n) {
        yield lateCamera;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
            [8, createChannel({ id: 8, topic: "/lidar" })],
          ]),
          readIndexedMessageTimes,
          readMessages,
        })
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n, 105n],
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      topics: ["/camera", "/lidar"],
    });

    expect(windows).toHaveLength(2);
    expect(
      windows[0]?.messages.map((message) => message.timelineTimeNs)
    ).toEqual([90n, 108n]);
    expect(
      windows[1]?.messages.map((message) => message.timelineTimeNs)
    ).toEqual([90n, 108n]);
    expect(readIndexedMessageTimes).toHaveBeenCalledWith({
      endTimeNs: 125n,
      startTimeNs: 80n,
      topics: ["/camera", "/lidar"],
    });
    expect(readMessages.mock.calls.map(([args]) => args)).toEqual([
      { endTime: 90n, startTime: 90n, topics: ["/camera"] },
      { endTime: 108n, startTime: 108n, topics: ["/lidar"] },
    ]);
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
  });

  it("rejects ambiguous indexed-to-raw message matches", async () => {
    const source = createMcapSourceDescriptor();
    const first = createMessage(new Uint8Array([1]), {
      logTime: 90n,
      publishTime: 91n,
    });
    const second = createMessage(new Uint8Array([2]), {
      logTime: 90n,
      publishTime: 92n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime("/topic", 7, 90n, 900n);
    });
    const readMessages = vi.fn(async function* () {
      yield first;
      yield second;
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readMessages,
        })
      ),
    });

    await expect(
      client.readSynchronizedMessageBatch({
        timeNs: [90n],
        source,
        defaultStreamPolicy: {
          mode: PlaybackSyncMode.STRICT,
        },
        topics: ["/topic"],
      })
    ).rejects.toThrow(
      "Ambiguous MCAP indexed-to-raw match for /topic entry with channel 7 at 90"
    );
  });

  it("returns empty synchronized batches without opening a reader", async () => {
    const readerFactory = vi.fn();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory,
    });

    await expect(
      client.readSynchronizedMessageBatch({
        source: createMcapSourceDescriptor(),
        timeNs: [],
        topics: ["/camera"],
      })
    ).resolves.toEqual([]);
    expect(readerFactory).not.toHaveBeenCalled();
  });

  it("reads log timeline range from chunk indexes without scanning messages", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield {
        channelId: 7,
        chunkStartOffset: 10n,
        logTimeNs: 100n,
        messageOffset: 8n,
        topic: "/camera",
      };
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          chunkIndexes: [
            createChunkIndex({
              messageEndTime: 250n,
              messageStartTime: 100n,
            }),
            createChunkIndex({
              messageEndTime: 450n,
              messageStartTime: 300n,
            }),
          ],
          readIndexedMessageTimes,
          readMessages,
        })
      ),
    });

    await expect(
      client.readTimelineRange({
        source,
      })
    ).resolves.toEqual({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: 450n,
      startTimeNs: 100n,
    });
    expect(readIndexedMessageTimes).not.toHaveBeenCalled();
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("rejects byte reads past known source size before hitting the byte client", async () => {
    const source = createMcapSourceDescriptor();
    const readBytes = vi.fn();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async (_source, readable) => {
        await readable.read(128n, 1n);
        return createReader();
      }),
    });

    await expect(
      collect(
        client.readDecodedMessages({
          source,
          topics: ["/topic"],
        })
      )
    ).rejects.toThrow("exceeds source size 128");
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("retries reader initialization after a rejected reader promise", async () => {
    const readerFactory = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary init failure"))
      .mockResolvedValueOnce(
        createReader({
          chunkIndexes: [
            createChunkIndex({
              messageEndTime: 20n,
              messageStartTime: 10n,
            }),
          ],
        })
      );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory,
    });
    const request = {
      source: createMcapSourceDescriptor(),
    };

    await expect(client.readTimelineRange(request)).rejects.toThrow(
      "temporary init failure"
    );
    await expect(client.readTimelineRange(request)).resolves.toEqual({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      endTimeNs: 20n,
      startTimeNs: 10n,
    });
    expect(readerFactory).toHaveBeenCalledTimes(2);
  });
});

async function collect<T>(
  generator: AsyncGenerator<T, void, void>
): Promise<readonly T[]> {
  const messages: T[] = [];
  for await (const message of generator) {
    messages.push(message);
  }

  return messages;
}

function createMcapSourceDescriptor(): ByteSourceDescriptor {
  return {
    sizeBytes: "128",
    sourceId: "source:1",
    url: "mcap-source://sample",
  };
}

function createReader({
  channelsById = new Map([[7, createChannel({ id: 7, topic: "/topic" })]]),
  chunkIndexes = [],
  messages = [],
  readIndexedMessageTimes,
  readMessages,
  schemasById = new Map([[3, createSchema(new Uint8Array([9]))]]),
  statistics,
}: {
  readonly channelsById?: ReadonlyMap<
    number,
    McapTypes.TypedMcapRecords["Channel"]
  >;
  readonly chunkIndexes?: readonly McapTypes.TypedMcapRecords["ChunkIndex"][];
  readonly messages?: readonly McapTypes.TypedMcapRecords["Message"][];
  readonly readIndexedMessageTimes?: (args?: unknown) => AsyncGenerator<
    {
      readonly channelId: number;
      readonly chunkStartOffset: bigint;
      readonly logTimeNs: bigint;
      readonly messageOffset: bigint;
      readonly topic: string;
    },
    void,
    void
  >;
  readonly readMessages?: (args?: {
    readonly endTime?: bigint;
    readonly startTime?: bigint;
    readonly topics?: readonly string[];
  }) => AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void>;
  readonly schemasById?: ReadonlyMap<
    number,
    McapTypes.TypedMcapRecords["Schema"]
  >;
  readonly statistics?: McapTypes.TypedMcapRecords["Statistics"];
} = {}) {
  return {
    channelsById,
    chunkIndexes,
    readIndexedMessageTimes,
    readMessages:
      readMessages ??
      vi.fn(async function* () {
        for (const message of messages) {
          yield message;
        }
      }),
    schemasById,
    statistics,
  };
}

function createIndexedMessageTime(
  topic: string,
  channelId: number,
  logTimeNs: bigint,
  messageOffset: bigint
) {
  return {
    channelId,
    chunkStartOffset: 1_000n,
    logTimeNs,
    messageOffset,
    topic,
  };
}

function createTestDecodeClient(): DecodeResourceClient {
  return {
    decode: vi.fn(async (request) => ({
      context: request.context,
      decoderId: "test-decoder",
      decoderVersion: "1",
      output: createTestDecodedOutput(),
      payload: request.payload,
    })),
  };
}

function createTestDecodedOutput(
  overrides: Partial<DecodedOutput> = {}
): DecodedOutput {
  return {
    attributes: {},
    visualization: {
      bytes: new Uint8Array([5]),
      kind: VISUALIZATION_KIND.ENCODED_IMAGE,
    },
    ...overrides,
  };
}

function createChannel(
  options: Partial<McapTypes.TypedMcapRecords["Channel"]> = {}
): McapTypes.TypedMcapRecords["Channel"] {
  return {
    id: options.id ?? 7,
    messageEncoding: options.messageEncoding ?? "protobuf",
    metadata: options.metadata ?? new Map(),
    schemaId: options.schemaId ?? 3,
    topic: options.topic ?? "/topic",
    type: "Channel",
  };
}

function createSchema(
  data: Uint8Array,
  options: Partial<McapTypes.TypedMcapRecords["Schema"]> = {}
): McapTypes.TypedMcapRecords["Schema"] {
  return {
    data,
    encoding: options.encoding ?? "protobuf",
    id: options.id ?? 3,
    name: options.name ?? "foxglove.CompressedImage",
    type: "Schema",
  };
}

function createStatistics(
  options: Partial<McapTypes.TypedMcapRecords["Statistics"]> = {}
): McapTypes.TypedMcapRecords["Statistics"] {
  return {
    attachmentCount: options.attachmentCount ?? 0,
    channelCount: options.channelCount ?? 0,
    channelMessageCounts: options.channelMessageCounts ?? new Map(),
    chunkCount: options.chunkCount ?? 0,
    messageCount: options.messageCount ?? 0n,
    messageEndTime: options.messageEndTime ?? 0n,
    messageStartTime: options.messageStartTime ?? 0n,
    metadataCount: options.metadataCount ?? 0,
    schemaCount: options.schemaCount ?? 0,
    type: "Statistics",
  };
}

function createChunkIndex(
  options: Partial<McapTypes.TypedMcapRecords["ChunkIndex"]> = {}
): McapTypes.TypedMcapRecords["ChunkIndex"] {
  return {
    chunkLength: options.chunkLength ?? 256n,
    chunkStartOffset: options.chunkStartOffset ?? 1_000n,
    compressedSize: options.compressedSize ?? 0n,
    compression: options.compression ?? "",
    messageEndTime: options.messageEndTime ?? 20n,
    messageIndexLength: options.messageIndexLength ?? 0n,
    messageIndexOffsets: options.messageIndexOffsets ?? new Map(),
    messageStartTime: options.messageStartTime ?? 10n,
    type: "ChunkIndex",
    uncompressedSize: options.uncompressedSize ?? 0n,
  };
}

function createMessage(
  data: Uint8Array,
  options: Partial<McapTypes.TypedMcapRecords["Message"]> = {}
): McapTypes.TypedMcapRecords["Message"] {
  return {
    channelId: options.channelId ?? 7,
    data,
    logTime: options.logTime ?? 100n,
    publishTime: options.publishTime ?? 101n,
    sequence: options.sequence ?? 2,
    type: "Message",
  };
}
