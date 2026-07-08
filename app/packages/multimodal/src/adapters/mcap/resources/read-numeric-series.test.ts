import type { McapTypes } from "@mcap/core";
import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import { describe, expect, it, vi } from "vitest";
import { resolveMcapTimelineStrategy } from "../timeline";
import {
  projectNumericField,
  readMcapNumericSeries,
} from "./read-numeric-series";

const TELEMETRY_ROOT = Root.fromJSON({
  nested: {
    test: {
      nested: {
        Vec3: {
          fields: {
            x: { id: 1, type: "double" },
            y: { id: 2, type: "double" },
          },
        },
        Telemetry: {
          fields: {
            speed: { id: 1, type: "double" },
            linear: { id: 2, type: "test.Vec3" },
            armed: { id: 3, type: "bool" },
          },
        },
      },
    },
  },
});

const TELEMETRY_TYPE = TELEMETRY_ROOT.lookupType("test.Telemetry");

const TELEMETRY_SCHEMA_DATA: Uint8Array = descriptor.FileDescriptorSet.encode(
  (
    TELEMETRY_ROOT as unknown as {
      toDescriptor(
        version: string,
      ): Parameters<typeof descriptor.FileDescriptorSet.encode>[0];
    }
  ).toDescriptor("proto3"),
).finish();

describe("projectNumericField", () => {
  it("walks nested records and coerces numerics", () => {
    const record = {
      speed: 3.5,
      linear: { x: 1.25 },
      armed: true,
      count: 7n,
      name: "ego",
      ranges: [1, 2],
    };
    expect(projectNumericField(record, ["speed"])).toBe(3.5);
    expect(projectNumericField(record, ["linear", "x"])).toBe(1.25);
    expect(projectNumericField(record, ["armed"])).toBe(1);
    expect(projectNumericField(record, ["count"])).toBe(7);
    expect(projectNumericField(record, ["name"])).toBeUndefined();
    expect(projectNumericField(record, ["ranges", "0"])).toBeUndefined();
    expect(projectNumericField(record, ["missing", "leaf"])).toBeUndefined();
  });

  it("coerces Long-like objects via toNumber", () => {
    expect(
      projectNumericField({ ticks: { toNumber: () => 42 } }, ["ticks"]),
    ).toBe(42);
  });

  it("rejects non-finite numbers", () => {
    expect(
      projectNumericField({ v: Number.POSITIVE_INFINITY }, ["v"]),
    ).toBeUndefined();
  });
});

