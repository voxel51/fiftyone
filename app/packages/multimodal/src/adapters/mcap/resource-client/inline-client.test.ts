import { parse as parseRosMessageDefinition } from "@foxglove/rosmsg";
import { parseRos2idl } from "@foxglove/ros2idl-parser";
import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import type { McapTypes } from "@mcap/core";
import { describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes/index";
import type { DecodeClient } from "../../../query/decoding/index";
import type { DecodedOutput } from "../../../ir/index";
import { isEpisodeReadCancelledError } from "../../../ports/index";
import { PlaybackSyncMode } from "../../../schemas/v1/index";
import { VISUALIZATION_KIND } from "../../../ir/index";
import type {
  McapBoundedMessageReadResult,
  McapIndexedMessageTime,
  McapIndexedReaderLike,
} from "../reader/index";
import { createInlineMcapResourceClient } from "./inline-client";
import { MCAP_ACTIVE_TIMELINE } from "../contracts/index";

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
const CUSTOM_TRANSFORM_BUNDLE_SCHEMA_DATA = bytes(
  "CrECCgxjdXN0b20ucHJvdG8SBmN1c3RvbSInCgRWZWMzEgkKAXgYASABKAESCQoBeRgCIAEoARIJCgF6GAMgASgBIjIKBFF1YXQSCQoBeBgBIAEoARIJCgF5GAIgASgBEgkKAXoYAyABKAESCQoBdxgEIAEoASJ6ChRDYWxpYnJhdGlvblRyYW5zZm9ybRIXCg9wYXJlbnRfZnJhbWVfaWQYASABKAkSFgoOY2hpbGRfZnJhbWVfaWQYAiABKAkSGQoLdHJhbnNsYXRpb24YAyABKAsyBFZlYzMSFgoIcm90YXRpb24YBCABKAsyBFF1YXQiOAoRQ2FsaWJyYXRpb25CdW5kbGUSIwoFcG9zZXMYASADKAsyFENhbGlicmF0aW9uVHJhbnNmb3JtYgZwcm90bzM=",
);
const CUSTOM_TRANSFORM_BUNDLE_MESSAGE = bytes(
  "ClYKA21hcBIMY3VzdG9tX2xpZGFyGhsJAAAAAAAAEEARAAAAAAAAFEAZAAAAAAAAGEAiJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPw==",
);
const ROS1_TF_MESSAGE_SCHEMA = `geometry_msgs/TransformStamped[] transforms
===
MSG: geometry_msgs/TransformStamped
std_msgs/Header header
string child_frame_id
geometry_msgs/Transform transform
===
MSG: std_msgs/Header
uint32 seq
time stamp
string frame_id
===
MSG: geometry_msgs/Transform
geometry_msgs/Vector3 translation
geometry_msgs/Quaternion rotation
===
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;
const ROS2_TF_MESSAGE_SCHEMA = `geometry_msgs/TransformStamped[] transforms
===
MSG: geometry_msgs/TransformStamped
std_msgs/Header header
string child_frame_id
geometry_msgs/Transform transform
===
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
===
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
===
MSG: geometry_msgs/Transform
geometry_msgs/Vector3 translation
geometry_msgs/Quaternion rotation
===
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z
===
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;
const FOXGLOVE_ROS2_FRAME_TRANSFORM_SCHEMA = `builtin_interfaces/Time timestamp
string parent_frame_id
string child_frame_id
foxglove_msgs/Vector3 translation
foxglove_msgs/Quaternion rotation
===
MSG: foxglove_msgs/Vector3
float64 x
float64 y
float64 z
===
MSG: foxglove_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w
===
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;
const FOXGLOVE_ROS2_FRAME_TRANSFORMS_SCHEMA = `foxglove_msgs/FrameTransform[] transforms
===
MSG: foxglove_msgs/FrameTransform
builtin_interfaces/Time timestamp
string parent_frame_id
string child_frame_id
foxglove_msgs/Vector3 translation
foxglove_msgs/Quaternion rotation
===
MSG: foxglove_msgs/Vector3
float64 x
float64 y
float64 z
===
MSG: foxglove_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w
===
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec`;
const ROS2_IDL_TF_MESSAGE_SCHEMA = `module tf2_msgs {
  module msg {
    struct TFMessage {
      sequence<geometry_msgs::msg::TransformStamped> transforms;
    };
  };
};
module geometry_msgs {
  module msg {
    struct TransformStamped {
      std_msgs::msg::Header header;
      string child_frame_id;
      Transform transform;
    };
    struct Transform {
      Vector3 translation;
      Quaternion rotation;
    };
    struct Vector3 {
      double x;
      double y;
      double z;
    };
    struct Quaternion {
      double x;
      double y;
      double z;
      double w;
    };
  };
};
module std_msgs {
  module msg {
    struct Header {
      builtin_interfaces::msg::Time stamp;
      string frame_id;
    };
  };
};
module builtin_interfaces {
  module msg {
    struct Time {
      long sec;
      unsigned long nanosec;
    };
  };
};`;

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

  it("annotates generic decode availability in topic inventory", async () => {
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

    const topics = await client.readTopics({
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

  it("caches schema and bounded numeric enumeration phases separately", async () => {
    const source = createMcapSourceDescriptor();
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield {
        channelId: 7,
        chunkStartOffset: 1_000n,
        logTimeNs: 10n,
        messageOffset: 0n,
        topic: "/state",
      };
    });
    const readIndexedMessages = vi.fn(async () => [
      createMessage(new TextEncoder().encode(JSON.stringify({ speed: 3.2 })), {
        channelId: 7,
        logTime: 10n,
      }),
    ]);
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

  it("skips non-static transform topics during bootstrap", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE, {
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

    expect(readMessages).toHaveBeenCalledOnce();
    expect(readMessages).toHaveBeenCalledWith({
      topics: ["/sensor_calibration"],
    });
    expect(set.samples).toEqual([]);
  });

  it("bootstraps ambiguous transform topics when the first decoded message is static", async () => {
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

    expect(readMessages).toHaveBeenCalledTimes(2);
    expect(readMessages).toHaveBeenLastCalledWith({
      topics: ["/sensor_calibration"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
    expect(set.samples[0]?.timeNs).toBeUndefined();
  });

  it("discovers static foxglove.FrameTransform channels by schema", async () => {
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
                topic: "/robot/tf_static",
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
      topics: ["/robot/tf_static"],
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

  it("uses bounded indexed reads for static transform bootstrap", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const readBoundedMessages = vi.fn(async () =>
      createBoundedReadResult([
        createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
          channelId: 10,
        }),
      ]),
    );
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
          chunkIndexes: [
            createChunkIndex({
              messageIndexLength: 64n,
              messageIndexOffsets: new Map([[10, 900n]]),
              uncompressedSize: 256n,
            }),
          ],
          readBoundedMessages,
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

    const source = createMcapSourceDescriptor();
    const set = await client.readFrameTransformBootstrap({ source });
    const window = await client.readFrameTransformWindow({
      endTimeNs: 100n,
      source,
      startTimeNs: 100n,
    });

    expect(readMessages).not.toHaveBeenCalled();
    expect(readBoundedMessages).toHaveBeenCalledOnce();
    expect(readBoundedMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        absoluteMaxChunks: 1,
        maxChunks: 1,
        topics: ["/tf_static"],
      }),
    );
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
    });
    expect(window.samples).toEqual([]);
  });

  it.each([
    { bounded: true, kind: "bounded" },
    { bounded: false, kind: "fallback" },
  ])(
    "keeps timestamped static-topic samples window-readable after $kind bootstrap",
    async ({ bounded }) => {
      const timeNs = 7_000_000_020n;
      const message = createMessage(FRAME_TRANSFORM_MESSAGE, {
        channelId: 10,
        logTime: timeNs,
      });
      const readBoundedMessages = vi.fn(async () =>
        createBoundedReadResult([message]),
      );
      const readMessages = vi.fn(async function* () {
        yield message;
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
            chunkIndexes: bounded
              ? [
                  createChunkIndex({
                    messageIndexLength: 64n,
                    messageIndexOffsets: new Map([[10, 900n]]),
                    uncompressedSize: 256n,
                  }),
                ]
              : [],
            readBoundedMessages,
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
      const source = createMcapSourceDescriptor();

      const bootstrap = await client.readFrameTransformBootstrap({ source });
      const window = await client.readFrameTransformWindow({
        endTimeNs: timeNs,
        source,
        startTimeNs: timeNs,
      });

      expect(bootstrap.samples).toEqual([]);
      expect(window.samples).toHaveLength(1);
      expect(window.samples[0]).toMatchObject({
        childFrameId: "lidar",
        parentFrameId: "map",
        timeNs,
      });
      expect(readBoundedMessages).toHaveBeenCalledTimes(bounded ? 1 : 0);
      expect(readMessages).toHaveBeenCalledTimes(bounded ? 1 : 2);
    },
  );

  it("drains bounded transform bootstrap continuations without partial results", async () => {
    const continuation = {
      nextChunkStartOffset: 2_000n,
      sourceKey: "source",
      topicsKey: "/tf_static",
      version: 1 as const,
    };
    const firstMessage = createMessage(
      FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
      { channelId: 10, logTime: 100n },
    );
    const secondMessage = createMessage(
      FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
      { channelId: 10, logTime: 200n },
    );
    const readBoundedMessages = vi
      .fn<NonNullable<McapIndexedReaderLike["readBoundedMessages"]>>()
      .mockResolvedValueOnce(
        createBoundedReadResult([firstMessage], {
          continuation,
          stopReason: "budget-exhausted",
        }),
      )
      .mockResolvedValueOnce(createBoundedReadResult([secondMessage]));
    const readMessages = vi.fn(async function* () {
      yield firstMessage;
      yield secondMessage;
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
          chunkIndexes: [
            createChunkIndex({
              messageIndexLength: 64n,
              messageIndexOffsets: new Map([[10, 900n]]),
              uncompressedSize: 256n,
            }),
            createChunkIndex({
              chunkStartOffset: 2_000n,
              messageEndTime: 40n,
              messageIndexLength: 64n,
              messageIndexOffsets: new Map([[10, 1_900n]]),
              messageStartTime: 30n,
              uncompressedSize: 256n,
            }),
          ],
          readBoundedMessages,
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
            channelMessageCounts: new Map([[10, 2n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).not.toHaveBeenCalled();
    expect(readBoundedMessages).toHaveBeenCalledTimes(2);
    expect(readBoundedMessages.mock.calls[1]?.[0]).toMatchObject({
      continuation,
      topics: ["/tf_static"],
    });
    expect(set.samples).toHaveLength(2);
  });

  it("defers missing-stat static channels that span more chunks than the cap", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const readBoundedMessages = vi.fn(async () => createBoundedReadResult([]));
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
          chunkIndexes: Array.from({ length: 257 }, (_, index) =>
            createChunkIndex({
              chunkStartOffset: BigInt(1_000 + index * 1_000),
              messageEndTime: BigInt(index * 2 + 1),
              messageIndexOffsets: new Map([[10, BigInt(index * 1_000 + 900)]]),
              messageStartTime: BigInt(index * 2),
            }),
          ),
          readBoundedMessages,
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

    expect(set.samples).toEqual([]);
    expect(readBoundedMessages).not.toHaveBeenCalled();
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("defers missing-stat static channels whose indexed messages exceed the cap", async () => {
    const readIndexedMessageTimes = vi.fn(async function* () {
      for (let index = 0; index < 257; index += 1) {
        yield createIndexedMessageTime(
          "/tf_static",
          10,
          BigInt(index),
          BigInt(index),
        );
      }
    });
    const readMessages = vi.fn(async function* () {
      yield createMessage(FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP, {
        channelId: 10,
      });
    });
    const readBoundedMessages = vi.fn(async () => createBoundedReadResult([]));
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
          chunkIndexes: [
            createChunkIndex({
              messageIndexOffsets: new Map([[10, 900n]]),
            }),
          ],
          readBoundedMessages,
          readIndexedMessageTimes,
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

    expect(set.samples).toEqual([]);
    expect(readIndexedMessageTimes).toHaveBeenCalledWith({
      limit: 257,
      topics: ["/tf_static"],
    });
    expect(readBoundedMessages).not.toHaveBeenCalled();
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("discovers transform-like protobuf schemas without Foxglove schema names", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(CUSTOM_TRANSFORM_BUNDLE_MESSAGE, {
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
                topic: "/static_transforms",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(CUSTOM_TRANSFORM_BUNDLE_SCHEMA_DATA, {
                id: 10,
                name: "custom.CalibrationBundle",
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
      topics: ["/static_transforms"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "custom_lidar",
      parentFrameId: "map",
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([4, 5, 6]);
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
                topic: "/tf_static",
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

  it("bootstraps ros1 /tf_static messages as whole-file static transforms", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(
        ros1TfMessage({
          transforms: [
            ros1TransformStamped({
              childFrameId: "base_link",
              parentFrameId: "map",
              stamp: { nsec: 20, sec: 7 },
              translation: { x: 1, y: 2, z: 3 },
            }),
          ],
        }),
        {
          channelId: 10,
          logTime: 10n,
        },
      );
      yield createMessage(
        ros1TfMessage({
          transforms: [
            ros1TransformStamped({
              childFrameId: "lidar",
              parentFrameId: "base_link",
              stamp: { nsec: 40, sec: 8 },
              translation: { x: 4, y: 5, z: 6 },
            }),
          ],
        }),
        {
          channelId: 10,
          logTime: 1_000n,
        },
      );
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
                messageEncoding: "ros1",
                schemaId: 10,
                topic: "/tf_static",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(new TextEncoder().encode(ROS1_TF_MESSAGE_SCHEMA), {
                encoding: "ros1msg",
                id: 10,
                name: "tf2_msgs/TFMessage",
              }),
            ],
          ]),
          statistics: createStatistics({
            channelMessageCounts: new Map([[10, 2n]]),
          }),
        }),
      ),
    });

    const set = await client.readFrameTransformBootstrap({
      source: createMcapSourceDescriptor(),
    });

    expect(readMessages).toHaveBeenCalledWith({
      topics: ["/tf_static"],
    });
    expect(set.samples).toHaveLength(2);
    expect(set.samples.map((sample) => sample.timeNs)).toEqual([
      undefined,
      undefined,
    ]);
    expect(set.samples.map((sample) => sample.childFrameId)).toEqual([
      "lidar",
      "base_link",
    ]);
    expect(set.samples.map((sample) => sample.parentFrameId)).toEqual([
      "base_link",
      "map",
    ]);
  });

  it("reads ros2 cdr TFMessage samples from dynamic frame transform windows", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(
        ros2TfMessage({
          transforms: [
            ros2TransformStamped({
              childFrameId: "base_link",
              parentFrameId: "map",
              stamp: { nanosec: 20, sec: 7 },
              translation: { x: 1, y: 2, z: 3 },
            }),
          ],
        }),
        {
          channelId: 10,
          logTime: 7_000_000_020n,
        },
      );
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
                messageEncoding: "cdr",
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(new TextEncoder().encode(ROS2_TF_MESSAGE_SCHEMA), {
                encoding: "ros2msg",
                id: 10,
                name: "tf2_msgs/msg/TFMessage",
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
      topics: ["/tf"],
    });
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "base_link",
      parentFrameId: "map",
      timeNs: 7_000_000_020n,
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("reads ros2 idl TFMessage samples from dynamic frame transform windows", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(
        ros2IdlTfMessage({
          transforms: [
            ros2IdlTransformStamped({
              childFrameId: "camera",
              parentFrameId: "base_link",
              stamp: { nsec: 30, sec: 9 },
              translation: { x: 4, y: 5, z: 6 },
            }),
          ],
        }),
        {
          channelId: 10,
          logTime: 9_000_000_030n,
        },
      );
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
                messageEncoding: "cdr",
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(
                new TextEncoder().encode(ROS2_IDL_TF_MESSAGE_SCHEMA),
                {
                  encoding: "ros2idl",
                  id: 10,
                  name: "tf2_msgs/msg/TFMessage",
                },
              ),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 9_000_000_030n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 9_000_000_030n,
    });

    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "camera",
      parentFrameId: "base_link",
      timeNs: 9_000_000_030n,
    });
    expect(set.samples[0]?.translation.toArray()).toEqual([4, 5, 6]);
  });

  it("reads foxglove_msgs cdr FrameTransforms samples from dynamic frame transform windows", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(
        foxgloveRos2FrameTransforms({
          transforms: [
            {
              child_frame_id: "lidar",
              parent_frame_id: "map",
              rotation: { w: 1, x: 0, y: 0, z: 0 },
              timestamp: { nanosec: 40, sec: 8 },
              translation: { x: 1, y: 2, z: 3 },
            },
          ],
        }),
        {
          channelId: 10,
          logTime: 8_000_000_040n,
        },
      );
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
                messageEncoding: "cdr",
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(
                new TextEncoder().encode(FOXGLOVE_ROS2_FRAME_TRANSFORMS_SCHEMA),
                {
                  encoding: "ros2msg",
                  id: 10,
                  name: "foxglove_msgs/msg/FrameTransforms",
                },
              ),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 8_000_000_040n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 8_000_000_040n,
    });

    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
      timeNs: 8_000_000_040n,
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("reads foxglove_msgs cdr FrameTransform samples from dynamic frame transform windows", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(
        foxgloveRos2FrameTransform({
          child_frame_id: "camera",
          parent_frame_id: "map",
          rotation: { w: 1, x: 0, y: 0, z: 0 },
          timestamp: { nanosec: 50, sec: 8 },
          translation: { x: 4, y: 5, z: 6 },
        }),
        {
          channelId: 10,
          logTime: 8_000_000_050n,
        },
      );
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
                messageEncoding: "cdr",
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(
                new TextEncoder().encode(FOXGLOVE_ROS2_FRAME_TRANSFORM_SCHEMA),
                {
                  encoding: "ros2msg",
                  id: 10,
                  name: "foxglove_msgs/msg/FrameTransform",
                },
              ),
            ],
          ]),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 8_000_000_050n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 8_000_000_050n,
    });

    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "camera",
      parentFrameId: "map",
      timeNs: 8_000_000_050n,
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([4, 5, 6]);
  });

  it("skips malformed ROS TFMessage payloads without failing the window", async () => {
    const readMessages = vi.fn(async function* () {
      yield createMessage(new Uint8Array([1, 2, 3]), {
        channelId: 10,
        logTime: 7_000_000_020n,
      });
      yield createMessage(
        ros1TfMessage({
          transforms: [
            ros1TransformStamped({
              childFrameId: "base_link",
              parentFrameId: "map",
              stamp: { nsec: 20, sec: 7 },
              translation: { x: 1, y: 2, z: 3 },
            }),
          ],
        }),
        {
          channelId: 10,
          logTime: 7_000_000_020n,
        },
      );
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
                messageEncoding: "ros1",
                schemaId: 10,
                topic: "/tf",
              }),
            ],
          ]),
          readMessages,
          schemasById: new Map([
            [
              10,
              createSchema(new TextEncoder().encode(ROS1_TF_MESSAGE_SCHEMA), {
                encoding: "ros1msg",
                id: 10,
                name: "tf2_msgs/TFMessage",
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

    expect(set.messageCount).toBe(2);
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "base_link",
      parentFrameId: "map",
    });
  });

  it("reads dynamic frame transform windows from any schema-discovered topic", async () => {
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime(
        "/robot_transforms",
        10,
        7_000_000_020n,
        200n,
      );
    });
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
          readIndexedMessageTimes,
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
    expect(readIndexedMessageTimes).not.toHaveBeenCalled();
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
      timeNs: 7_000_000_020n,
    });
    expect(set.samples[0]?.rotation.toArray()).toEqual([0, 0, 0, 1]);
    expect(set.samples[0]?.translation.toArray()).toEqual([1, 2, 3]);
  });

  it("materializes inclusive transform-window boundaries from exact indexed offsets", async () => {
    const startTimeNs = 7_000_000_020n;
    const endTimeNs = 8_000_000_020n;
    const startEntry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      startTimeNs,
      200n,
    );
    const endEntry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      endTimeNs,
      300n,
    );
    const entries = [
      createIndexedMessageTime("/robot_transforms", 10, startTimeNs - 1n, 100n),
      startEntry,
      endEntry,
      createIndexedMessageTime("/robot_transforms", 10, endTimeNs + 1n, 400n),
    ];
    const endPayload = FRAME_TRANSFORM_MESSAGE.slice();
    // Foxglove Timestamp.seconds is the one-byte varint at this offset in the
    // pinned fixture.
    endPayload[3] = 8;
    const messagesByTime = new Map([
      [
        startTimeNs,
        createMessage(FRAME_TRANSFORM_MESSAGE, {
          channelId: 10,
          logTime: startTimeNs,
        }),
      ],
      [
        endTimeNs,
        createMessage(endPayload, { channelId: 10, logTime: endTimeNs }),
      ],
    ]);
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield* entries;
    });
    const readIndexedMessages = vi.fn(
      async ({
        entries: selected,
      }: Parameters<
        NonNullable<McapIndexedReaderLike["readIndexedMessages"]>
      >[0]) =>
        selected.map((entry) => {
          const message = messagesByTime.get(entry.logTimeNs);
          if (!message) {
            throw new Error(`Missing test message at ${entry.logTimeNs}`);
          }
          return message;
        }),
    );
    const readMessages = vi.fn(async function* () {
      yield* [];
    });
    const prefetchChunkData = vi.fn(async () => undefined);
    const prefetchWindow = vi.fn(async () => undefined);
    const controller = new AbortController();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readSignal: { current: controller.signal },
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: transformChannelsById(),
          prefetchChunkData,
          prefetchWindow,
          readIndexedMessages,
          readIndexedMessageTimes,
          readMessages,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs,
      source: createMcapSourceDescriptor(),
      startTimeNs,
    });

    expect(prefetchWindow).toHaveBeenCalledExactlyOnceWith({
      endTimeNs,
      includeChunkData: false,
      startTimeNs,
      topics: ["/robot_transforms"],
    });
    expect(readIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      endTimeNs,
      startTimeNs,
      topics: ["/robot_transforms"],
    });
    expect(readIndexedMessages).toHaveBeenCalledExactlyOnceWith({
      entries: [startEntry, endEntry],
      signal: controller.signal,
    });
    expect(prefetchChunkData).toHaveBeenCalledExactlyOnceWith({
      chunkStartOffsets: [1_000n],
    });
    expect(readMessages).not.toHaveBeenCalled();
    expect(set.messageCount).toBe(2);
    expect(set.samples.map((sample) => sample.timeNs)).toEqual([
      startTimeNs,
      endTimeNs,
    ]);
  });

  it("matches fallback semantics when header time lands inside the window", async () => {
    const startTimeNs = 10_000_000_000n;
    const endTimeNs = 11_000_000_000n;
    const logTimeNs = 10_500_000_000n;
    const entry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      logTimeNs,
      200n,
    );
    const message = createMessage(FRAME_TRANSFORM_MESSAGE, {
      channelId: 10,
      logTime: logTimeNs,
    });
    const exactReadIndexedMessageTimes = vi.fn(async function* () {
      yield entry;
    });
    const exactReadIndexedMessages = vi.fn(async () => [message]);
    const exactReadMessages = vi.fn(async function* () {
      yield* [];
    });
    const fallbackReadMessages = vi.fn(async function* () {
      yield message;
    });
    const createTransformClient = (reader: ReturnType<typeof createReader>) =>
      createInlineMcapResourceClient({
        byteClient: { readBytes: vi.fn() },
        decodeClient: createTestDecodeClient(),
        readerFactory: vi.fn(async () => reader),
      });
    const exact = createTransformClient(
      createReader({
        channelsById: transformChannelsById(),
        readIndexedMessages: exactReadIndexedMessages,
        readIndexedMessageTimes: exactReadIndexedMessageTimes,
        readMessages: exactReadMessages,
        schemasById: transformSchemasById(),
      }),
    );
    const fallback = createTransformClient(
      createReader({
        channelsById: transformChannelsById(),
        readMessages: fallbackReadMessages,
        schemasById: transformSchemasById(),
      }),
    );
    const request = {
      endTimeNs,
      source: createMcapSourceDescriptor(),
      startTimeNs,
    };

    const exactSet = await exact.readFrameTransformWindow(request);
    const fallbackSet = await fallback.readFrameTransformWindow(request);

    expect(exactSet).toEqual(fallbackSet);
    expect(exactSet.samples).toHaveLength(1);
    expect(exactSet.samples[0]?.timeNs).toBe(7_000_000_020n);
    expect(exactReadMessages).not.toHaveBeenCalled();
    expect(fallbackReadMessages).toHaveBeenCalledExactlyOnceWith({
      endTime: endTimeNs,
      startTime: startTimeNs,
      topics: ["/robot_transforms"],
    });
  });

  it("materializes predecessor anchors through the same exact chunk cache", async () => {
    const anchorTimeNs = 7_000_000_020n;
    const anchor = createIndexedMessageTime(
      "/robot_transforms",
      10,
      anchorTimeNs,
      200n,
    );
    const message = createMessage(FRAME_TRANSFORM_MESSAGE, {
      channelId: 10,
      logTime: anchorTimeNs,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield* [];
    });
    const readLatestIndexedMessageTimes = vi.fn(
      async () => new Map([["/robot_transforms", [anchor]]]),
    );
    const readIndexedMessages = vi.fn(async () => [message]);
    const readMessages = vi.fn(async function* () {
      yield* [];
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: transformChannelsById(),
          readIndexedMessages,
          readIndexedMessageTimes,
          readLatestIndexedMessageTimes,
          readMessages,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: 11_000_000_000n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 10_000_000_000n,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      limitPerTopic: 32,
      timeNs: 10_000_000_000n,
      topics: ["/robot_transforms"],
    });
    expect(readIndexedMessages).toHaveBeenCalledExactlyOnceWith({
      entries: [anchor],
      signal: undefined,
    });
    expect(readMessages).not.toHaveBeenCalled();
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]?.timeNs).toBe(anchorTimeNs);
  });

  it("expands exact placement tails until every known dynamic child is anchored", async () => {
    const timeNs = 10_000_000_000n;
    const slowPayload = replaceAscii(FRAME_TRANSFORM_MESSAGE, "lidar", "slow1");
    const fastEntry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      9_000_000_000n,
      200n,
    );
    const slowEntry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      8_000_000_000n,
      100n,
    );
    const messagesByOffset = new Map([
      [
        fastEntry.messageOffset,
        createMessage(FRAME_TRANSFORM_MESSAGE, {
          channelId: 10,
          logTime: fastEntry.logTimeNs,
        }),
      ],
      [
        slowEntry.messageOffset,
        createMessage(slowPayload, {
          channelId: 10,
          logTime: slowEntry.logTimeNs,
        }),
      ],
    ]);
    const readLatestIndexedMessageTimes = vi.fn(
      async ({ limitPerTopic }: { readonly limitPerTopic?: number }) =>
        new Map([
          [
            "/robot_transforms",
            limitPerTopic === 32 ? [fastEntry] : [slowEntry, fastEntry],
          ],
        ]),
    );
    const readIndexedMessages = vi.fn(
      async ({
        entries,
      }: Parameters<
        NonNullable<McapIndexedReaderLike["readIndexedMessages"]>
      >[0]) =>
        entries.map((entry) => {
          const message = messagesByOffset.get(entry.messageOffset);
          if (!message) {
            throw new Error(`Missing test message at ${entry.messageOffset}`);
          }
          return message;
        }),
    );
    const readMessages = vi.fn(async function* () {
      yield* [];
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: transformChannelsById(),
          readIndexedMessages,
          readLatestIndexedMessageTimes,
          readMessages,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: timeNs,
      requiredDynamicChildFrameIds: ["lidar", "slow1"],
      source: createMcapSourceDescriptor(),
      startTimeNs: timeNs,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenNthCalledWith(1, {
      limitPerTopic: 32,
      timeNs,
      topics: ["/robot_transforms"],
    });
    expect(readLatestIndexedMessageTimes).toHaveBeenNthCalledWith(2, {
      limitPerTopic: 128,
      timeNs,
      topics: ["/robot_transforms"],
    });
    expect(readIndexedMessages).toHaveBeenCalledTimes(2);
    expect(readIndexedMessages.mock.calls[0]?.[0].entries).toEqual([fastEntry]);
    expect(readIndexedMessages.mock.calls[1]?.[0].entries).toEqual([slowEntry]);
    expect(readMessages).not.toHaveBeenCalled();
    expect(set.placementCoverage).toEqual({
      complete: true,
      startTimeNs: slowEntry.logTimeNs,
    });
    expect(set.samples.map((sample) => sample.childFrameId).sort()).toEqual([
      "lidar",
      "slow1",
    ]);
  });

  it("settles missing children when every topic predecessor is exhausted", async () => {
    const timeNs = 10_000_000_000n;
    const entry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      9_000_000_000n,
      200n,
    );
    const readLatestIndexedMessageTimes = vi.fn(
      async () => new Map([["/robot_transforms", [entry]]]),
    );
    const readIndexedMessages = vi.fn(async () => [
      createMessage(FRAME_TRANSFORM_MESSAGE, {
        channelId: 10,
        logTime: entry.logTimeNs,
      }),
    ]);
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: transformChannelsById(),
          readIndexedMessages,
          readLatestIndexedMessageTimes,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: timeNs,
      requiredDynamicChildFrameIds: ["lidar", "missing"],
      source: createMcapSourceDescriptor(),
      startTimeNs: timeNs,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenCalledTimes(2);
    expect(readIndexedMessages).toHaveBeenCalledOnce();
    expect(set.placementCoverage).toEqual({
      complete: true,
      startTimeNs: entry.logTimeNs,
    });
    expect(set.samples).toHaveLength(1);
  });

  it("bounds scoped placement coverage by every transform topic's probe floor", async () => {
    const timeNs = 10_000_000_000n;
    const sparseEntry = createIndexedMessageTime(
      "/sparse_transforms",
      10,
      5_000_000_000n,
      100n,
    );
    const busyEntry = createIndexedMessageTime(
      "/busy_transforms",
      11,
      9_900_000_000n,
      200n,
    );
    const messagesByOffset = new Map([
      [
        sparseEntry.messageOffset,
        createMessage(FRAME_TRANSFORM_MESSAGE, {
          channelId: 10,
          logTime: sparseEntry.logTimeNs,
        }),
      ],
      [
        busyEntry.messageOffset,
        createMessage(replaceAscii(FRAME_TRANSFORM_MESSAGE, "lidar", "other"), {
          channelId: 11,
          logTime: busyEntry.logTimeNs,
        }),
      ],
    ]);
    const readLatestIndexedMessageTimes = vi.fn(
      async () =>
        new Map([
          ["/sparse_transforms", [sparseEntry]],
          ["/busy_transforms", [busyEntry]],
        ]),
    );
    const readIndexedMessages = vi.fn(
      async ({
        entries,
      }: {
        readonly entries: readonly McapIndexedMessageTime[];
      }) =>
        entries.map(
          (entry) =>
            messagesByOffset.get(
              entry.messageOffset,
            ) as McapTypes.TypedMcapRecords["Message"],
        ),
    );
    const channelsById = new Map([
      [
        10,
        createChannel({
          id: 10,
          schemaId: 10,
          topic: "/sparse_transforms",
        }),
      ],
      [
        11,
        createChannel({
          id: 11,
          schemaId: 10,
          topic: "/busy_transforms",
        }),
      ],
    ]);
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById,
          readIndexedMessages,
          readLatestIndexedMessageTimes,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const set = await client.readFrameTransformWindow({
      endTimeNs: timeNs,
      requiredDynamicChildFrameIds: ["lidar"],
      source: createMcapSourceDescriptor(),
      startTimeNs: timeNs,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenCalledOnce();
    expect(set.placementCoverage).toEqual({
      complete: true,
      startTimeNs: busyEntry.logTimeNs,
    });
  });

  it("keeps cancellation canonical after the worker advances its signal slot", async () => {
    const timeNs = 7_000_000_020n;
    const entry = createIndexedMessageTime(
      "/robot_transforms",
      10,
      timeNs,
      200n,
    );
    const controller = new AbortController();
    const readSignal = { current: controller.signal as AbortSignal | null };
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield entry;
    });
    const readIndexedMessages = vi.fn(async () => {
      controller.abort();
      readSignal.current = new AbortController().signal;
      const error = new Error("MCAP indexed message read aborted");
      error.name = "AbortError";
      throw error;
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readSignal,
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: transformChannelsById(),
          readIndexedMessages,
          readIndexedMessageTimes,
          schemasById: transformSchemasById(),
        }),
      ),
    });

    const read = client.readFrameTransformWindow({
      endTimeNs: timeNs,
      source: createMcapSourceDescriptor(),
      startTimeNs: timeNs,
    });

    await expect(read).rejects.toSatisfy(isEpisodeReadCancelledError);
    expect(readSignal.current?.aborted).toBe(false);
    expect(readIndexedMessages).toHaveBeenCalledExactlyOnceWith({
      entries: [entry],
      signal: controller.signal,
    });
  });

  it("reuses fully bootstrapped static channels across transform windows", async () => {
    const staticMessage = createMessage(
      FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
      {
        channelId: 11,
        logTime: 1n,
      },
    );
    const dynamicMessage = createMessage(FRAME_TRANSFORM_MESSAGE, {
      channelId: 10,
      logTime: 7_000_000_020n,
    });
    const readMessages = vi.fn(async function* ({
      topics,
    }: {
      readonly topics?: readonly string[];
    } = {}) {
      if (topics?.includes("/tf_static")) {
        yield staticMessage;
      }
      if (topics?.includes("/tf")) {
        yield dynamicMessage;
      }
    });
    const reader = createReader({
      channelsById: new Map([
        [
          10,
          createChannel({
            id: 10,
            schemaId: 10,
            topic: "/tf",
          }),
        ],
        [
          11,
          createChannel({
            id: 11,
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
      statistics: createStatistics({
        channelMessageCounts: new Map([
          [10, 10_000n],
          [11, 1n],
        ]),
      }),
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => reader),
    });
    const source = createMcapSourceDescriptor();

    const bootstrap = await client.readFrameTransformBootstrap({ source });
    const window = await client.readFrameTransformWindow({
      endTimeNs: dynamicMessage.logTime,
      source,
      startTimeNs: dynamicMessage.logTime,
    });

    expect(bootstrap.samples).toHaveLength(1);
    expect(window.samples).toHaveLength(1);
    expect(readMessages).toHaveBeenNthCalledWith(1, {
      topics: ["/tf_static"],
    });
    expect(readMessages).toHaveBeenNthCalledWith(2, {
      endTime: dynamicMessage.logTime,
      startTime: dynamicMessage.logTime,
      topics: ["/tf"],
    });
  });

  it("keeps deferred static channels in transform windows", async () => {
    const staticMessage = createMessage(
      FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP,
      {
        channelId: 11,
        logTime: 7_000_000_020n,
      },
    );
    const readMessages = vi.fn(async function* () {
      yield staticMessage;
    });
    const reader = createReader({
      channelsById: new Map([
        [
          11,
          createChannel({
            id: 11,
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
      statistics: createStatistics({
        channelMessageCounts: new Map([[11, 10_000n]]),
      }),
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () => reader),
    });
    const source = createMcapSourceDescriptor();

    const bootstrap = await client.readFrameTransformBootstrap({ source });
    const window = await client.readFrameTransformWindow({
      endTimeNs: staticMessage.logTime,
      source,
      startTimeNs: staticMessage.logTime,
    });

    expect(bootstrap.samples).toEqual([]);
    expect(window.samples).toHaveLength(1);
    expect(readMessages).toHaveBeenCalledExactlyOnceWith({
      endTime: staticMessage.logTime,
      startTime: staticMessage.logTime,
      topics: ["/tf_static"],
    });
  });

  it("anchors indexed transform windows with cached predecessor messages", async () => {
    const anchorTimeNs = 7_000_000_020n;
    const earlierAnchorTimeNs = 6_000_000_020n;
    const earlierFrameTransformMessage = FRAME_TRANSFORM_MESSAGE.slice();
    // Foxglove Timestamp.seconds is the one-byte varint at this offset in the
    // pinned fixture; retain the same edge while giving it an older pose.
    earlierFrameTransformMessage[3] = 6;
    const readLatestIndexedMessageTimes = vi.fn(
      async () =>
        new Map([
          [
            "/robot_transforms",
            [
              createIndexedMessageTime(
                "/robot_transforms",
                10,
                anchorTimeNs,
                20n,
              ),
              createIndexedMessageTime(
                "/robot_transforms",
                10,
                earlierAnchorTimeNs,
                10n,
              ),
            ],
          ],
        ]),
    );
    const readMessages = vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
      readonly topics?: readonly string[];
    }) {
      if (
        args?.startTime !== undefined &&
        args.endTime !== undefined &&
        args.startTime <= earlierAnchorTimeNs &&
        earlierAnchorTimeNs <= args.endTime
      ) {
        yield createMessage(earlierFrameTransformMessage, {
          channelId: 10,
          logTime: earlierAnchorTimeNs,
        });
      }
      if (
        args?.startTime !== undefined &&
        args.endTime !== undefined &&
        args.startTime <= anchorTimeNs &&
        anchorTimeNs <= args.endTime
      ) {
        yield createMessage(FRAME_TRANSFORM_MESSAGE, {
          channelId: 10,
          logTime: anchorTimeNs,
        });
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
                topic: "/robot_transforms",
              }),
            ],
          ]),
          readLatestIndexedMessageTimes,
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
    const source = createMcapSourceDescriptor();

    const first = await client.readFrameTransformWindow({
      endTimeNs: 11_000_000_000n,
      source,
      startTimeNs: 10_000_000_000n,
    });
    const second = await client.readFrameTransformWindow({
      endTimeNs: 11_000_000_000n,
      source,
      startTimeNs: 10_500_000_000n,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenCalledExactlyOnceWith({
      limitPerTopic: 32,
      timeNs: 10_000_000_000n,
      topics: ["/robot_transforms"],
    });
    expect(first.samples).toHaveLength(1);
    expect(second.samples).toHaveLength(1);
    expect(readMessages).toHaveBeenCalledWith({
      endTime: anchorTimeNs,
      startTime: earlierAnchorTimeNs,
      topics: ["/robot_transforms"],
    });
    expect(first.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
      timeNs: anchorTimeNs,
    });
  });

  it("keeps the bounded predecessor fallback for readers without indexes", async () => {
    const readMessages = vi.fn(async function* () {
      // The message lands inside the bounded log-time read, while its recorded
      // transform timestamp precedes the window and becomes the held anchor.
      yield createMessage(FRAME_TRANSFORM_MESSAGE, {
        channelId: 10,
        logTime: 10_500_000_000n,
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
      endTimeNs: 11_000_000_000n,
      source: createMcapSourceDescriptor(),
      startTimeNs: 10_000_000_000n,
    });

    expect(readMessages).toHaveBeenCalledTimes(1);
    expect(set.samples).toHaveLength(1);
    expect(set.samples[0]).toMatchObject({
      childFrameId: "lidar",
      parentFrameId: "map",
      timeNs: 7_000_000_020n,
    });
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

  it("defers bootstrap scans of static channels with message counts above the cap", async () => {
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

  it("contains payload decode failures to their topic and preserves shared decode work", async () => {
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
    ];
    const decodeClient = createTestDecodeClient();
    vi.mocked(decodeClient.decode).mockImplementation(async (request) => {
      if (request.context.streamId === "/camera") {
        throw new Error("invalid camera calibration");
      }
      return {
        context: request.context,
        decoderId: "test-decoder",
        decoderVersion: "1",
        output: createTestDecodedOutput(),
        payload: request.payload,
      };
    });
    const readMessages = vi.fn(async function* () {
      for (const message of messages) yield message;
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
    for (const window of windows) {
      expect(window.messagesByTopic["/camera"]).toEqual([]);
      expect(window.decodeErrorsByTopic?.["/camera"]).toEqual([
        expect.objectContaining({
          code: "message-decode-failed",
          message: "invalid camera calibration",
          messageTimeNs: 90n,
          requestedTimeNs: window.timeNs,
          topic: "/camera",
        }),
      ]);
      expect(window.messagesByTopic["/lidar"]).toHaveLength(1);
      expect(window.messages.map((message) => message.topic)).toEqual([
        "/lidar",
      ]);
    }
    expect(readMessages).toHaveBeenCalledTimes(1);
    // The selected union is still decoded once per unique message, including
    // the cached rejected promise reused by the second window.
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

  it("shares synchronized worker decodes without inspecting payload bytes", async () => {
    const source = createMcapSourceDescriptor();
    const data = new Uint8Array([1, 2, 3]);
    const iteratePayload = vi.spyOn(data, Symbol.iterator);
    const message = createMessage(data, {
      logTime: 100n,
      publishTime: 101n,
    });
    const decodeClient = {
      ...createTestDecodeClient(),
      cachesDecodedOutput: false,
    };
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          messages: [message],
        }),
      ),
    });

    const windows = await client.readSynchronizedMessageBatch({
      timeNs: [100n, 101n],
      source,
      topics: ["/topic"],
    });

    expect(windows).toHaveLength(2);
    expect(
      windows.map((window) => window.messagesByTopic["/topic"]?.length),
    ).toEqual([1, 1]);
    expect(decodeClient.decode).toHaveBeenCalledTimes(1);
    expect(iteratePayload).not.toHaveBeenCalled();
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
    const messagesByTime = new Map([
      [90n, camera],
      [108n, lidar],
      [130n, lateCamera],
    ]);
    const readIndexedMessages = vi.fn(
      async ({
        entries,
      }: Parameters<
        NonNullable<McapIndexedReaderLike["readIndexedMessages"]>
      >[0]) => {
        return entries.map((entry) => {
          const message = messagesByTime.get(entry.logTimeNs);
          if (!message) {
            throw new Error(`Missing test message at ${entry.logTimeNs}`);
          }
          return message;
        });
      },
    );
    const readMessages = vi.fn(async function* () {
      for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
        yield message;
      }
    });
    const controller = new AbortController();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readSignal: { current: controller.signal },
      readerFactory: vi.fn(async () =>
        createReader({
          channelsById: new Map([
            [7, createChannel({ id: 7, topic: "/camera" })],
            [8, createChannel({ id: 8, topic: "/lidar" })],
          ]),
          readIndexedMessages,
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
    expect(readIndexedMessages).toHaveBeenCalledExactlyOnceWith({
      entries: [
        createIndexedMessageTime("/camera", 7, 90n, 900n),
        createIndexedMessageTime("/lidar", 8, 108n, 1080n),
      ],
      signal: controller.signal,
    });
    expect(readMessages).not.toHaveBeenCalled();
    expect(decodeClient.decode).toHaveBeenCalledTimes(2);
  });

  it("keeps the indexed synchronized-read fallback for readers without exact lookup", async () => {
    const message = createMessage(new Uint8Array([1]), {
      channelId: 7,
      logTime: 90n,
      publishTime: 91n,
    });
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield createIndexedMessageTime("/topic", 7, 90n, 900n);
    });
    const readMessages = vi.fn(async function* () {
      yield message;
    });
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient: createTestDecodeClient(),
      readerFactory: vi.fn(async () =>
        createReader({
          readIndexedMessageTimes,
          readMessages,
        }),
      ),
    });

    const [window] = await client.readSynchronizedMessageBatch({
      defaultStreamPolicy: {
        mode: PlaybackSyncMode.NEAREST,
        toleranceAfterNs: 20n,
        toleranceBeforeNs: 20n,
      },
      source: createMcapSourceDescriptor(),
      timeNs: [100n],
      topics: ["/topic"],
    });

    expect(window.messagesByTopic["/topic"]).toHaveLength(1);
    expect(readMessages).toHaveBeenCalledWith({
      endTime: 90n,
      startTime: 90n,
      topics: ["/topic"],
    });
  });

  it("reuses an indexed decoded record before chunk materialization", async () => {
    const indexed = createIndexedMessageTime("/topic", 7, 90n, 900n);
    const readIndexedMessageTimes = vi.fn(async function* () {
      yield indexed;
    });
    const readIndexedMessages = vi.fn(async () => {
      throw new Error("retained records must not materialize their chunk");
    });
    const prefetchChunkData = vi.fn(async () => undefined);
    const decodeClient = createTestDecodeClient();
    const client = createInlineMcapResourceClient({
      byteClient: { readBytes: vi.fn() },
      decodeClient,
      readerFactory: vi.fn(async () =>
        createReader({
          prefetchChunkData,
          readIndexedMessages,
          readIndexedMessageTimes,
        }),
      ),
    });
    const reuse = vi.fn(
      (identity: {
        readonly recordId: string;
        readonly timelineTimeNs: bigint;
        readonly topic: string;
      }) => ({ kind: "retained" as const, ...identity }),
    );

    const [window] = await client.readSynchronizedMessageBatchWithReuse(
      {
        defaultStreamPolicy: {
          mode: PlaybackSyncMode.NEAREST,
          toleranceAfterNs: 20n,
          toleranceBeforeNs: 20n,
        },
        pointCloudColorByByTopic: { "/topic": "intensity" },
        source: createMcapSourceDescriptor(),
        timeNs: [100n],
        topics: ["/topic"],
      },
      reuse,
    );

    expect(window.messages[0]).toMatchObject({
      kind: "retained",
      recordId:
        "/topic\u00007\u000090\u00001000\u0000900\u0000activeTimeline=log\u0000intensity",
      timelineTimeNs: 90n,
      topic: "/topic",
    });
    expect(reuse).toHaveBeenCalledTimes(1);
    expect(prefetchChunkData).not.toHaveBeenCalled();
    expect(readIndexedMessages).not.toHaveBeenCalled();
    expect(decodeClient.decode).not.toHaveBeenCalled();
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
      byteTimeline: [
        {
          cumulativeCompressedBytes: 256,
          endTimeNs: 250n,
          startOffsetBytes: 1_000n,
        },
        {
          cumulativeCompressedBytes: 512,
          endTimeNs: 450n,
          startOffsetBytes: 1_000n,
        },
      ],
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
      byteTimeline: [
        {
          cumulativeCompressedBytes: 256,
          endTimeNs: 20n,
          startOffsetBytes: 1_000n,
        },
      ],
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

function ros1TfMessage(record: Record<string, unknown>): Uint8Array {
  const writer = new Ros1MessageWriter(
    parseRosMessageDefinition(ROS1_TF_MESSAGE_SCHEMA),
  );
  return writer.writeMessage(record);
}

function ros2TfMessage(record: Record<string, unknown>): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(ROS2_TF_MESSAGE_SCHEMA, { ros2: true }),
  );
  return writer.writeMessage(record);
}

function foxgloveRos2FrameTransforms(
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(FOXGLOVE_ROS2_FRAME_TRANSFORMS_SCHEMA, {
      ros2: true,
    }),
  );
  return writer.writeMessage(record);
}

function foxgloveRos2FrameTransform(
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(FOXGLOVE_ROS2_FRAME_TRANSFORM_SCHEMA, {
      ros2: true,
    }),
  );
  return writer.writeMessage(record);
}

function ros2IdlTfMessage(record: Record<string, unknown>): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRos2idl(ROS2_IDL_TF_MESSAGE_SCHEMA),
  );
  return writer.writeMessage(record);
}

interface RosTransformStampedOptions {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly translation: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

function ros2IdlTransformStamped({
  childFrameId,
  parentFrameId,
  stamp,
  translation,
}: RosTransformStampedOptions & {
  readonly stamp: { readonly nsec: number; readonly sec: number };
}): Record<string, unknown> {
  return {
    child_frame_id: childFrameId,
    header: { frame_id: parentFrameId, stamp },
    transform: {
      rotation: { w: 1, x: 0, y: 0, z: 0 },
      translation,
    },
  };
}

function ros1TransformStamped({
  childFrameId,
  parentFrameId,
  stamp,
  translation,
}: RosTransformStampedOptions & {
  readonly stamp: { readonly nsec: number; readonly sec: number };
}): Record<string, unknown> {
  return {
    child_frame_id: childFrameId,
    header: { frame_id: parentFrameId, seq: 0, stamp },
    transform: {
      rotation: { w: 1, x: 0, y: 0, z: 0 },
      translation,
    },
  };
}

function ros2TransformStamped({
  childFrameId,
  parentFrameId,
  stamp,
  translation,
}: RosTransformStampedOptions & {
  readonly stamp: { readonly nanosec: number; readonly sec: number };
}): Record<string, unknown> {
  return {
    child_frame_id: childFrameId,
    header: { frame_id: parentFrameId, stamp },
    transform: {
      rotation: { w: 1, x: 0, y: 0, z: 0 },
      translation,
    },
  };
}

function createReader({
  channelsById = new Map([[7, createChannel({ id: 7, topic: "/topic" })]]),
  chunkIndexes = [],
  messages = [],
  prefetchChunkData,
  prefetchWindow,
  readIndexedMessages,
  readIndexedMessageTimes,
  readLatestIndexedMessageTimes,
  readBoundedMessages,
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
  readonly prefetchChunkData?: NonNullable<
    McapIndexedReaderLike["prefetchChunkData"]
  >;
  readonly prefetchWindow?: NonNullable<
    McapIndexedReaderLike["prefetchWindow"]
  >;
  readonly readIndexedMessages?: NonNullable<
    McapIndexedReaderLike["readIndexedMessages"]
  >;
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
  readonly readBoundedMessages?: NonNullable<
    McapIndexedReaderLike["readBoundedMessages"]
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
    prefetchChunkData,
    prefetchWindow,
    readIndexedMessages,
    readIndexedMessageTimes,
    readLatestIndexedMessageTimes,
    readBoundedMessages,
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

function transformChannelsById() {
  return new Map([
    [
      10,
      createChannel({
        id: 10,
        schemaId: 10,
        topic: "/robot_transforms",
      }),
    ],
  ]);
}

function transformSchemasById() {
  return new Map([
    [
      10,
      createSchema(FRAME_TRANSFORM_SCHEMA_DATA, {
        id: 10,
        name: "foxglove.FrameTransform",
      }),
    ],
  ]);
}

function replaceAscii(
  source: Uint8Array,
  from: string,
  to: string,
): Uint8Array {
  const fromBytes = new TextEncoder().encode(from);
  const toBytes = new TextEncoder().encode(to);
  if (fromBytes.length !== toBytes.length) {
    throw new Error("Test protobuf replacement must preserve byte length");
  }
  const result = source.slice();
  let start = -1;
  for (let index = 0; index <= result.length - fromBytes.length; index += 1) {
    if (
      fromBytes.every((expected, offset) => result[index + offset] === expected)
    ) {
      start = index;
      break;
    }
  }
  if (start < 0) {
    throw new Error(`Missing '${from}' in test protobuf payload`);
  }
  result.set(toBytes, start);
  return result;
}

function createBoundedReadResult(
  messages: readonly McapTypes.TypedMcapRecords["Message"][],
  overrides: Partial<McapBoundedMessageReadResult> = {},
): McapBoundedMessageReadResult {
  return {
    coverageByTopic: new Map(),
    messages,
    stopReason: "source-exhausted",
    usage: {
      chunksOpened: 1,
      decompressedBytes: 0,
      decompressionCacheHits: 0,
      elapsedMs: 1,
      logicalSourceBytes: 256,
      logicalUncompressedBytes: 256,
      messagesDecoded: messages.length,
      transferredBytes: 256,
    },
    ...overrides,
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
