import { parse as parseRosMessageDefinition } from "@foxglove/rosmsg";
import { parseRos2idl } from "@foxglove/ros2idl-parser";
import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import type { McapTypes } from "@mcap/core";
import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import { describe, expect, it, vi } from "vitest";
import type { McapIndexedMessageTime } from "../reader";
import { resolveMcapTimelineStrategy } from "../timeline";
import { rawNodeToJson } from "./raw-record-prune";
import { readMcapRawMessageRecord } from "./read-raw-message-record";

const timeline = resolveMcapTimelineStrategy(undefined);

const TELEMETRY_ROOT = Root.fromJSON({
  nested: {
    test: {
      nested: {
        Telemetry: {
          fields: {
            speed: { id: 1, type: "double" },
            label: { id: 2, type: "string" },
          },
        },
      },
    },
  },
});

const TELEMETRY_TYPE = TELEMETRY_ROOT.lookupType("test.Telemetry");
const ROS_TELEMETRY_SCHEMA = `float64 speed
bool armed
geometry_msgs/Vector3 linear
===
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z`;
const ROS2_IDL_TELEMETRY_SCHEMA = `
module test_msgs {
  module msg {
    struct Telemetry {
      double speed;
      boolean armed;
    };
  };
};
`;

const TELEMETRY_SCHEMA_DATA: Uint8Array = descriptor.FileDescriptorSet.encode(
  (
    TELEMETRY_ROOT as unknown as {
      toDescriptor(
        version: string,
      ): Parameters<typeof descriptor.FileDescriptorSet.encode>[0];
    }
  ).toDescriptor("proto3"),
).finish();

