import { Root, type INamespace } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import { describe, expect, it, vi } from "vitest";
import type {
  McapChannel,
  McapChunkIndex,
  McapMessage,
  McapSchema,
} from "../reader";
import { asyncValues } from "./inline-client.test-fixtures";
import {
  enumerateMcapNumericFields,
  numericFieldsFromSamples,
} from "./numeric-fields";

const ROS_TELEMETRY_SCHEMA = `float64 speed
bool armed
geometry_msgs/Vector3 linear
float32[] ranges
string label
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
      sequence<float> ranges;
    };
  };
};
`;

describe("protobuf numeric schema enumeration", () => {
  it("collects numeric scalar leaves through nested messages", async () => {
    const root = Root.fromJSON({
      nested: {
        Vec3: {
          fields: {
            x: { id: 1, type: "double" },
            y: { id: 2, type: "double" },
            z: { id: 3, type: "double" },
          },
        },
        Twist: {
          fields: {
            linear: { id: 1, type: "Vec3" },
            frameId: { id: 2, type: "string" },
            valid: { id: 3, type: "bool" },
            sequence: { id: 4, type: "uint64" },
          },
        },
      },
    });

    const fields = await enumerateProtobufNumericFields(root, "Twist");
    expect(fields).toEqual([
      { path: "linear.x", valueType: "double" },
      { path: "linear.y", valueType: "double" },
      { path: "linear.z", valueType: "double" },
      { path: "valid", valueType: "bool" },
      { path: "sequence", valueType: "uint64" },
    ]);
  });

  it("skips repeated and map fields", async () => {
    // `keyType` (map fields) is valid descriptor JSON that protobufjs's
    // IField typing does not model.
    const root = Root.fromJSON({
      nested: {
        Scan: {
          fields: {
            ranges: { id: 1, rule: "repeated", type: "float" },
            labels: { id: 2, keyType: "string", type: "int32" },
            angle: { id: 3, type: "float" },
          },
        },
      },
    } as unknown as INamespace);

    expect(await enumerateProtobufNumericFields(root, "Scan")).toEqual([
      { path: "angle", valueType: "float" },
    ]);
  });

  it("includes enums as numeric leaves", async () => {
    const root = Root.fromJSON({
      nested: {
        Level: { values: { INFO: 0, WARN: 1 } },
        Log: {
          fields: {
            level: { id: 1, type: "Level" },
            message: { id: 2, type: "string" },
          },
        },
      },
    });

    expect(await enumerateProtobufNumericFields(root, "Log")).toEqual([
      { path: "level", valueType: "enum" },
    ]);
  });

  it("guards against recursive message types", async () => {
    const root = Root.fromJSON({
      nested: {
        Node: {
          fields: {
            value: { id: 1, type: "double" },
            child: { id: 2, type: "Node" },
          },
        },
      },
    });

    expect(await enumerateProtobufNumericFields(root, "Node")).toEqual([
      { path: "value", valueType: "double" },
    ]);
  });

  it("caps nesting depth", async () => {
    const nested: Record<string, unknown> = {
      L7: { fields: { value: { id: 1, type: "double" } } },
    };
    for (let level = 6; level >= 0; level -= 1) {
      nested[`L${level}`] = {
        fields: { next: { id: 1, type: `L${level + 1}` } },
      };
    }
    const root = Root.fromJSON({ nested } as unknown as INamespace);

    // The deepest leaf lives beyond the depth cap.
    expect(await enumerateProtobufNumericFields(root, "L0")).toEqual([]);
  });
});

