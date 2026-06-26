import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type { DecodeClient } from "../../../query/decode";
import type { DecodedOutput } from "../../../decoders";
import { PlaybackSyncMode } from "../../../schemas/v1";
import { VISUALIZATION_KIND } from "../../../visualization";
import { createInlineMcapResourceClient } from "./inline";
import { MCAP_ACTIVE_TIMELINE } from "../types";

const FRAME_TRANSFORM_SCHEMA_DATA = bytes(
  "CmcKH2dvb2dsZS9wcm90b2J1Zi90aW1lc3RhbXAucHJvdG8SD2dvb2dsZS5wcm90b2J1ZiIrCglUaW1lc3RhbXASDwoHc2Vjb25kcxgBIAEoAxINCgVuYW5vcxgCIAEoBWIGcHJvdG8zClYKFmZveGdsb3ZlL1ZlY3RvcjMucHJvdG8SCGZveGdsb3ZlIioKB1ZlY3RvcjMSCQoBeBgBIAEoARIJCgF5GAIgASgBEgkKAXoYAyABKAFiBnByb3RvMwpnChlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvEghmb3hnbG92ZSI4CgpRdWF0ZXJuaW9uEgkKAXgYASABKAESCQoBeRgCIAEoARIJCgF6GAMgASgBEgkKAXcYBCABKAFiBnByb3RvMwrIAgodZm94Z2xvdmUvRnJhbWVUcmFuc2Zvcm0ucHJvdG8SCGZveGdsb3ZlGh9nb29nbGUvcHJvdG9idWYuVGltZXN0YW1wLnByb3RvGhZmb3hnbG92ZS9WZWN0b3IzLnByb3RvGhlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvIsABCg5GcmFtZVRyYW5zZm9ybRItCgl0aW1lc3RhbXAYASABKAsyGi5nb29nbGUucHJvdG9idWYuVGltZXN0YW1wEhcKD3BhcmVudF9mcmFtZV9pZBgCIAEoCRIWCg5jaGlsZF9mcmFtZV9pZBgDIAEoCRImCgt0cmFuc2xhdGlvbhgEIAEoCzIRLmZveGdsb3ZlLlZlY3RvcjMSJgoIcm90YXRpb24YBSABKAsyFC5mb3hnbG92ZS5RdWF0ZXJuaW9uYgZwcm90bzM=",
);
const FRAME_TRANSFORMS_SCHEMA_DATA = bytes(
  "CmcKH2dvb2dsZS9wcm90b2J1Zi90aW1lc3RhbXAucHJvdG8SD2dvb2dsZS5wcm90b2J1ZiIrCglUaW1lc3RhbXASDwoHc2Vjb25kcxgBIAEoAxINCgVuYW5vcxgCIAEoBWIGcHJvdG8zClYKFmZveGdsb3ZlL1ZlY3RvcjMucHJvdG8SCGZveGdsb3ZlIioKB1ZlY3RvcjMSCQoBeBgBIAEoARIJCgF5GAIgASgBEgkKAXoYAyABKAFiBnByb3RvMwpnChlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvEghmb3hnbG92ZSI4CgpRdWF0ZXJuaW9uEgkKAXgYASABKAESCQoBeRgCIAEoARIJCgF6GAMgASgBEgkKAXcYBCABKAFiBnByb3RvMwrIAgodZm94Z2xvdmUvRnJhbWVUcmFuc2Zvcm0ucHJvdG8SCGZveGdsb3ZlGh9nb29nbGUvcHJvdG9idWYuVGltZXN0YW1wLnByb3RvGhZmb3hnbG92ZS9WZWN0b3IzLnByb3RvGhlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvIsABCg5GcmFtZVRyYW5zZm9ybRItCgl0aW1lc3RhbXAYASABKAsyGi5nb29nbGUucHJvdG9idWYuVGltZXN0YW1wEhcKD3BhcmVudF9mcmFtZV9pZBgCIAEoCRIWCg5jaGlsZF9mcmFtZV9pZBgDIAEoCRImCgt0cmFuc2xhdGlvbhgEIAEoCzIRLmZveGdsb3ZlLlZlY3RvcjMSJgoIcm90YXRpb24YBSABKAsyFC5mb3hnbG92ZS5RdWF0ZXJuaW9uYgZwcm90bzMKkgEKHmZveGdsb3ZlL0ZyYW1lVHJhbnNmb3Jtcy5wcm90bxIIZm94Z2xvdmUaHWZveGdsb3ZlL0ZyYW1lVHJhbnNmb3JtLnByb3RvIj8KD0ZyYW1lVHJhbnNmb3JtcxIsCgp0cmFuc2Zvcm1zGAEgAygLMhguZm94Z2xvdmUuRnJhbWVUcmFuc2Zvcm1iBnByb3RvMw==",
);
const FRAME_TRANSFORM_MESSAGE = bytes(
  "CgQIBxAUEgNtYXAaBWxpZGFyIhsJAAAAAAAA8D8RAAAAAAAAAEAZAAAAAAAACEAqJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPw==",
);
const FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP = bytes(
  "EgNtYXAaBWxpZGFyIhsJAAAAAAAA8D8RAAAAAAAAAEAZAAAAAAAACEAqJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPw==",
);
const FRAME_TRANSFORMS_MESSAGE_WITHOUT_TIMESTAMP = bytes(
  "ClMSA21hcBoJYmFzZV9saW5rIhsJAAAAAAAA8D8RAAAAAAAAAAAZAAAAAAAAAAAqJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPwpVEgliYXNlX2xpbmsaBWxpZGFyIhsJAAAAAAAAAAARAAAAAAAAAEAZAAAAAAAAAAAqJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPw==",
);

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
        }),
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
      readerFactory: vi.fn(async () =>
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

    const topics = await client.readTopics({
      source: createMcapSourceDescriptor(),
    });

    expect(topics[0]?.metadata["mcap.channel_metadata.frame_id"]).toBe(
      "raw-camera-front",
    );
    expect(topics[1]?.metadata["mcap.channel_metadata.frame_id"]).toBe(
      "lidar-top",
    );
  });

  it("caches topic reads by source", async () => {
    const source = createMcapSourceDescriptor();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
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
        }),
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

  it("returns an empty frame transform bootstrap when no transform-schema channels exist", async () => {
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readMessages,
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(set).toEqual({ samples: [] });
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("discovers foxglove.FrameTransform channels by schema regardless of topic name", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/sensor_calibration",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).toHaveBeenCalledWith({
      topics: ["/sensor_calibration"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
    expect(set.samples[0]?.timeNs).toBeUndefined();
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("includes bootstrap transform channels when summary stats are unavailable", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).toHaveBeenCalledWith({
      topics: ["/tf_static"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
  });

  it("flattens foxglove.FrameTransforms bootstrap messages and caches reads", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORMS_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/calibration_bundle",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORMS_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransforms",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const first = await client.readFrameTransformBootstrap({ source });
    const second = await client.readFrameTransformBootstrap({ source });

    expect(second).toBe(first);
    expect(readMessages).toHaveBeenCalledTimes(1);
    expect(first.samples.map((sample) => sample.timeNs)).toEqual([
      undefined,
      undefined,
    ]);
    expect(first.samples.map((sample) => sample.childFrameId)).toEqual([
      "lidar",
      "base_link",
    ]);
    expect(first.samples.map((sample) => sample.parentFrameId)).toEqual([
      "base_link",
      "map",
    ]);
  });

  it("reads dynamic frame transform windows from any schema-discovered topic", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE, {
        channelId: 10,
        logTime: 7_000_000_020n,
      });
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/robot_transforms",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 7_000_000_020n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 7_000_000_020n,
    });

    expect(readMessages).toHaveBeenCalledWith({
      endTime: 7_000_000_020n,
      startTime: 7_000_000_020n,
      topics: ["/robot_transforms"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
      timeNs: 7_000_000_020n,
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("keeps dynamic frame transform window reads in a bounded LRU cache", async () => {
    const source = createMcapSourceDescriptor();
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
        }),
      ),
    });

    await client.readFrameTransformWindow({
      endTimeNs: 0n,
      source,
      startTimeNs: 0n,
    });
    await client.readFrameTransformWindow({
      endTimeNs: 0n,
      source,
      startTimeNs: 0n,
    });

    expect(readMessages).toHaveBeenCalledTimes(1);

    for (let index = 1; index <= 32; index += 1) {
      await client.readFrameTransformWindow({
        endTimeNs: BigInt(index),
        source,
        startTimeNs: BigInt(index),
      });
    }
    await client.readFrameTransformWindow({
      endTimeNs: 0n,
      source,
      startTimeNs: 0n,
    });

    expect(readMessages).toHaveBeenCalledTimes(34);
  });

  it("treats window samples without a message timestamp as static (no timeNs)", async () => {
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/robot_transforms",
              }),
            ],
          ]),
          messages: [
            createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
              channelId: 10,
              logTime: 100n,
            }),
          ],
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 100n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 100n,
    });

    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]?.timeNs).toBeUndefined();
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
  });

  it("skips channels whose schema is not a Foxglove frame transform", async () => {
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/example/transforms",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(new Uint8Array([9]), {
                id: 10,
                name: "example.Transform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 1n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(set.samples).toEqual([]);
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("defers bootstrap scans of channels with message counts above the cap", async () => {
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [
              10,
              createChannel({
                id: 10,
                schemaId: 10,
                topic: "/dense_tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
                id: 10,
                name: "foxglove.FrameTransform",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 10_000n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(set.samples).toEqual([]);
    expect(readMessages).not.toHaveBeenCalled();
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
        }),
      ),
    });

    const messages = await collect(
      client.readDecodedMessages({
        limit: 1,
        source,
        topics: ["/topic"],
      }),
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
        }),
      ),
    });

    await expect(
      collect(
        client.readDecodedMessages({
          limit: 0,
          source: createMcapSourceDescriptor(),
          topics: ["/topic"],
        }),
      ),
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
        }),
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
      windows[0]?.messages.map((message) => message.timelineTimeNs),
    ).toEqual([90n, 108n]);
    expect(
      windows[1]?.messages.map((message) => message.timelineTimeNs),
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
        }),
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
        }),
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
      windows[0]?.messages.map((message) => message.timelineTimeNs),
    ).toEqual([90n, 108n]);
    expect(
      windows[1]?.messages.map((message) => message.timelineTimeNs),
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

  it("soft-fails topic time bounds to nulls without summary indexes", async () => {
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => createReader()),
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
    const readTopicIndexedTimeBounds = vi.fn(async () => {
      return new Map([
        ["/camera", { firstLogTimeNs: 10n, lastLogTimeNs: 90n }],
      ]);
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
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

  it("serves sparse topics from one bounded scan plus one predecessor probe", async () => {
    const source = createMcapSourceDescriptor();
    const old = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 0n,
      publishTime: 1n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      // Nothing in the scan window — the topic is sparse around the batch.
    });
    const readLatestIndexedMessageTimes = vi.fn(async () => {
      return new Map([
        ["/topic", [createIndexedMessageTime("/topic", 7, 0n, 0n)]],
      ]);
    });
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
      readonly topics?: readonly string[];
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (args?.startTime === 0n && args?.endTime === 0n) {
        yield old;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [5_000n, 5_033n],
      source,
      topics: ["/topic"],
    });

    // Both ticks resolve the far-past predecessor under the default
    // unbounded-latest policy.
    expect(windows).toHaveLength(2);
    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.timelineTimeNs).toBe(0n);
    expect(windows[1]?.messagesByTopic["/topic"]?.[0]?.timelineTimeNs).toBe(0n);

    // The scan stays bounded by the batch tick span — never the file.
    expect(readIndexedMessageTimes).toHaveBeenCalledWith({
      endTimeNs: 5_033n,
      startTimeNs: 5_000n,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      limitPerTopic: 1,
      timeNs: 5_000n,
      topics: ["/topic"],
    });
  });

  it("backfills enough indexed predecessors to satisfy latest limits", async () => {
    const source = createMcapSourceDescriptor();
    const older = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 80n,
      publishTime: 81n,
    });
    const newer = createMessage(new Uint8Array([2]), {
      channelId: 7,
      logTime: 90n,
      publishTime: 91n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime("/topic", 7, 90n, 900n);
    });
    const readLatestIndexedMessageTimes = vi.fn(async () => {
      return new Map([
        [
          "/topic",
          [
            createIndexedMessageTime("/topic", 7, 90n, 900n),
            createIndexedMessageTime("/topic", 7, 80n, 800n),
          ],
        ],
      ]);
    });
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (args?.startTime === 80n && args?.endTime === 80n) {
        yield older;
      }
      if (args?.startTime === 90n && args?.endTime === 90n) {
        yield newer;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n],
      source,
      streamPolicies: {
        "/topic": {
          limit: 2,
          mode: PlaybackSyncMode.LATEST,
        },
      },
      topics: ["/topic"],
    });

    expect(
      windows[0]?.messagesByTopic["/topic"]?.map(
        (message) => message.timelineTimeNs,
      ),
    ).toEqual([80n, 90n]);
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      limitPerTopic: 2,
      timeNs: 100n,
      topics: ["/topic"],
    });
  });

  it("memoizes predecessor lookups across batches and re-probes on backward seeks", async () => {
    const source = createMcapSourceDescriptor();
    const message = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 4_000n,
      publishTime: 4_001n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      // Every scan window misses the lone message at 4_000n.
    });
    const readLatestIndexedMessageTimes = vi.fn(
      async (args: { readonly timeNs: bigint }) => {
        return new Map([
          [
            "/topic",
            args.timeNs >= 4_000n
              ? [createIndexedMessageTime("/topic", 7, 4_000n, 0n)]
              : [],
          ],
        ]);
      },
    );
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (args?.startTime === 4_000n && args?.endTime === 4_000n) {
        yield message;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    // First batch probes once and memoizes the resolution.
    await client.readSynchronizedMessageBatch({
      timeNs: [5_000n, 5_033n],
      source,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(1);

    // Overlapping later batch: memo hit, and its empty scan extends the
    // memo's validity through 6_000n.
    await client.readSynchronizedMessageBatch({
      timeNs: [5_010n, 6_000n],
      source,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(1);

    // Within the extended interval: still no probe.
    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [5_900n],
      source,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(1);
    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.timelineTimeNs).toBe(
      4_000n,
    );

    // Backward seek before the memoized predecessor: fresh probe.
    const earlier = await client.readSynchronizedMessageBatch({
      timeNs: [100n],
      source,
      topics: ["/topic"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(2);
    expect(readLatestIndexedMessageTimes).toHaveBeenLastCalledWith({
      limitPerTopic: 1,
      timeNs: 100n,
      topics: ["/topic"],
    });
    expect(earlier[0]?.messagesByTopic["/topic"]).toEqual([]);
  });

  it("skips the predecessor probe when another topic's tolerance already covers it", async () => {
    const source = createMcapSourceDescriptor();
    const camera = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 90n,
      publishTime: 91n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime("/camera", 7, 90n, 900n);
    });
    const readLatestIndexedMessageTimes = vi.fn(async () => new Map());
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (args?.startTime === 90n && args?.endTime === 90n) {
        yield camera;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
            [8, createChannel({ id: 8, topic: "/lidar" })],
          ]),
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n],
      source,
      streamPolicies: {
        "/lidar": {
          mode: PlaybackSyncMode.NEAREST,
          toleranceAfterNs: 0n,
          toleranceBeforeNs: 20n,
        },
      },
      topics: ["/camera", "/lidar"],
    });

    // The lidar tolerance widened the shared scan to [80, 100], which
    // already contains the camera predecessor — no probe needed.
    expect(readIndexedMessageTimes).toHaveBeenCalledWith({
      endTimeNs: 100n,
      startTimeNs: 80n,
      topics: ["/camera", "/lidar"],
    });
    expect(readLatestIndexedMessageTimes).not.toHaveBeenCalled();
    expect(windows[0]?.messagesByTopic["/camera"]?.[0]?.timelineTimeNs).toBe(
      90n,
    );
  });

  it("surfaces predecessor probe failures as batch failures", async () => {
    const source = createMcapSourceDescriptor();
    const readIndexedMessageTimes = vi.fn(async function* () {
      // empty scan forces the probe
    });
    const readLatestIndexedMessageTimes = vi.fn(async () => {
      throw new Error("index read failed");
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
        }),
      ),
    });

    await expect(
      client.readSynchronizedMessageBatch({
        timeNs: [5_000n],
        source,
        topics: ["/topic"],
      }),
    ).rejects.toThrow("index read failed");
  });

  it("falls back to a bounded raw lookback for readers without indexes", async () => {
    const source = createMcapSourceDescriptor();
    const old = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 1_000n,
      publishTime: 1_001n,
    });
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
    }): AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void> {
      if (
        args?.startTime !== undefined &&
        args?.endTime !== undefined &&
        old.logTime >= args.startTime &&
        old.logTime <= args.endTime
      ) {
        yield old;
      }
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => createReader({ readMessages })),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [5_000n],
      source,
      topics: ["/topic"],
    });

    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.timelineTimeNs).toBe(
      1_000n,
    );
    // One bounded scan plus one bounded lookback — clamped at 0, never
    // the whole file beyond the documented lookback.
    expect(readMessages.mock.calls.map(([args]) => args)).toEqual([
      { endTime: 5_000n, startTime: 5_000n, topics: ["/topic"] },
      { endTime: 5_000n, startTime: 0n, topics: ["/topic"] },
    ]);
  });

  it("resolves duplicate same-time messages to one deterministic frame", async () => {
    // Real recordings can carry multiple messages on one channel at
    // the same log time. The whole batch used to reject on the
    // ambiguity, permanently failing every topic it covered.
    const source = createMcapSourceDescriptor();
    const first = createMessage(new Uint8Array([1]), {
      logTime: 90n,
      publishTime: 91n,
      sequence: 1,
    });
    const second = createMessage(new Uint8Array([2]), {
      logTime: 90n,
      publishTime: 92n,
      sequence: 2,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      // Duplicate index entries for the duplicate messages.
      yield createIndexedMessageTime("/topic", 7, 90n, 900n);
      yield createIndexedMessageTime("/topic", 7, 90n, 901n);
    });
    const readMessages = vi.fn(async function* () {
      yield first;
      yield second;
    });
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [90n],
      source,
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.STRICT,
      },
      topics: ["/topic"],
    });

    // One frame, deterministically the lowest-sequence duplicate, and
    // one decode — the duplicate index entry collapsed at collection.
    expect(windows[0]?.messagesByTopic["/topic"]).toHaveLength(1);
    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.sequence).toBe(1);
    expect(windows[0]?.messagesByTopic["/topic"]?.[0]?.publishTimeNs).toBe(91n);
    expect(decodeClient.decode).toHaveBeenCalledTimes(1);
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
      }),
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
        }),
      ),
    });

    await expect(
      client.readTimelineRange({
        source,
      }),
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
        }),
      ),
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
        }),
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
      "temporary init failure",
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
  generator: AsyncGenerator<T, void, void>,
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
  readLatestIndexedMessageTimes,
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
  readonly readLatestIndexedMessageTimes?: (args: {
    readonly limitPerTopic?: number;
    readonly timeNs: bigint;
    readonly topics: readonly string[];
  }) => Promise<
    ReadonlyMap<
      string,
      readonly {
        readonly channelId: number;
        readonly chunkStartOffset: bigint;
        readonly logTimeNs: bigint;
        readonly messageOffset: bigint;
        readonly topic: string;
      }[]
    >
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
    readLatestIndexedMessageTimes,
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
  messageOffset: bigint,
) {
  return {
    channelId,
    chunkStartOffset: 1_000n,
    logTimeNs,
    messageOffset,
    topic,
  };
}

function createTestDecodeClient(): DecodeClient {
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
  overrides: Partial<DecodedOutput> = {},
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
  options: Partial<McapTypes.TypedMcapRecords["Channel"]> = {},
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
  options: Partial<McapTypes.TypedMcapRecords["Schema"]> = {},
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
  options: Partial<McapTypes.TypedMcapRecords["Statistics"]> = {},
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
  options: Partial<McapTypes.TypedMcapRecords["ChunkIndex"]> = {},
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
  options: Partial<McapTypes.TypedMcapRecords["Message"]> = {},
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

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