describe("readMcapRawMessageRecord", () => {
  it("selects the newest message at or before the time (fallback scan)", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
      messages: [
        jsonMessage({ v: 1 }, 1_000_000_000n),
        jsonMessage({ v: 2 }, 2_000_000_000n),
        jsonMessage({ v: 3 }, 3_000_000_000n),
      ],
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 2_500_000_000n,
        topic: "/state",
      },
      timeline,
    });

    expect(result.status).toBe("ok");
    expect(result.logTimeNs).toBe(2_000_000_000n);
    expect(result.validFromNs).toBe(2_000_000_000n);
    expect(result.messageEncoding).toBe("json");
    expect(rawNodeToJson(rootOf(result))).toEqual({ v: 2 });
  });

  it("decodes protobuf messages through the schema descriptor", async () => {
    const reader = createReader({
      messages: [protobufMessage({ label: "ego", speed: 3.5 }, 1_000_000_000n)],
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/telemetry",
      },
      timeline,
    });

    expect(result.status).toBe("ok");
    expect(result.schemaName).toBe("test.Telemetry");
    expect(result.encodedPayloadBytes).toBeGreaterThan(0);
    expect(rawNodeToJson(rootOf(result))).toEqual({ label: "ego", speed: 3.5 });
  });

  it("decodes ros1 messages through embedded message definitions", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "ros1", topic: "/telemetry" }),
      messages: [
        createMessage(
          ros1TelemetryMessage({
            armed: true,
            linear: { x: 1, y: 2, z: 3 },
            speed: 3.5,
          }),
          { logTime: 1_000_000_000n },
        ),
      ],
      schema: createSchema(new TextEncoder().encode(ROS_TELEMETRY_SCHEMA), {
        encoding: "ros1msg",
        name: "test_msgs/Telemetry",
      }),
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/telemetry",
      },
      timeline,
    });

    expect(result.status).toBe("ok");
    expect(rawNodeToJson(rootOf(result))).toEqual({
      armed: true,
      linear: { x: 1, y: 2, z: 3 },
      speed: 3.5,
    });
  });

  it("decodes ros2 cdr messages through embedded message definitions", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "cdr", topic: "/telemetry" }),
      messages: [
        createMessage(
          ros2TelemetryMessage({
            armed: false,
            linear: { x: 10, y: 20, z: 30 },
            speed: 9.25,
          }),
          { logTime: 1_000_000_000n },
        ),
      ],
      schema: createSchema(new TextEncoder().encode(ROS_TELEMETRY_SCHEMA), {
        encoding: "ros2msg",
        name: "test_msgs/msg/Telemetry",
      }),
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/telemetry",
      },
      timeline,
    });

    expect(result.status).toBe("ok");
    expect(rawNodeToJson(rootOf(result))).toEqual({
      armed: false,
      linear: { x: 10, y: 20, z: 30 },
      speed: 9.25,
    });
  });

  it("decodes ros2 idl cdr messages through embedded IDL definitions", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "cdr", topic: "/telemetry" }),
      messages: [
        createMessage(ros2IdlTelemetryMessage({ armed: true, speed: 4.75 }), {
          logTime: 1_000_000_000n,
        }),
      ],
      schema: createSchema(
        new TextEncoder().encode(ROS2_IDL_TELEMETRY_SCHEMA),
        {
          encoding: "ros2idl",
          name: "test_msgs/msg/Telemetry",
        },
      ),
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/telemetry",
      },
      timeline,
    });

    expect(result.status).toBe("ok");
    expect(rawNodeToJson(rootOf(result))).toEqual({
      armed: true,
      speed: 4.75,
    });
  });

  it("uses the index predecessor walk when the reader supports it", async () => {
    const readLatestIndexedMessageTimes = vi.fn(async () => {
      return new Map([
        [
          "/state",
          [
            indexedEntry({ logTimeNs: 2_000_000_000n }),
          ] as readonly McapIndexedMessageTime[],
        ],
      ]);
    });
    const prefetchChunkData = vi.fn(async () => undefined);
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
      messages: [
        jsonMessage({ v: 1 }, 1_000_000_000n),
        jsonMessage({ v: 2 }, 2_000_000_000n),
        jsonMessage({ v: 3 }, 3_000_000_000n),
      ],
      prefetchChunkData,
      readIndexedMessageTimes: async function* () {
        yield indexedEntry({ logTimeNs: 3_000_000_000n });
      },
      readLatestIndexedMessageTimes,
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 2_500_000_000n,
        topic: "/state",
      },
      timeline,
    });

    expect(readLatestIndexedMessageTimes).toHaveBeenCalledWith({
      timeNs: 2_500_000_000n,
      topics: ["/state"],
    });
    expect(prefetchChunkData).toHaveBeenCalled();
    expect(result.status).toBe("ok");
    expect(result.logTimeNs).toBe(2_000_000_000n);
    // Validity ends at the next indexed message.
    expect(result.validFromNs).toBe(2_000_000_000n);
    expect(result.validUntilNs).toBe(3_000_000_000n);
  });

  it("bounds validity to the probe horizon when no next message exists", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
      messages: [jsonMessage({ v: 1 }, 1_000_000_000n)],
      readIndexedMessageTimes: async function* () {
        // No entries after the selected message.
      },
      readLatestIndexedMessageTimes: async () =>
        new Map([
          [
            "/state",
            [
              indexedEntry({ logTimeNs: 1_000_000_000n }),
            ] as readonly McapIndexedMessageTime[],
          ],
        ]),
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 5_000_000_000n,
        topic: "/state",
      },
      timeline,
    });

    expect(result.validUntilNs).toBe(1_000_000_000n + 60_000_000_000n);
  });

  it("returns empty when the topic has no message at or before the time", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
      messages: [jsonMessage({ v: 1 }, 9_000_000_000n)],
      readIndexedMessageTimes: async function* () {
        yield indexedEntry({ logTimeNs: 9_000_000_000n });
      },
      readLatestIndexedMessageTimes: async () => new Map(),
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 2_000_000_000n,
        topic: "/state",
      },
      timeline,
    });

    expect(result.status).toBe("empty");
    expect(result.root).toBeUndefined();
    expect(result.validFromNs).toBe(0n);
    // The empty verdict holds until the topic's first message.
    expect(result.validUntilNs).toBe(9_000_000_000n);
  });

  it("degrades to metadata when a ROS schema is unavailable", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "ros1", topic: "/imu" }),
      messages: [
        createMessage(new Uint8Array([1, 2, 3]), {
          logTime: 1_000_000_000n,
          sequence: 7,
        }),
      ],
      schema: createSchema(new Uint8Array(), {
        encoding: "ros1msg",
        name: "sensor_msgs/Imu",
      }),
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/imu",
      },
      timeline,
    });

    expect(result.status).toBe("unsupported");
    expect(result.decodeUnavailableReason).toBe("schema-unavailable");
    expect(result.messageEncoding).toBe("ros1");
    expect(result.schemaName).toBe("sensor_msgs/Imu");
    expect(result.sequence).toBe(7);
    expect(result.encodedPayloadBytes).toBe(3);
    expect(result.root).toBeUndefined();
  });

  it("degrades to metadata when protobuf schema resolution fails", async () => {
    const reader = createReader({
      messages: [
        createMessage(new Uint8Array([1, 2, 3]), {
          logTime: 1_000_000_000n,
        }),
      ],
      schema: createSchema(new Uint8Array([1, 2, 3]), {
        encoding: "protobuf",
        name: "broken.Message",
      }),
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/telemetry",
      },
      timeline,
    });

    expect(result.status).toBe("unsupported");
    expect(result.decodeUnavailableReason).toBe("schema-unavailable");
    expect(result.messageEncoding).toBe("protobuf");
    expect(result.root).toBeUndefined();
  });

  it("degrades to metadata for unsupported encodings", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "cbor", topic: "/binary" }),
      messages: [
        createMessage(new Uint8Array([1, 2, 3]), {
          logTime: 1_000_000_000n,
        }),
      ],
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/binary",
      },
      timeline,
    });

    expect(result.status).toBe("unsupported");
    expect(result.decodeUnavailableReason).toBe("unsupported-encoding");
    expect(result.messageEncoding).toBe("cbor");
    expect(result.root).toBeUndefined();
  });

  it("reports ROS decode errors without failing the read", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "ros1", topic: "/telemetry" }),
      messages: [
        createMessage(new Uint8Array([1, 2, 3]), {
          logTime: 1_000_000_000n,
        }),
      ],
      schema: createSchema(new TextEncoder().encode(ROS_TELEMETRY_SCHEMA), {
        encoding: "ros1msg",
        name: "test_msgs/Telemetry",
      }),
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/telemetry",
      },
      timeline,
    });

    expect(result.status).toBe("decode-error");
    expect(result.decodeError).toBeTruthy();
    expect(result.root).toBeUndefined();
  });

  it("reports decode errors without failing the read", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
      messages: [
        createMessage(new Uint8Array([0x7b, 0x21]), {
          logTime: 1_000_000_000n,
        }),
      ],
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/state",
      },
      timeline,
    });

    expect(result.status).toBe("decode-error");
    expect(result.decodeError).toBeTruthy();
    expect(result.logTimeNs).toBe(1_000_000_000n);
  });

  it("applies prune budget overrides from the request", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/map" }),
      messages: [
        jsonMessage({ data: [1, 2, 3, 4, 5, 6, 7, 8] }, 1_000_000_000n),
      ],
    });

    const result = await readMcapRawMessageRecord({
      reader,
      request: {
        prune: { maxArrayLength: 2 },
        source: createSource(),
        timeNs: 1_000_000_000n,
        topic: "/map",
      },
      timeline,
    });

    expect(result.truncated).toBe(true);
    expect(rawNodeToJson(rootOf(result))).toEqual({
      data: [1, 2, "… 6 more items"],
    });
  });

  it("throws for a topic with no channel", async () => {
    const reader = createReader({});
    await expect(
      readMcapRawMessageRecord({
        reader,
        request: {
          source: createSource(),
          timeNs: 1_000_000_000n,
          topic: "/nope",
        },
        timeline,
      }),
    ).rejects.toThrow("has no channel");
  });
});