describe("numericFieldsFromSamples", () => {
  it("unions numeric and boolean leaves across samples", () => {
    const fields = numericFieldsFromSamples([
      { speed: 1.5, pose: { x: 1, name: "a" }, ok: true },
      { speed: 2.5, battery: 88 },
    ]);
    expect(fields).toEqual([
      { path: "speed", valueType: "number" },
      { path: "pose.x", valueType: "number" },
      { path: "ok", valueType: "bool" },
      { path: "battery", valueType: "number" },
    ]);
  });

  it("bounds indexed array leaves and skips strings and nulls", () => {
    const fields = numericFieldsFromSamples([
      { ranges: Array.from({ length: 55 }, (_, index) => index) },
      { label: "x", missing: null },
    ]);

    expect(fields).toHaveLength(50);
    expect(fields[0]).toEqual({ path: "ranges.0", valueType: "number" });
    expect(fields.at(-1)).toEqual({
      path: "ranges.49",
      valueType: "number",
    });
  });
});

describe("ROS numeric schema enumeration", () => {
  it("collects numeric scalar leaves through nested ROS message definitions", async () => {
    expect(await enumerateRosNumericFields(ROS_TELEMETRY_SCHEMA)).toEqual([
      { path: "speed", valueType: "float64" },
      { path: "armed", valueType: "bool" },
      { path: "linear.x", valueType: "float64" },
      { path: "linear.y", valueType: "float64" },
      { path: "linear.z", valueType: "float64" },
    ]);
  });

  it("collects numeric scalar leaves from ROS2 IDL definitions", async () => {
    expect(
      await enumerateRosNumericFields(ROS2_IDL_TELEMETRY_SCHEMA, {
        messageEncoding: "cdr",
        schemaEncoding: "ros2idl",
        schemaName: "test_msgs/msg/Telemetry",
      }),
    ).toEqual([
      { path: "speed", valueType: "float64" },
      { path: "armed", valueType: "bool" },
    ]);
  });
});

