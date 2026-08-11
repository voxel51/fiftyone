import { parse as parseRosMessageDefinition } from "@foxglove/rosmsg";
import { parseRos2idl } from "@foxglove/ros2idl-parser";
import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes/index";
import type { DecodeClient } from "../../../query/decoding/index";
import { VISUALIZATION_KIND, type DecodedOutput } from "../../../ir/index";
import type {
  McapBoundedMessageReadResult,
  McapChannel,
  McapChunkIndex,
  McapIndexedReaderLike,
  McapMessage,
  McapReaderFactory,
  McapSchema,
  McapStatistics,
} from "../reader/index";

export const FRAME_TRANSFORM_SCHEMA_DATA = bytes(
  "CmcKH2dvb2dsZS9wcm90b2J1Zi90aW1lc3RhbXAucHJvdG8SD2dvb2dsZS5wcm90b2J1ZiIrCglUaW1lc3RhbXASDwoHc2Vjb25kcxgBIAEoAxINCgVuYW5vcxgCIAEoBWIGcHJvdG8zClYKFmZveGdsb3ZlL1ZlY3RvcjMucHJvdG8SCGZveGdsb3ZlIioKB1ZlY3RvcjMSCQoBeBgBIAEoARIJCgF5GAIgASgBEgkKAXoYAyABKAFiBnByb3RvMwpnChlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvEghmb3hnbG92ZSI4CgpRdWF0ZXJuaW9uEgkKAXgYASABKAESCQoBeRgCIAEoARIJCgF6GAMgASgBEgkKAXcYBCABKAFiBnByb3RvMwrIAgodZm94Z2xvdmUvRnJhbWVUcmFuc2Zvcm0ucHJvdG8SCGZveGdsb3ZlGh9nb29nbGUvcHJvdG9idWYuVGltZXN0YW1wLnByb3RvGhZmb3hnbG92ZS9WZWN0b3IzLnByb3RvGhlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvIsABCg5GcmFtZVRyYW5zZm9ybRItCgl0aW1lc3RhbXAYASABKAsyGi5nb29nbGUucHJvdG9idWYuVGltZXN0YW1wEhcKD3BhcmVudF9mcmFtZV9pZBgCIAEoCRIWCg5jaGlsZF9mcmFtZV9pZBgDIAEoCRImCgt0cmFuc2xhdGlvbhgEIAEoCzIRLmZveGdsb3ZlLlZlY3RvcjMSJgoIcm90YXRpb24YBSABKAsyFC5mb3hnbG92ZS5RdWF0ZXJuaW9uYgZwcm90bzM=",
);
export const FRAME_TRANSFORMS_SCHEMA_DATA = bytes(
  "CmcKH2dvb2dsZS9wcm90b2J1Zi90aW1lc3RhbXAucHJvdG8SD2dvb2dsZS5wcm90b2J1ZiIrCglUaW1lc3RhbXASDwoHc2Vjb25kcxgBIAEoAxINCgVuYW5vcxgCIAEoBWIGcHJvdG8zClYKFmZveGdsb3ZlL1ZlY3RvcjMucHJvdG8SCGZveGdsb3ZlIioKB1ZlY3RvcjMSCQoBeBgBIAEoARIJCgF5GAIgASgBEgkKAXoYAyABKAFiBnByb3RvMwpnChlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvEghmb3hnbG92ZSI4CgpRdWF0ZXJuaW9uEgkKAXgYASABKAESCQoBeRgCIAEoARIJCgF6GAMgASgBEgkKAXcYBCABKAFiBnByb3RvMwrIAgodZm94Z2xvdmUvRnJhbWVUcmFuc2Zvcm0ucHJvdG8SCGZveGdsb3ZlGh9nb29nbGUvcHJvdG9idWYuVGltZXN0YW1wLnByb3RvGhZmb3hnbG92ZS9WZWN0b3IzLnByb3RvGhlmb3hnbG92ZS9RdWF0ZXJuaW9uLnByb3RvIsABCg5GcmFtZVRyYW5zZm9ybRItCgl0aW1lc3RhbXAYASABKAsyGi5nb29nbGUucHJvdG9idWYuVGltZXN0YW1wEhcKD3BhcmVudF9mcmFtZV9pZBgCIAEoCRIWCg5jaGlsZF9mcmFtZV9pZBgDIAEoCRImCgt0cmFuc2xhdGlvbhgEIAEoCzIRLmZveGdsb3ZlLlZlY3RvcjMSJgoIcm90YXRpb24YBSABKAsyFC5mb3hnbG92ZS5RdWF0ZXJuaW9uYgZwcm90bzMKkgEKHmZveGdsb3ZlL0ZyYW1lVHJhbnNmb3Jtcy5wcm90bxIIZm94Z2xvdmUaHWZveGdsb3ZlL0ZyYW1lVHJhbnNmb3JtLnByb3RvIj8KD0ZyYW1lVHJhbnNmb3JtcxIsCgp0cmFuc2Zvcm1zGAEgAygLMhguZm94Z2xvdmUuRnJhbWVUcmFuc2Zvcm1iBnByb3RvMw==",
);
export const FRAME_TRANSFORM_MESSAGE = bytes(
  "CgQIBxAUEgNtYXAaBWxpZGFyIhsJAAAAAAAA8D8RAAAAAAAAAEAZAAAAAAAACEAqJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPw==",
);
export const FRAME_TRANSFORM_MESSAGE_WITHOUT_TIMESTAMP = bytes(
  "EgNtYXAaBWxpZGFyIhsJAAAAAAAA8D8RAAAAAAAAAEAZAAAAAAAACEAqJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPw==",
);
export const FRAME_TRANSFORMS_MESSAGE_WITHOUT_TIMESTAMP = bytes(
  "ClMSA21hcBoJYmFzZV9saW5rIhsJAAAAAAAA8D8RAAAAAAAAAAAZAAAAAAAAAAAqJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPwpVEgliYXNlX2xpbmsaBWxpZGFyIhsJAAAAAAAAAAARAAAAAAAAAEAZAAAAAAAAAAAqJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPw==",
);
export const CUSTOM_TRANSFORM_BUNDLE_SCHEMA_DATA = bytes(
  "CrECCgxjdXN0b20ucHJvdG8SBmN1c3RvbSInCgRWZWMzEgkKAXgYASABKAESCQoBeRgCIAEoARIJCgF6GAMgASgBIjIKBFF1YXQSCQoBeBgBIAEoARIJCgF5GAIgASgBEgkKAXoYAyABKAESCQoBdxgEIAEoASJ6ChRDYWxpYnJhdGlvblRyYW5zZm9ybRIXCg9wYXJlbnRfZnJhbWVfaWQYASABKAkSFgoOY2hpbGRfZnJhbWVfaWQYAiABKAkSGQoLdHJhbnNsYXRpb24YAyABKAsyBFZlYzMSFgoIcm90YXRpb24YBCABKAsyBFF1YXQiOAoRQ2FsaWJyYXRpb25CdW5kbGUSIwoFcG9zZXMYASADKAsyFENhbGlicmF0aW9uVHJhbnNmb3JtYgZwcm90bzM=",
);
export const CUSTOM_TRANSFORM_BUNDLE_MESSAGE = bytes(
  "ClYKA21hcBIMY3VzdG9tX2xpZGFyGhsJAAAAAAAAEEARAAAAAAAAFEAZAAAAAAAAGEAiJAkAAAAAAAAAABEAAAAAAAAAABkAAAAAAAAAACEAAAAAAADwPw==",
);
export const ROS1_TF_MESSAGE_SCHEMA = `geometry_msgs/TransformStamped[] transforms
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
export const ROS2_TF_MESSAGE_SCHEMA = `geometry_msgs/TransformStamped[] transforms
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
export const FOXGLOVE_ROS2_FRAME_TRANSFORM_SCHEMA = `builtin_interfaces/Time timestamp
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
export const FOXGLOVE_ROS2_FRAME_TRANSFORMS_SCHEMA = `foxglove_msgs/FrameTransform[] transforms
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
export const ROS2_IDL_TF_MESSAGE_SCHEMA = `module tf2_msgs {
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

export async function collect<T>(
  generator: AsyncGenerator<T, void, void>,
): Promise<readonly T[]> {
  const messages: T[] = [];
  for await (const message of generator) {
    messages.push(message);
  }

  return messages;
}

export function createMcapSourceDescriptor(): ByteSourceDescriptor {
  return {
    sizeBytes: "128",
    sourceId: "source:1",
    url: "mcap-source://sample",
  };
}

export function ros1TfMessage(record: Record<string, unknown>): Uint8Array {
  const writer = new Ros1MessageWriter(
    parseRosMessageDefinition(ROS1_TF_MESSAGE_SCHEMA),
  );
  return writer.writeMessage(record);
}

export function ros2TfMessage(record: Record<string, unknown>): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(ROS2_TF_MESSAGE_SCHEMA, { ros2: true }),
  );
  return writer.writeMessage(record);
}

export function foxgloveRos2FrameTransforms(
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(FOXGLOVE_ROS2_FRAME_TRANSFORMS_SCHEMA, {
      ros2: true,
    }),
  );
  return writer.writeMessage(record);
}

export function foxgloveRos2FrameTransform(
  record: Record<string, unknown>,
): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(FOXGLOVE_ROS2_FRAME_TRANSFORM_SCHEMA, {
      ros2: true,
    }),
  );
  return writer.writeMessage(record);
}

export function ros2IdlTfMessage(record: Record<string, unknown>): Uint8Array {
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

export function ros2IdlTransformStamped({
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

export function ros1TransformStamped({
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

export function ros2TransformStamped({
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

export function createReader({
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
  readonly channelsById?: ReadonlyMap<number, McapChannel>;
  readonly chunkIndexes?: readonly McapChunkIndex[];
  readonly messages?: readonly McapMessage[];
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
  }) => AsyncGenerator<McapMessage, void, void>;
  readonly schemasById?: ReadonlyMap<number, McapSchema>;
  readonly statistics?: McapStatistics;
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
    readMessages: readMessages ?? vi.fn(() => asyncValues(messages)),
    schemasById,
    statistics,
  };
}

export function transformChannelsById() {
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

export function transformSchemasById() {
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

export function replaceAscii(
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

export function createBoundedReadResult(
  messages: readonly McapMessage[],
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

export function createIndexedMessageTime(
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

export function createTestDecodeClient() {
  return {
    decode: vi.fn<DecodeClient["decode"]>((request) =>
      Promise.resolve({
        context: request.context,
        decoderId: "test-decoder",
        decoderVersion: "1",
        output: createTestDecodedOutput(),
        payload: request.payload,
      }),
    ),
  } satisfies DecodeClient;
}

export function mockReaderFactory(
  implementation: (
    ...args: Parameters<McapReaderFactory>
  ) => McapIndexedReaderLike | Promise<McapIndexedReaderLike>,
) {
  return vi.fn<McapReaderFactory>((...args) =>
    Promise.resolve().then(() => implementation(...args)),
  );
}

export function createTestDecodedOutput(
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

export function createChannel(options: Partial<McapChannel> = {}): McapChannel {
  return {
    id: options.id ?? 7,
    messageEncoding: options.messageEncoding ?? "protobuf",
    metadata: options.metadata ?? new Map<string, string>(),
    schemaId: options.schemaId ?? 3,
    topic: options.topic ?? "/topic",
    type: "Channel",
  };
}

export function createSchema(
  data: Uint8Array,
  options: Partial<McapSchema> = {},
): McapSchema {
  return {
    data,
    encoding: options.encoding ?? "protobuf",
    id: options.id ?? 3,
    name: options.name ?? "foxglove.CompressedImage",
    type: "Schema",
  };
}

export function createStatistics(
  options: Partial<McapStatistics> = {},
): McapStatistics {
  return {
    attachmentCount: options.attachmentCount ?? 0,
    channelCount: options.channelCount ?? 0,
    channelMessageCounts:
      options.channelMessageCounts ?? new Map<number, bigint>(),
    chunkCount: options.chunkCount ?? 0,
    messageCount: options.messageCount ?? 0n,
    messageEndTime: options.messageEndTime ?? 0n,
    messageStartTime: options.messageStartTime ?? 0n,
    metadataCount: options.metadataCount ?? 0,
    schemaCount: options.schemaCount ?? 0,
    type: "Statistics",
  };
}

export function createChunkIndex(
  options: Partial<McapChunkIndex> = {},
): McapChunkIndex {
  return {
    chunkLength: options.chunkLength ?? 256n,
    chunkStartOffset: options.chunkStartOffset ?? 1_000n,
    compressedSize: options.compressedSize ?? 0n,
    compression: options.compression ?? "",
    messageEndTime: options.messageEndTime ?? 20n,
    messageIndexLength: options.messageIndexLength ?? 0n,
    messageIndexOffsets:
      options.messageIndexOffsets ?? new Map<number, bigint>(),
    messageStartTime: options.messageStartTime ?? 10n,
    type: "ChunkIndex",
    uncompressedSize: options.uncompressedSize ?? 0n,
  };
}

export function createMessage(
  data: Uint8Array,
  options: Partial<McapMessage> = {},
): McapMessage {
  return {
    channelId: options.channelId ?? 7,
    data,
    logTime: options.logTime ?? 100n,
    publishTime: options.publishTime ?? 101n,
    sequence: options.sequence ?? 2,
    type: "Message",
  };
}

export async function* asyncValues<Value>(
  values: Iterable<Value>,
): AsyncGenerator<Value, void, void> {
  for await (const value of values) yield value;
}

export function promiseMock<Args extends unknown[], Result>(
  implementation: (...args: Args) => Result,
) {
  return vi.fn((...args: Args) =>
    Promise.resolve().then(() => implementation(...args)),
  );
}

export function asyncGeneratorMock<Args extends unknown[], Value>(
  implementation: (...args: Args) => Generator<Value, void, void>,
) {
  return vi.fn((...args: Args) => asyncValues(implementation(...args)));
}

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
