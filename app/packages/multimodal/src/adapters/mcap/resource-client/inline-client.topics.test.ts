import { describe, expect, it, vi } from "vitest";
import { createInlineMcapResourceClient } from "./inline-client";
import {
  asyncValues,
  createChannel,
  createChunkIndex,
  createMcapSourceDescriptor,
  createMessage,
  createReader,
  createSchema,
  createStatistics,
  createTestDecodeClient,
  mockReaderFactory,
} from "./inline-client.test-fixtures";

describe("MCAP topic metadata", () => {
  it("reads topic inventory from summary channels without scanning messages", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = vi.fn(() => asyncValues([]));
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: mockReaderFactory(() =>
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
        }),
      ),
    });

    const { streams: topics } = await client.readTopics({ source });

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
    expect(topics[1]?.metadata["mcap.channel_metadata.frame_id"]).toBe(
      "cam-left",
    );
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

  it("mirrors channel frame_id metadata without a typed stream frame", async () => {
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              7,
              createChannel({
                id: 7,
                metadata: new Map([["frame_id", "raw-camera-front"]]),
                topic: "/camera",
              }),
            ],
            [
              8,
              createChannel({
                id: 8,
                metadata: new Map([["frame_id", "lidar-top"]]),
                topic: "/lidar",
              }),
            ],
          ]),
        }),
      ),
    });

    const { streams: topics } = await client.readTopics({
      source: createMcapSourceDescriptor(),
    });

    expect(topics[0]?.metadata["mcap.channel_metadata.frame_id"]).toBe(
      "raw-camera-front",
    );
    expect(topics[1]?.metadata["mcap.channel_metadata.frame_id"]).toBe(
      "lidar-top",
    );
  });

  it("annotates generic decode availability in topic inventory", async () => {
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              7,
              createChannel({
                id: 7,
                messageEncoding: "json",
                schemaId: 0,
                topic: "/state",
              }),
            ],
            [
              8,
              createChannel({
                id: 8,
                messageEncoding: "ros1",
                schemaId: 4,
                topic: "/imu",
              }),
            ],
            [
              9,
              createChannel({
                id: 9,
                messageEncoding: "cbor",
                schemaId: 0,
                topic: "/binary",
              }),
            ],
          ]),
          schemasById: new Map([
            [
              4,
              createSchema(new Uint8Array(), {
                encoding: "ros1msg",
                id: 4,
                name: "sensor_msgs/Imu",
              }),
            ],
          ]),
        }),
      ),
    });

    const { streams: topics } = await client.readTopics({
      source: createMcapSourceDescriptor(),
    });

    expect(
      topics.map((topic) => topic.metadata["mcap.generic_decode_status"]),
    ).toEqual(["decodable", "schema-unavailable", "unsupported-encoding"]);
  });

  it("caches topic reads by source", async () => {
    const source = createMcapSourceDescriptor();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
          ]),
        }),
      ),
    });

    const first = await client.readTopics({ source });
    const second = await client.readTopics({ source });

    expect(second).toBe(first);
  });

  it("caches schema and bounded numeric enumeration phases separately", async () => {
    const source = createMcapSourceDescriptor();
    const readIndexedMessageTimes = vi.fn(() =>
      asyncValues([
        {
          channelId: 7,
          chunkStartOffset: 1_000n,
          logTimeNs: 10n,
          messageOffset: 0n,
          topic: "/state",
        },
      ]),
    );
    const readIndexedMessages = vi.fn(() =>
      Promise.resolve([
        createMessage(
          new TextEncoder().encode(JSON.stringify({ speed: 3.2 })),
          {
            channelId: 7,
            logTime: 10n,
          },
        ),
      ]),
    );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        createReader({
          channelsById: new Map([
            [
              7,
              createChannel({
                id: 7,
                messageEncoding: "json",
                schemaId: 0,
                topic: "/state",
              }),
            ],
          ]),
          chunkIndexes: [
            createChunkIndex({
              messageIndexOffsets: new Map([[7, 2_000n]]),
            }),
          ],
          readIndexedMessages,
          readIndexedMessageTimes,
          schemasById: new Map(),
        }),
      ),
    });

    const schema = await client.enumerateNumericFields({
      includeDataFallback: false,
      source,
    });
    const bounded = await client.enumerateNumericFields({
      includeDataFallback: true,
      source,
    });

    expect(schema[0]?.fields).toEqual([]);
    expect(bounded[0]?.fields).toEqual([
      { path: "speed", valueType: "number" },
    ]);
    expect(readIndexedMessageTimes).toHaveBeenCalledOnce();
    expect(readIndexedMessages).toHaveBeenCalledOnce();
  });

  it("matches MCAP adapter topic fallbacks for missing schema and stats", async () => {
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
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
        }),
      ),
    });

    const { streams: topics } = await client.readTopics({
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

  it("soft-fails topic time bounds to nulls without summary indexes", async () => {
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() => createReader()),
    });

    await expect(
      client.readTopicTimeBounds({
        source: createMcapSourceDescriptor(),
        topics: ["/camera", "/lidar"],
      }),
    ).resolves.toEqual([
      { firstMessageTimeNs: null, lastMessageTimeNs: null, topic: "/camera" },
      { firstMessageTimeNs: null, lastMessageTimeNs: null, topic: "/lidar" },
    ]);
  });

  it("caches topic time bounds per source and topic set", async () => {
    const readTopicIndexedTimeBounds = vi.fn(() =>
      Promise.resolve(
        new Map([["/camera", { firstLogTimeNs: 10n, lastLogTimeNs: 90n }]]),
      ),
    );
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: mockReaderFactory(() =>
        Object.assign(createReader({ chunkIndexes: [createChunkIndex()] }), {
          readTopicIndexedTimeBounds,
        }),
      ),
    });
    const request = {
      source: createMcapSourceDescriptor(),
      topics: ["/camera"],
    };

    await expect(client.readTopicTimeBounds(request)).resolves.toEqual([
      { firstMessageTimeNs: 10n, lastMessageTimeNs: 90n, topic: "/camera" },
    ]);
    await client.readTopicTimeBounds(request);
    expect(readTopicIndexedTimeBounds).toHaveBeenCalledTimes(1);
  });
});