describe("enumerateMcapNumericFields", () => {
  it("unions numeric paths from every schema carried by one topic", async () => {
    const speedRoot = Root.fromJSON({
      nested: {
        Speed: { fields: { speed: { id: 1, type: "double" } } },
      },
    });
    const temperatureRoot = Root.fromJSON({
      nested: {
        Temperature: {
          fields: { temperature: { id: 1, type: "float" } },
        },
      },
    });
    const topics = await enumerateMcapNumericFields(
      createReader({
        channelsById: new Map([
          [1, createChannel({ id: 1, schemaId: 10, topic: "/shared" })],
          [2, createChannel({ id: 2, schemaId: 20, topic: "/shared" })],
        ]),
        schemasById: new Map([
          [
            10,
            createSchema(protobufDescriptorData(speedRoot), {
              id: 10,
              name: "Speed",
            }),
          ],
          [
            20,
            createSchema(protobufDescriptorData(temperatureRoot), {
              id: 20,
              name: "Temperature",
            }),
          ],
        ]),
      }),
      { includeDataFallback: false },
    );

    expect(topics).toEqual([
      {
        availability: "ready",
        encoding: "protobuf",
        fields: [
          { path: "speed", valueType: "double" },
          { path: "temperature", valueType: "float" },
        ],
        topic: "/shared",
      },
    ]);
  });

  it("does not claim no data when another channel schema is unreadable", async () => {
    const topics = await enumerateMcapNumericFields(
      createReader({
        channelsById: new Map([
          [
            1,
            createChannel({
              id: 1,
              messageEncoding: "json",
              schemaId: 0,
              topic: "/shared",
            }),
          ],
          [
            2,
            createChannel({
              id: 2,
              messageEncoding: "protobuf",
              schemaId: 99,
              topic: "/shared",
            }),
          ],
        ]),
        schemasById: new Map(),
      }),
      { includeDataFallback: false },
    );

    expect(topics).toEqual([
      {
        availability: "schema-unavailable",
        encoding: "mixed",
        fields: [],
        sampled: true,
        topic: "/shared",
      },
    ]);
  });

  it("samples dynamic paths from separate chunks for every shared-topic channel", async () => {
    const channelsById = new Map([
      [
        1,
        createChannel({
          id: 1,
          messageEncoding: "json",
          schemaId: 0,
          topic: "/shared",
        }),
      ],
      [
        2,
        createChannel({
          id: 2,
          messageEncoding: "json",
          schemaId: 0,
          topic: "/shared",
        }),
      ],
    ]);
    const messages = new Map([
      [1_000n, createMessage(jsonBytes({ left: 1 }), { channelId: 1 })],
      [2_000n, createMessage(jsonBytes({ right: 2 }), { channelId: 2 })],
    ]);
    const base = createReader({ channelsById, schemasById: new Map() });
    const readIndexedMessageTimes = vi.fn(
      (args?: { readonly chunkStartOffsets?: readonly bigint[] }) => {
        const chunkStartOffset = args?.chunkStartOffsets?.[0];
        const message = chunkStartOffset && messages.get(chunkStartOffset);
        return asyncValues(
          chunkStartOffset && message
            ? [
                {
                  channelId: message.channelId,
                  chunkStartOffset,
                  logTimeNs: message.logTime,
                  messageOffset: 0n,
                  topic: "/shared",
                },
              ]
            : [],
        );
      },
    );
    const readIndexedMessages = vi.fn(
      (request: {
        readonly entries: readonly {
          readonly chunkStartOffset: bigint;
        }[];
      }) =>
        Promise.resolve(
          request.entries.flatMap((entry) => {
            const message = messages.get(entry.chunkStartOffset);
            return message ? [message] : [];
          }),
        ),
    );
    const reader = Object.assign(base, {
      chunkIndexes: [
        createChunkIndex({
          chunkStartOffset: 1_000n,
          messageIndexOffsets: new Map([[1, 10_000n]]),
        }),
        createChunkIndex({
          chunkStartOffset: 2_000n,
          messageIndexOffsets: new Map([[2, 20_000n]]),
        }),
      ],
      readIndexedMessages,
      readIndexedMessageTimes,
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "ready",
        encoding: "json",
        fields: [
          { path: "left", valueType: "number" },
          { path: "right", valueType: "number" },
        ],
        sampled: true,
        topic: "/shared",
      },
    ]);
    expect(readIndexedMessageTimes).toHaveBeenCalledTimes(2);
    expect(readIndexedMessages).toHaveBeenCalledOnce();
  });

  it("classifies json, and unsupported channels; samples json messages", async () => {
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            messageEncoding: "json",
            topic: "/telemetry",
          }),
        ],
        [
          2,
          createChannel({ id: 2, messageEncoding: "cbor", topic: "/exotic" }),
        ],
      ]),
      indexedMessages: [
        createMessage(jsonBytes({ speed: 3.2, mode: "auto" }), {
          channelId: 1,
        }),
        createMessage(jsonBytes({ speed: 3.4, battery: 91 }), {
          channelId: 1,
        }),
      ],
      schemasById: new Map(),
    });

    const topics = await enumerateMcapNumericFields(reader);
    expect(topics).toEqual([
      {
        availability: "unsupported-encoding",
        encoding: "unsupported",
        fields: [],
        topic: "/exotic",
      },
      {
        availability: "ready",
        encoding: "json",
        fields: [
          { path: "speed", valueType: "number" },
          { path: "battery", valueType: "number" },
        ],
        sampled: true,
        topic: "/telemetry",
      },
    ]);
  });

  it("filters to requested topics", async () => {
    const reader = createReader({
      channelsById: new Map([
        [1, createChannel({ id: 1, messageEncoding: "json", topic: "/a" })],
        [2, createChannel({ id: 2, messageEncoding: "json", topic: "/b" })],
      ]),
      indexedMessages: [createMessage(jsonBytes({ v: 1 }), { channelId: 1 })],
      schemasById: new Map(),
    });

    const topics = await enumerateMcapNumericFields(reader, { topics: ["/a"] });
    expect(topics.map((topic) => topic.topic)).toEqual(["/a"]);
  });

  it("degrades a protobuf channel with an unparseable descriptor to no fields", async () => {
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({ id: 1, messageEncoding: "protobuf", topic: "/bad" }),
        ],
      ]),
      schemasById: new Map([
        [
          3,
          createSchema(new Uint8Array([1, 2, 3]), {
            name: "broken.Message",
          }),
        ],
      ]),
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "schema-unavailable",
        encoding: "protobuf",
        fields: [],
        topic: "/bad",
      },
    ]);
  });

  it("samples indexed leaves for repeated protobuf numeric fields", async () => {
    const root = Root.fromJSON({
      nested: {
        test: {
          nested: {
            RobotState: {
              fields: {
                position: { id: 1, rule: "repeated", type: "double" },
                sequence: { id: 2, type: "uint64" },
              },
            },
          },
        },
      },
    });
    const type = root.lookupType("test.RobotState");
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            messageEncoding: "protobuf",
            topic: "/left-arm-state",
          }),
        ],
      ]),
      indexedMessages: [
        createMessage(
          type
            .encode(type.create({ position: [-0.48, 0.71, 0.7], sequence: 2 }))
            .finish(),
        ),
      ],
      schemasById: new Map([
        [
          3,
          createSchema(protobufDescriptorData(root), {
            name: "test.RobotState",
          }),
        ],
      ]),
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "ready",
        encoding: "protobuf",
        fields: [
          { path: "sequence", valueType: "uint64" },
          { path: "position.0", valueType: "number" },
          { path: "position.1", valueType: "number" },
          { path: "position.2", valueType: "number" },
        ],
        sampled: true,
        topic: "/left-arm-state",
      },
    ]);
  });

  it("marks decodable schemas with no numeric leaves", async () => {
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            messageEncoding: "protobuf",
            topic: "/proto-text",
          }),
        ],
        [
          2,
          createChannel({
            id: 2,
            messageEncoding: "ros1",
            schemaId: 4,
            topic: "/ros-text",
          }),
        ],
      ]),
      schemasById: new Map([
        [
          3,
          createSchema(
            protobufDescriptorData(
              Root.fromJSON({
                nested: {
                  test: {
                    nested: {
                      TextOnly: {
                        fields: { label: { id: 1, type: "string" } },
                      },
                    },
                  },
                },
              }),
            ),
            { name: "test.TextOnly" },
          ),
        ],
        [
          4,
          createSchema(new TextEncoder().encode("string label"), {
            encoding: "ros1msg",
            id: 4,
            name: "test_msgs/TextOnly",
          }),
        ],
      ]),
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "no-numeric-fields",
        encoding: "protobuf",
        fields: [],
        topic: "/proto-text",
      },
      {
        availability: "no-numeric-fields",
        encoding: "ros1",
        fields: [],
        topic: "/ros-text",
      },
    ]);
  });

  it("walks ROS schemas and samples declared arrays", async () => {
    const readMessages = vi.fn(async function* () {
      for await (const message of asyncValues<McapMessage>([])) {
        yield message;
      }
    });
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            messageEncoding: "ros1",
            topic: "/ros1",
          }),
        ],
        [
          2,
          createChannel({
            id: 2,
            messageEncoding: "cdr",
            schemaId: 4,
            topic: "/ros2",
          }),
        ],
        [
          3,
          createChannel({
            id: 3,
            messageEncoding: "cdr",
            schemaId: 5,
            topic: "/idl",
          }),
        ],
      ]),
      readMessages,
      schemasById: new Map([
        [
          3,
          createSchema(new TextEncoder().encode(ROS_TELEMETRY_SCHEMA), {
            encoding: "ros1msg",
            name: "test_msgs/Telemetry",
          }),
        ],
        [
          4,
          createSchema(new TextEncoder().encode(ROS_TELEMETRY_SCHEMA), {
            encoding: "ros2msg",
            id: 4,
            name: "test_msgs/msg/Telemetry",
          }),
        ],
        [
          5,
          createSchema(new TextEncoder().encode(ROS2_IDL_TELEMETRY_SCHEMA), {
            encoding: "ros2idl",
            id: 5,
            name: "test_msgs/msg/Telemetry",
          }),
        ],
      ]),
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "ready",
        encoding: "cdr",
        fields: [
          { path: "speed", valueType: "float64" },
          { path: "armed", valueType: "bool" },
        ],
        sampled: true,
        topic: "/idl",
      },
      {
        availability: "ready",
        encoding: "ros1",
        fields: [
          { path: "speed", valueType: "float64" },
          { path: "armed", valueType: "bool" },
          { path: "linear.x", valueType: "float64" },
          { path: "linear.y", valueType: "float64" },
          { path: "linear.z", valueType: "float64" },
        ],
        sampled: true,
        topic: "/ros1",
      },
      {
        availability: "ready",
        encoding: "cdr",
        fields: [
          { path: "speed", valueType: "float64" },
          { path: "armed", valueType: "bool" },
          { path: "linear.x", valueType: "float64" },
          { path: "linear.y", valueType: "float64" },
          { path: "linear.z", valueType: "float64" },
        ],
        sampled: true,
        topic: "/ros2",
      },
    ]);
    expect(readMessages).not.toHaveBeenCalled();
  });

  it("degrades an unparseable ROS schema to no fields", async () => {
    const reader = createReader({
      channelsById: new Map([
        [1, createChannel({ id: 1, messageEncoding: "ros1", topic: "/bad" })],
      ]),
      schemasById: new Map([
        [
          3,
          createSchema(new TextEncoder().encode("not a schema"), {
            encoding: "ros1msg",
            name: "broken/Message",
          }),
        ],
      ]),
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "schema-unavailable",
        encoding: "ros1",
        fields: [],
        topic: "/bad",
      },
    ]);
  });

  it("marks sampled JSON topics with no numeric values", async () => {
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            messageEncoding: "json",
            topic: "/labels",
          }),
        ],
      ]),
      indexedMessages: [
        createMessage(jsonBytes({ label: "idle" }), { channelId: 1 }),
      ],
      schemasById: new Map(),
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "no-numeric-fields",
        encoding: "json",
        fields: [],
        sampled: true,
        topic: "/labels",
      },
    ]);
  });

  it("does not touch message data for schema-complete topics", async () => {
    const root = Root.fromJSON({
      nested: {
        test: {
          nested: {
            Scalar: {
              fields: {
                speed: { id: 1, type: "double" },
              },
            },
          },
        },
      },
    });
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            messageEncoding: "protobuf",
            topic: "/scalar",
          }),
        ],
      ]),
      indexedMessages: [createMessage(new Uint8Array(), { channelId: 1 })],
      schemasById: new Map([
        [
          3,
          createSchema(protobufDescriptorData(root), {
            name: "test.Scalar",
          }),
        ],
      ]),
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "ready",
        encoding: "protobuf",
        fields: [{ path: "speed", valueType: "double" }],
        topic: "/scalar",
      },
    ]);
    expect(reader.readIndexedMessageTimes).not.toHaveBeenCalled();
    expect(reader.readIndexedMessages).not.toHaveBeenCalled();
    expect(reader.readMessages).not.toHaveBeenCalled();
  });

  it("samples at most three messages from one selected indexed chunk", async () => {
    const firstChunk = createChunkIndex({
      chunkLength: 1_024n,
      chunkStartOffset: 1_000n,
      messageEndTime: 20n,
      messageIndexOffsets: new Map([[1, 10_000n]]),
      messageStartTime: 10n,
    });
    const playheadChunk = createChunkIndex({
      chunkLength: 256n,
      chunkStartOffset: 2_000n,
      messageEndTime: 120n,
      messageIndexOffsets: new Map([[1, 20_000n]]),
      messageStartTime: 110n,
    });
    const sampledMessages = [
      createMessage(jsonBytes({ a: 1 }), { channelId: 1, logTime: 111n }),
      createMessage(jsonBytes({ b: 2 }), { channelId: 1, logTime: 112n }),
      createMessage(jsonBytes({ c: 3 }), { channelId: 1, logTime: 113n }),
      createMessage(jsonBytes({ ignored: 4 }), {
        channelId: 1,
        logTime: 114n,
      }),
    ];
    const readIndexedMessageTimes = vi.fn(async function* (args?: {
      readonly chunkStartOffsets?: readonly bigint[];
      readonly limit?: number;
      readonly topics?: readonly string[];
    }) {
      expect(args).toMatchObject({
        chunkStartOffsets: [2_000n],
        topics: ["/telemetry"],
      });
      for await (const [index, message] of asyncValues(
        sampledMessages.entries(),
      )) {
        yield {
          channelId: 1,
          chunkStartOffset: 2_000n,
          logTimeNs: message.logTime,
          messageOffset: BigInt(index),
          topic: "/telemetry",
        };
      }
    });
    const readIndexedMessages = vi.fn(
      (request: {
        readonly entries: readonly { readonly messageOffset: bigint }[];
      }) =>
        Promise.resolve(
          request.entries.map(
            (entry) => sampledMessages[Number(entry.messageOffset)],
          ),
        ),
    );
    const reader = Object.assign(
      createReader({
        channelsById: new Map([
          [
            1,
            createChannel({
              id: 1,
              messageEncoding: "json",
              topic: "/telemetry",
            }),
          ],
        ]),
        schemasById: new Map(),
      }),
      {
        chunkIndexes: [firstChunk, playheadChunk],
        readIndexedMessages,
        readIndexedMessageTimes,
      },
    );

    expect(
      await enumerateMcapNumericFields(reader, { sampleTimeNs: 115n }),
    ).toEqual([
      {
        availability: "ready",
        encoding: "json",
        fields: [
          { path: "a", valueType: "number" },
          { path: "b", valueType: "number" },
          { path: "c", valueType: "number" },
        ],
        sampled: true,
        topic: "/telemetry",
      },
    ]);
    expect(readIndexedMessageTimes).toHaveBeenCalledOnce();
    expect(readIndexedMessages).toHaveBeenCalledOnce();
    expect(readIndexedMessages.mock.calls[0][0].entries).toHaveLength(3);
    expect(reader.readMessages).not.toHaveBeenCalled();
  });

  it("shares one fallback chunk read across dynamic topics", async () => {
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            messageEncoding: "json",
            topic: "/left",
          }),
        ],
        [
          2,
          createChannel({
            id: 2,
            messageEncoding: "json",
            topic: "/right",
          }),
        ],
      ]),
      indexedMessages: [
        createMessage(jsonBytes({ left: 1 }), { channelId: 1 }),
        createMessage(jsonBytes({ right: 2 }), { channelId: 2 }),
      ],
      schemasById: new Map(),
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "ready",
        encoding: "json",
        fields: [{ path: "left", valueType: "number" }],
        sampled: true,
        topic: "/left",
      },
      {
        availability: "ready",
        encoding: "json",
        fields: [{ path: "right", valueType: "number" }],
        sampled: true,
        topic: "/right",
      },
    ]);
    expect(reader.readIndexedMessageTimes).toHaveBeenCalledOnce();
    expect(reader.readIndexedMessages).toHaveBeenCalledOnce();
    expect(reader.readMessages).not.toHaveBeenCalled();
  });

  it("returns the schema phase without starting bounded fallback I/O", async () => {
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            messageEncoding: "json",
            topic: "/telemetry",
          }),
        ],
      ]),
      indexedMessages: [
        createMessage(jsonBytes({ speed: 3.2 }), { channelId: 1 }),
      ],
      schemasById: new Map(),
    });

    expect(
      await enumerateMcapNumericFields(reader, {
        includeDataFallback: false,
      }),
    ).toEqual([
      {
        availability: "no-numeric-fields",
        encoding: "json",
        fields: [],
        sampled: true,
        topic: "/telemetry",
      },
    ]);
    expect(reader.readIndexedMessageTimes).not.toHaveBeenCalled();
    expect(reader.readIndexedMessages).not.toHaveBeenCalled();
    expect(reader.readMessages).not.toHaveBeenCalled();
  });

  it("uses the first indexed chunk when it is cheaper than the playhead chunk", async () => {
    const readIndexedMessageTimes = vi.fn(async function* (args?: {
      readonly chunkStartOffsets?: readonly bigint[];
    }) {
      expect(args?.chunkStartOffsets).toEqual([1_000n]);
      for await (const entry of asyncValues<
        Array<{
          readonly channelId: number;
          readonly chunkStartOffset: bigint;
          readonly logTimeNs: bigint;
          readonly messageOffset: bigint;
          readonly topic: string;
        }>
      >([])) {
        yield entry;
      }
    });
    const reader = Object.assign(
      createReader({
        channelsById: new Map([
          [
            1,
            createChannel({
              id: 1,
              messageEncoding: "json",
              topic: "/telemetry",
            }),
          ],
        ]),
        schemasById: new Map(),
      }),
      {
        chunkIndexes: [
          createChunkIndex({
            chunkLength: 128n,
            chunkStartOffset: 1_000n,
            messageIndexOffsets: new Map([[1, 10_000n]]),
          }),
          createChunkIndex({
            chunkLength: 512n,
            chunkStartOffset: 2_000n,
            messageEndTime: 120n,
            messageIndexOffsets: new Map([[1, 20_000n]]),
            messageStartTime: 110n,
          }),
        ],
        readIndexedMessageTimes,
      },
    );

    await enumerateMcapNumericFields(reader, { sampleTimeNs: 115n });

    expect(readIndexedMessageTimes).toHaveBeenCalledOnce();
    expect(reader.readMessages).not.toHaveBeenCalled();
  });

  it("does not fall back to an unbounded scan when indexes are unavailable", async () => {
    const readMessages = vi.fn(async function* () {
      yield* asyncValues([createMessage(jsonBytes({ speed: 3.2 }))]);
    });
    const reader = createReader({
      channelsById: new Map([
        [
          1,
          createChannel({
            id: 1,
            messageEncoding: "json",
            topic: "/telemetry",
          }),
        ],
      ]),
      readMessages,
      schemasById: new Map(),
    });

    expect(await enumerateMcapNumericFields(reader)).toEqual([
      {
        availability: "no-numeric-fields",
        encoding: "json",
        fields: [],
        sampled: true,
        topic: "/telemetry",
      },
    ]);
    expect(readMessages).not.toHaveBeenCalled();
  });
});