describe("readMcapNumericSeries", () => {
  const timeline = resolveMcapTimelineStrategy(undefined);

  it("extracts packed relative-time series from protobuf messages", async () => {
    const reader = createReader({
      messages: [
        telemetryMessage({ speed: 1, linear: { x: 10 } }, 1_000_000_000n),
        telemetryMessage({ speed: 2, linear: { x: 20 } }, 2_000_000_000n),
        telemetryMessage({ speed: 3 }, 3_000_000_000n),
      ],
    });

    const result = await readMcapNumericSeries({
      reader,
      request: {
        fieldPaths: ["speed", "linear.x", "missing.path"],
        source: createSource(),
        topic: "/telemetry",
      },
      timeline,
    });

    expect(result.topic).toBe("/telemetry");
    expect(result.baseTimeNs).toBe(1_000_000_000n);
    expect(result.messageCount).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.fields.map((field) => field.path)).toEqual([
      "speed",
      "linear.x",
      "missing.path",
    ]);
    expect([...result.fields[0].timesSec]).toEqual([0, 1, 2]);
    expect([...result.fields[0].values]).toEqual([1, 2, 3]);
    // Proto3 omits zero-valued messages: linear absent on the last
    // message projects the default 0 record... absent submessage means
    // undefined → NaN gap.
    expect([...result.fields[1].values.slice(0, 2)]).toEqual([10, 20]);
    expect([...result.fields[2].values].every(Number.isNaN)).toBe(true);
  });

  it("extracts from JSON messages including booleans", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
      messages: [
        jsonMessage({ battery: 90, armed: false }, 1_000_000_000n),
        jsonMessage({ battery: 88, armed: true }, 2_000_000_000n),
      ],
    });

    const result = await readMcapNumericSeries({
      reader,
      request: {
        fieldPaths: ["battery", "armed"],
        source: createSource(),
        topic: "/state",
      },
      timeline,
    });

    expect([...result.fields[0].values]).toEqual([90, 88]);
    expect([...result.fields[1].values]).toEqual([0, 1]);
  });

  it("keeps NaN gap points for undecodable messages", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
      messages: [
        jsonMessage({ battery: 90 }, 1_000_000_000n),
        createMessage(new Uint8Array([0x7b, 0x21]), {
          logTime: 2_000_000_000n,
        }),
        jsonMessage({ battery: 70 }, 3_000_000_000n),
      ],
    });

    const result = await readMcapNumericSeries({
      reader,
      request: {
        fieldPaths: ["battery"],
        source: createSource(),
        topic: "/state",
      },
      timeline,
    });

    expect(result.messageCount).toBe(3);
    expect(result.fields[0].values[0]).toBe(90);
    expect(Number.isNaN(result.fields[0].values[1])).toBe(true);
    expect(result.fields[0].values[2]).toBe(70);
  });

  it("applies a stride and reports truncation for very large topics", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
      messages: [
        jsonMessage({ v: 0 }, 1_000_000_000n),
        jsonMessage({ v: 1 }, 2_000_000_000n),
        jsonMessage({ v: 2 }, 3_000_000_000n),
        jsonMessage({ v: 3 }, 4_000_000_000n),
        jsonMessage({ v: 4 }, 5_000_000_000n),
        jsonMessage({ v: 5 }, 6_000_000_000n),
      ],
      statistics: createStatistics({
        channelMessageCounts: new Map([[1, 1_000_001n]]),
      }),
    });

    const result = await readMcapNumericSeries({
      reader,
      request: {
        fieldPaths: ["v"],
        source: createSource(),
        topic: "/state",
      },
      timeline,
    });

    // recordCount > 500k cap → stride 3: messages 0 and 3 survive.
    expect(result.truncated).toBe(true);
    expect([...result.fields[0].values]).toEqual([0, 3]);
  });

  it("rejects empty field paths and unsupported encodings", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "cbor", topic: "/exotic" }),
    });

    await expect(
      readMcapNumericSeries({
        reader,
        request: { fieldPaths: [], source: createSource(), topic: "/exotic" },
        timeline,
      }),
    ).rejects.toThrow("at least one field path");
    await expect(
      readMcapNumericSeries({
        reader,
        request: {
          fieldPaths: ["v"],
          source: createSource(),
          topic: "/exotic",
        },
        timeline,
      }),
    ).rejects.toThrow("does not support encoding");
  });

  it("throws for a topic with no channel", async () => {
    const reader = createReader({});
    await expect(
      readMcapNumericSeries({
        reader,
        request: {
          fieldPaths: ["v"],
          source: createSource(),
          topic: "/nope",
        },
        timeline,
      }),
    ).rejects.toThrow("has no channel");
  });
});

function telemetryMessage(
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

function createReader({
  channel = createChannel({ messageEncoding: "protobuf", topic: "/telemetry" }),
  messages = [],
  statistics,
}: {
  readonly channel?: McapTypes.TypedMcapRecords["Channel"];
  readonly messages?: readonly McapTypes.TypedMcapRecords["Message"][];
  readonly statistics?: McapTypes.TypedMcapRecords["Statistics"];
}) {
  return {
    channelsById: new Map([[channel.id, channel]]),
    chunkIndexes: [createChunkIndex()],
    readMessages: vi.fn(async function* () {
      for (const message of messages) {
        yield message;
      }
    }),
    schemasById: new Map([[3, createSchema(TELEMETRY_SCHEMA_DATA)]]),
    statistics,
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

function createSchema(data: Uint8Array): McapTypes.TypedMcapRecords["Schema"] {
  return {
    data,
    encoding: "protobuf",
    id: 3,
    name: "test.Telemetry",
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
    publishTime: options.publishTime ?? 1_000_000_000n,
    sequence: options.sequence ?? 0,
    type: "Message",
  };
}

function createChunkIndex(): McapTypes.TypedMcapRecords["ChunkIndex"] {
  return {
    chunkLength: 256n,
    chunkStartOffset: 1_000n,
    compressedSize: 0n,
    compression: "",
    messageEndTime: 10_000_000_000n,
    messageIndexLength: 0n,
    messageIndexOffsets: new Map(),
    messageStartTime: 1_000_000_000n,
    type: "ChunkIndex",
  };
}

function createStatistics(
  options: Partial<McapTypes.TypedMcapRecords["Statistics"]> = {},
): McapTypes.TypedMcapRecords["Statistics"] {
  return {
    attachmentCount: 0,
    channelCount: 1,
    channelMessageCounts: options.channelMessageCounts ?? new Map(),
    chunkCount: 1,
    messageCount: 0n,
    messageEndTime: 0n,
    messageStartTime: 0n,
    metadataCount: 0,
    schemaCount: 1,
    type: "Statistics",
  };
}

function createSource() {
  return { sourceId: "test", url: "memory://test.mcap" };
}