function protobufMessage(
  record: Record<string, unknown>,
  logTime: bigint,
): McapTypes.TypedMcapRecords["Message"] {
  return createMessage(
    TELEMETRY_TYPE.encode(TELEMETRY_TYPE.create(record)).finish(),
    { logTime },
  );
}

function jsonMessage(
  record: Record<string, unknown>,
  logTime: bigint,
): McapTypes.TypedMcapRecords["Message"] {
  return createMessage(new TextEncoder().encode(JSON.stringify(record)), {
    logTime,
  });
}

function ros1TelemetryMessage(record: Record<string, unknown>): Uint8Array {
  const writer = new Ros1MessageWriter(
    parseRosMessageDefinition(ROS_TELEMETRY_SCHEMA),
  );
  return writer.writeMessage(record);
}

function ros2TelemetryMessage(record: Record<string, unknown>): Uint8Array {
  const writer = new Ros2MessageWriter(
    parseRosMessageDefinition(ROS_TELEMETRY_SCHEMA, { ros2: true }),
  );
  return writer.writeMessage(record);
}

function ros2IdlTelemetryMessage(record: Record<string, unknown>): Uint8Array {
  const writer = new Ros2MessageWriter(parseRos2idl(ROS2_IDL_TELEMETRY_SCHEMA));
  return writer.writeMessage(record);
}