async function enumerateProtobufNumericFields(root: Root, schemaName: string) {
  const [topic] = await enumerateMcapNumericFields(
    createReader({
      channelsById: new Map([[1, createChannel()]]),
      schemasById: new Map([
        [3, createSchema(protobufDescriptorData(root), { name: schemaName })],
      ]),
    }),
  );
  return topic?.fields ?? [];
}

async function enumerateRosNumericFields(
  schema: string,
  options: {
    readonly messageEncoding: string;
    readonly schemaEncoding: string;
    readonly schemaName: string;
  } = {
    messageEncoding: "ros1",
    schemaEncoding: "ros1msg",
    schemaName: "test_msgs/Telemetry",
  },
) {
  const [topic] = await enumerateMcapNumericFields(
    createReader({
      channelsById: new Map([
        [1, createChannel({ messageEncoding: options.messageEncoding })],
      ]),
      schemasById: new Map([
        [
          3,
          createSchema(new TextEncoder().encode(schema), {
            encoding: options.schemaEncoding,
            name: options.schemaName,
          }),
        ],
      ]),
    }),
  );
  return topic?.fields ?? [];
}

function protobufDescriptorData(root: Root): Uint8Array {
  return descriptor.FileDescriptorSet.encode(
    (
      root as unknown as {
        toDescriptor(
          version: string,
        ): Parameters<typeof descriptor.FileDescriptorSet.encode>[0];
      }
    ).toDescriptor("proto3"),
  ).finish();
}

