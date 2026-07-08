import type { McapTypes } from "@mcap/core";
import { Root, type INamespace } from "protobufjs";
import { describe, expect, it, vi } from "vitest";
import {
  enumerateMcapNumericFields,
  jsonNumericFieldsFromSamples,
  walkProtobufNumericFields,
} from "./numeric-fields";

describe("walkProtobufNumericFields", () => {
  it("collects numeric scalar leaves through nested messages", () => {
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

    const fields = walkProtobufNumericFields(root.lookupType("Twist"));
    expect(fields).toEqual([
      { path: "linear.x", valueType: "double" },
      { path: "linear.y", valueType: "double" },
      { path: "linear.z", valueType: "double" },
      { path: "valid", valueType: "bool" },
      { path: "sequence", valueType: "uint64" },
    ]);
  });

  it("skips repeated and map fields", () => {
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

    expect(walkProtobufNumericFields(root.lookupType("Scan"))).toEqual([
      { path: "angle", valueType: "float" },
    ]);
  });

  it("includes enums as numeric leaves", () => {
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

    expect(walkProtobufNumericFields(root.lookupType("Log"))).toEqual([
      { path: "level", valueType: "enum" },
    ]);
  });

  it("guards against recursive message types", () => {
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

    expect(walkProtobufNumericFields(root.lookupType("Node"))).toEqual([
      { path: "value", valueType: "double" },
    ]);
  });

  it("caps nesting depth", () => {
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
    expect(walkProtobufNumericFields(root.lookupType("L0"))).toEqual([]);
  });
});

describe("jsonNumericFieldsFromSamples", () => {
  it("unions numeric and boolean leaves across samples", () => {
    const fields = jsonNumericFieldsFromSamples([
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

  it("skips arrays, strings, and nulls", () => {
    expect(
      jsonNumericFieldsFromSamples([
        { ranges: [1, 2, 3], label: "x", missing: null },
      ]),
    ).toEqual([]);
  });
});

describe("enumerateMcapNumericFields", () => {
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
      readMessages: vi.fn(async function* (args?: {
        readonly topics?: readonly string[];
      }) {
        if (args?.topics?.includes("/telemetry")) {
          yield createMessage(jsonBytes({ speed: 3.2, mode: "auto" }), {
            channelId: 1,
          });
          yield createMessage(jsonBytes({ speed: 3.4, battery: 91 }), {
            channelId: 1,
          });
        }
      }),
      schemasById: new Map(),
    });

    const topics = await enumerateMcapNumericFields(reader);
    expect(topics).toEqual([
      { encoding: "unsupported", fields: [], topic: "/exotic" },
      {
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
      readMessages: vi.fn(async function* () {
        yield createMessage(jsonBytes({ v: 1 }), { channelId: 1 });
      }),
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
      { encoding: "protobuf", fields: [], topic: "/bad" },
    ]);
  });
});

function createReader({
  channelsById,
  readMessages,
  schemasById,
}: {
  readonly channelsById: ReadonlyMap<
    number,
    McapTypes.TypedMcapRecords["Channel"]
  >;
  readonly readMessages?: (args?: {
    readonly endTime?: bigint;
    readonly startTime?: bigint;
    readonly topics?: readonly string[];
  }) => AsyncGenerator<McapTypes.TypedMcapRecords["Message"], void, void>;
  readonly schemasById: ReadonlyMap<
    number,
    McapTypes.TypedMcapRecords["Schema"]
  >;
}) {
  return {
    channelsById,
    chunkIndexes: [],
    readMessages:
      readMessages ??
      vi.fn(async function* () {
        for (const message of [] as McapTypes.TypedMcapRecords["Message"][]) {
          yield message;
        }
      }),
    schemasById,
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
    name: options.name ?? "test.Message",
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
    logTime: options.logTime ?? 100n,
    publishTime: options.publishTime ?? 100n,
    sequence: options.sequence ?? 0,
    type: "Message",
  };
}

function jsonBytes(record: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(record));
}