function createReader({
  channel = createChannel({ messageEncoding: "protobuf", topic: "/telemetry" }),
  messages = [],
  prefetchChunkData,
  readIndexedMessageTimes,
  readLatestIndexedMessageTimes,
  schema = createSchema(TELEMETRY_SCHEMA_DATA),
}: {
  readonly channel?: McapTypes.TypedMcapRecords["Channel"];
  readonly messages?: readonly McapTypes.TypedMcapRecords["Message"][];
  readonly prefetchChunkData?: (request: {
    readonly chunkStartOffsets: readonly bigint[];
  }) => Promise<void>;
  readonly readIndexedMessageTimes?: () => AsyncGenerator<
    McapIndexedMessageTime,
    void,
    void
  >;
  readonly readLatestIndexedMessageTimes?: (args: {
    readonly timeNs: bigint;
    readonly topics: readonly string[];
  }) => Promise<ReadonlyMap<string, readonly McapIndexedMessageTime[]>>;
  readonly schema?: McapTypes.TypedMcapRecords["Schema"];
}) {
  return {
    channelsById: new Map([[channel.id, channel]]),
    chunkIndexes: [],
    prefetchChunkData,
    readIndexedMessageTimes,
    readLatestIndexedMessageTimes,
    readMessages: vi.fn(async function* (args?: {
      readonly endTime?: bigint;
      readonly startTime?: bigint;
    }) {
      for (const message of messages) {
        if (args?.startTime !== undefined && message.logTime < args.startTime) {
          continue;
        }
        if (args?.endTime !== undefined && message.logTime > args.endTime) {
          continue;
        }
        yield message;
      }
    }),
    schemasById: new Map([[schema.id, schema]]),
  };
}

function createChannel(
  options: Partial<McapTypes.TypedMcapRecords["Channel"]> = {},
): McapTypes.TypedMcapRecords["Channel"] {
  return {
    id: options.id ?? 1,
    messageEncoding: options.messageEncoding ?? "protobuf",
    metadata: options.metadata ?? new Map(),
    schemaId: options.schemaId ?? 3,
    topic: options.topic ?? "/telemetry",
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
    name: options.name ?? "test.Telemetry",
    type: "Schema",
  };
}

function createMessage(
  data: Uint8Array,
  options: Partial<McapTypes.TypedMcapRecords["Message"]> = {},
): McapTypes.TypedMcapRecords["Message"] {
  return {
    channelId: options.channelId ?? 1,
    data,
    logTime: options.logTime ?? 1_000_000_000n,
    publishTime: options.publishTime ?? options.logTime ?? 1_000_000_000n,
    sequence: options.sequence ?? 0,
    type: "Message",
  };
}

function indexedEntry(
  options: Partial<McapIndexedMessageTime> = {},
): McapIndexedMessageTime {
  return {
    channelId: options.channelId ?? 1,
    chunkStartOffset: options.chunkStartOffset ?? 1_000n,
    logTimeNs: options.logTimeNs ?? 1_000_000_000n,
    messageOffset: options.messageOffset ?? 0n,
    topic: options.topic ?? "/state",
  };
}

function createSource() {
  return { sourceId: "test", url: "memory://raw-record-test.mcap" };
}

function rootOf(result: {
  readonly root?: import("../types").McapRawObjectNode;
}): import("../types").McapRawObjectNode {
  if (!result.root) {
    throw new Error("Expected a decoded record root");
  }
  return result.root;
}