function createReader({
  channelsById,
  indexedMessages,
  readMessages,
  schemasById,
}: {
  readonly channelsById: ReadonlyMap<number, McapChannel>;
  readonly indexedMessages?: readonly McapMessage[];
  readonly readMessages?: (args?: {
    readonly endTime?: bigint;
    readonly startTime?: bigint;
    readonly topics?: readonly string[];
  }) => AsyncGenerator<McapMessage, void, void>;
  readonly schemasById: ReadonlyMap<number, McapSchema>;
}) {
  const chunkStartOffset = 1_000n;
  const messageIndexOffsets = new Map(
    [
      ...new Set(indexedMessages?.map((message) => message.channelId) ?? []),
    ].map((channelId) => [channelId, 2_000n] as const),
  );
  const chunkIndexes =
    indexedMessages === undefined
      ? []
      : [
          createChunkIndex({
            messageEndTime: 1_000n,
            messageIndexOffsets,
            messageStartTime: 0n,
          }),
        ];
  const readIndexedMessageTimes = vi.fn(async function* (args?: {
    readonly chunkStartOffsets?: readonly bigint[];
    readonly limit?: number;
    readonly topics?: readonly string[];
  }) {
    let yielded = 0;
    for await (const [index, message] of asyncValues(
      (indexedMessages ?? []).entries(),
    )) {
      const topic = channelsById.get(message.channelId)?.topic;
      if (
        !topic ||
        (args?.topics && !args.topics.includes(topic)) ||
        (args?.chunkStartOffsets &&
          !args.chunkStartOffsets.includes(chunkStartOffset))
      ) {
        continue;
      }
      yield {
        channelId: message.channelId,
        chunkStartOffset,
        logTimeNs: message.logTime,
        messageOffset: BigInt(index),
        topic,
      };
      yielded += 1;
      if (args?.limit !== undefined && yielded >= args.limit) {
        return;
      }
    }
  });
  const readIndexedMessages = vi.fn(
    (request: {
      readonly entries: readonly { readonly messageOffset: bigint }[];
    }) =>
      Promise.resolve(
        request.entries.flatMap((entry) => {
          const message = indexedMessages?.[Number(entry.messageOffset)];
          return message ? [message] : [];
        }),
      ),
  );
  return {
    channelsById,
    chunkIndexes,
    readIndexedMessages,
    readIndexedMessageTimes,
    readMessages: readMessages ?? vi.fn(() => asyncValues<McapMessage>([])),
    schemasById,
  };
}

function createChunkIndex(
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

function createChannel(options: Partial<McapChannel> = {}): McapChannel {
  return {
    id: options.id ?? 1,
    messageEncoding: options.messageEncoding ?? "protobuf",
    metadata: options.metadata ?? new Map<string, string>(),
    schemaId: options.schemaId ?? 3,
    topic: options.topic ?? "/topic",
    type: "Channel",
  };
}

function createSchema(
  data: Uint8Array,
  options: Partial<McapSchema> = {},
): McapSchema {
  return {
    data,
    encoding: options.encoding ?? "protobuf",
    id: options.id ?? 3,
    name: options.name ?? "test.Message",
    type: "Schema",
  };
}

function createMessage(
  data: Uint8Array,
  options: Partial<McapMessage> = {},
): McapMessage {
  return {
    channelId: options.channelId ?? 1,
    data,
    logTime: options.logTime ?? 100n,
    publishTime: options.publishTime ?? 100n,
    sequence: options.sequence ?? 0,
    type: "Message",
  };
}

function jsonBytes(record: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(record));
}
