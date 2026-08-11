import { parse as parseRosMessageDefinition } from "@foxglove/rosmsg";
import { MessageWriter as Ros1MessageWriter } from "@foxglove/rosmsg-serialization";
import { MessageWriter as Ros2MessageWriter } from "@foxglove/rosmsg2-serialization";
import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import { describe, expect, it, vi } from "vitest";
import type {
  McapChannel,
  McapChunkIndex,
  McapIndexedReaderLike,
  McapMessage,
  McapReadContinuation,
  McapSchema,
  McapStatistics,
} from "../../reader";
import { resolveMcapTimelineStrategy } from "../timeline";
import {
  numericSeriesSlicePointBudget,
  projectNumericField,
  readMcapNumericSeries,
  readMcapNumericSeriesSlice,
} from "./read-numeric-series";
import type { ReadWorkBudget, ReadWorkUsage } from "../../../../ports";
import { asyncValues } from "../inline-client.test-fixtures";

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
const ROS_TELEMETRY_SCHEMA = `float64 speed
bool armed
geometry_msgs/Vector3 linear
===
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z`;

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
    expect(projectNumericField(record, ["ranges", "0"])).toBe(1);
    expect(projectNumericField(record, ["ranges", "1.5"])).toBeUndefined();
    expect(projectNumericField(record, ["ranges", "9"])).toBeUndefined();
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

  it("decodes each channel of a shared topic with its own schema", async () => {
    const channelOne = createChannel({
      id: 1,
      messageEncoding: "json",
      schemaId: 0,
      topic: "/shared",
    });
    const channelTwo = createChannel({
      id: 2,
      messageEncoding: "protobuf",
      schemaId: 3,
      topic: "/shared",
    });
    const base = createReader({
      messages: [
        createMessage(new TextEncoder().encode('{"jsonValue":7}'), {
          channelId: 1,
          logTime: 1_000_000_000n,
        }),
        createMessage(
          TELEMETRY_TYPE.encode(TELEMETRY_TYPE.create({ speed: 9 })).finish(),
          { channelId: 2, logTime: 2_000_000_000n },
        ),
      ],
    });
    const reader = {
      ...base,
      channelsById: new Map([
        [1, channelOne],
        [2, channelTwo],
      ]),
    };

    const result = await readMcapNumericSeries({
      reader,
      request: {
        fieldPaths: ["jsonValue", "speed"],
        source: createSource(),
        topic: "/shared",
      },
      timeline,
    });

    expect(result.messageCount).toBe(2);
    expect([...result.fields[0].values]).toEqual([7, Number.NaN]);
    expect([...result.fields[1].values]).toEqual([Number.NaN, 9]);
  });

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

  it("decodes each message once when extracting multiple fields", async () => {
    const parse = vi.spyOn(JSON, "parse");
    const reader = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
      messages: [
        jsonMessage({ battery: 90, armed: false }, 1_000_000_000n),
        jsonMessage({ battery: 88, armed: true }, 2_000_000_000n),
      ],
    });

    try {
      await readMcapNumericSeries({
        reader,
        request: {
          fieldPaths: ["battery", "armed"],
          source: createSource(),
          topic: "/state",
        },
        timeline,
      });

      expect(parse).toHaveBeenCalledTimes(2);
    } finally {
      parse.mockRestore();
    }
  });

  it("extracts from ros1 messages", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "ros1", topic: "/telemetry" }),
      messages: [
        createMessage(
          ros1TelemetryMessage({
            armed: true,
            linear: { x: 10, y: 0, z: 0 },
            speed: 1,
          }),
          { logTime: 1_000_000_000n },
        ),
        createMessage(
          ros1TelemetryMessage({
            armed: false,
            linear: { x: 20, y: 0, z: 0 },
            speed: 2,
          }),
          { logTime: 2_000_000_000n },
        ),
      ],
      schema: createSchema(new TextEncoder().encode(ROS_TELEMETRY_SCHEMA), {
        encoding: "ros1msg",
        name: "test_msgs/Telemetry",
      }),
    });

    const result = await readMcapNumericSeries({
      reader,
      request: {
        fieldPaths: ["speed", "armed", "linear.x"],
        source: createSource(),
        topic: "/telemetry",
      },
      timeline,
    });

    expect([...result.fields[0].values]).toEqual([1, 2]);
    expect([...result.fields[1].values]).toEqual([1, 0]);
    expect([...result.fields[2].values]).toEqual([10, 20]);
  });

  it("extracts from ros2 cdr messages", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "cdr", topic: "/telemetry" }),
      messages: [
        createMessage(
          ros2TelemetryMessage({
            armed: true,
            linear: { x: 3, y: 0, z: 0 },
            speed: 3.5,
          }),
          { logTime: 1_000_000_000n },
        ),
        createMessage(
          ros2TelemetryMessage({
            armed: false,
            linear: { x: 4, y: 0, z: 0 },
            speed: 4.5,
          }),
          { logTime: 2_000_000_000n },
        ),
      ],
      schema: createSchema(new TextEncoder().encode(ROS_TELEMETRY_SCHEMA), {
        encoding: "ros2msg",
        name: "test_msgs/msg/Telemetry",
      }),
    });

    const result = await readMcapNumericSeries({
      reader,
      request: {
        fieldPaths: ["speed", "armed", "linear.x"],
        source: createSource(),
        topic: "/telemetry",
      },
      timeline,
    });

    expect([...result.fields[0].values]).toEqual([3.5, 4.5]);
    expect([...result.fields[1].values]).toEqual([1, 0]);
    expect([...result.fields[2].values]).toEqual([3, 4]);
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

  it("keeps NaN gap points for undecodable ROS messages", async () => {
    const reader = createReader({
      channel: createChannel({ messageEncoding: "ros1", topic: "/telemetry" }),
      messages: [
        createMessage(
          ros1TelemetryMessage({ linear: { x: 0, y: 0, z: 0 }, speed: 90 }),
          {
            logTime: 1_000_000_000n,
          },
        ),
        createMessage(new Uint8Array([1, 2, 3]), {
          logTime: 2_000_000_000n,
        }),
        createMessage(
          ros1TelemetryMessage({ linear: { x: 0, y: 0, z: 0 }, speed: 70 }),
          {
            logTime: 3_000_000_000n,
          },
        ),
      ],
      schema: createSchema(new TextEncoder().encode(ROS_TELEMETRY_SCHEMA), {
        encoding: "ros1msg",
        name: "test_msgs/Telemetry",
      }),
    });

    const result = await readMcapNumericSeries({
      reader,
      request: {
        fieldPaths: ["speed"],
        source: createSource(),
        topic: "/telemetry",
      },
      timeline,
    });

    expect(result.messageCount).toBe(3);
    expect(result.fields[0].values[0]).toBe(90);
    expect(Number.isNaN(result.fields[0].values[1])).toBe(true);
    expect(result.fields[0].values[2]).toBe(70);
  });

  it("checks cancellation incrementally during a legacy topic scan", async () => {
    const controller = new AbortController();
    const messages = Array.from({ length: 100 }, (_, index) =>
      jsonMessage({ value: index }, BigInt(index + 1) * 1_000_000_000n),
    );
    const base = createReader({
      channel: createChannel({ messageEncoding: "json", topic: "/state" }),
    });
    const reader = {
      ...base,
      readMessages: vi.fn(async function* () {
        for await (const [index, message] of asyncValues(messages.entries())) {
          if (index === 64) controller.abort();
          yield message;
        }
      }),
    };

    await expect(
      readMcapNumericSeries({
        reader,
        request: {
          fieldPaths: ["value"],
          source: createSource(),
          topic: "/state",
        },
        signal: controller.signal,
        timeline,
      }),
    ).rejects.toMatchObject({
      message: "MCAP numeric series read aborted",
      name: "AbortError",
    });
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

describe("readMcapNumericSeriesSlice", () => {
  const timeline = resolveMcapTimelineStrategy(undefined);
  const budget: ReadWorkBudget = {
    maxMessages: 100,
    maxSourceBytes: 1_000_000,
    maxUncompressedBytes: 1_000_000,
    maxWallTimeMs: 1_000,
  };

  it("shares the viewport point budget across continuation coverage", () => {
    const minute = 60_000_000_000n;
    const firstSecond = [{ endNs: 999_999_999n, startNs: 0n }];
    const fullMinute = [{ endNs: minute - 1n, startNs: 0n }];

    expect(
      numericSeriesSlicePointBudget(4_000, firstSecond, 0n, minute - 1n),
    ).toBeLessThanOrEqual(72);
    expect(
      numericSeriesSlicePointBudget(4_000, fullMinute, 0n, minute - 1n),
    ).toBeLessThanOrEqual(4_000);
    expect(
      numericSeriesSlicePointBudget(4_000, fullMinute, 0n, minute - 1n),
    ).toBeGreaterThan(3_900);
    expect(numericSeriesSlicePointBudget(4, firstSecond, 0n, minute - 1n)).toBe(
      4,
    );
  });

  it("escalates a zero-coverage fallback scan to one atomic source unit", async () => {
    const continuation = {} as McapReadContinuation;
    const base = createReader({ messages: [] });
    const readBoundedMessages = vi
      .fn<NonNullable<McapIndexedReaderLike["readBoundedMessages"]>>()
      .mockResolvedValueOnce({
        continuation,
        coverageByTopic: new Map(),
        messages: [],
        stopReason: "budget-exhausted",
        usage: createUsage({ chunksOpened: 1, messagesDecoded: 50_000 }),
      })
      .mockResolvedValueOnce({
        coverageByTopic: new Map([
          ["/telemetry", [{ endNs: 2n, startNs: 1n }]],
        ]),
        messages: [],
        stopReason: "source-exhausted",
        usage: createUsage({ chunksOpened: 1 }),
      });
    const reader = { ...base, readBoundedMessages };

    const result = await readMcapNumericSeriesSlice({
      reader,
      request: {
        absoluteBudget: { ...budget, maxMessages: 250_000 },
        absoluteMaxChunks: 4,
        budget,
        endTimeNs: 2n,
        maxChunks: 1,
        selections: [{ fieldPaths: ["speed"], topic: "/telemetry" }],
        source: createSource(),
        startTimeNs: 1n,
      },
      timeline,
    });

    expect(readBoundedMessages).toHaveBeenCalledTimes(2);
    const escalatedBudget: ReadWorkBudget = {
      ...budget,
      maxMessages: 250_000,
    };
    expect(readBoundedMessages.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        budget: escalatedBudget,
        continuation: undefined,
        maxChunks: 4,
        maxGroups: 1,
      }),
    );
    expect(result.coverageByTopic.get("/telemetry")).toEqual([
      { endNs: 2n, startNs: 1n },
    ]);
  });

  it("merges every channel of a shared topic into one series", async () => {
    const jsonChannel = createChannel({
      id: 1,
      messageEncoding: "json",
      schemaId: 0,
      topic: "/shared",
    });
    const protobufChannel = createChannel({
      id: 2,
      schemaId: 3,
      topic: "/shared",
    });
    const base = createReader({ messages: [] });
    const reader = {
      ...base,
      channelsById: new Map([
        [1, jsonChannel],
        [2, protobufChannel],
      ]),
      readBoundedMessages: vi.fn(() =>
        Promise.resolve({
          coverageByTopic: new Map([
            ["/shared", [{ endNs: 2_000_000_000n, startNs: 1_000_000_000n }]],
          ]),
          messages: [
            createMessage(new TextEncoder().encode('{"jsonValue":7}'), {
              channelId: 1,
              logTime: 1_000_000_000n,
            }),
            createMessage(
              TELEMETRY_TYPE.encode(
                TELEMETRY_TYPE.create({ speed: 9 }),
              ).finish(),
              { channelId: 2, logTime: 2_000_000_000n },
            ),
          ],
          stopReason: "source-exhausted" as const,
          usage: createUsage({ chunksOpened: 1, messagesDecoded: 2 }),
        }),
      ),
    };

    const result = await readMcapNumericSeriesSlice({
      reader,
      request: {
        absoluteBudget: budget,
        absoluteMaxChunks: 4,
        budget,
        endTimeNs: 2_000_000_000n,
        maxChunks: 2,
        selections: [{ fieldPaths: ["jsonValue", "speed"], topic: "/shared" }],
        source: createSource(),
        startTimeNs: 1_000_000_000n,
      },
      timeline,
    });

    expect(result.series).toHaveLength(1);
    expect(result.series[0].messageCount).toBe(2);
    expect([...result.series[0].fields[0].values]).toEqual([7, Number.NaN]);
    expect([...result.series[0].fields[1].values]).toEqual([Number.NaN, 9]);
  });

  it("projects multiple topics from one bounded traversal", async () => {
    const stateChannel = createChannel({
      id: 1,
      messageEncoding: "json",
      schemaId: 0,
      topic: "/state",
    });
    const poseChannel = createChannel({
      id: 2,
      messageEncoding: "json",
      schemaId: 0,
      topic: "/pose",
    });
    const readBoundedMessages = vi.fn(() =>
      Promise.resolve({
        coverageByTopic: new Map([
          ["/state", [{ endNs: 2_000_000_000n, startNs: 1_000_000_000n }]],
          ["/pose", [{ endNs: 2_000_000_000n, startNs: 1_000_000_000n }]],
        ]),
        messages: [
          createMessage(
            new TextEncoder().encode(JSON.stringify({ speed: 3, armed: true })),
            { channelId: 1, logTime: 1_000_000_000n },
          ),
          createMessage(new TextEncoder().encode(JSON.stringify({ x: 9 })), {
            channelId: 2,
            logTime: 2_000_000_000n,
          }),
        ],
        stopReason: "source-exhausted" as const,
        usage: createUsage({ chunksOpened: 1, messagesDecoded: 2 }),
      }),
    );
    const base = createReader({
      channel: stateChannel,
      messages: [],
      schema: createSchema(new Uint8Array(), { id: 0 }),
    });
    const reader = {
      ...base,
      channelsById: new Map([
        [stateChannel.id, stateChannel],
        [poseChannel.id, poseChannel],
      ]),
      readBoundedMessages,
    };
    const controller = new AbortController();

    const result = await readMcapNumericSeriesSlice({
      reader,
      request: {
        absoluteBudget: budget,
        absoluteMaxChunks: 4,
        budget,
        endTimeNs: 2_000_000_000n,
        maxChunks: 2,
        preferredTimeNs: 1_500_000_000n,
        selections: [
          { fieldPaths: ["speed", "armed"], topic: "/state" },
          { fieldPaths: ["x"], topic: "/pose" },
        ],
        source: createSource(),
        startTimeNs: 1_000_000_000n,
      },
      signal: controller.signal,
      timeline,
    });

    expect(readBoundedMessages).toHaveBeenCalledOnce();
    expect(readBoundedMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredTimeNs: 1_500_000_000n,
        signal: controller.signal,
        topics: ["/state", "/pose"],
      }),
    );
    expect(result.series.map((series) => series.topic)).toEqual([
      "/state",
      "/pose",
    ]);
    expect([...result.series[0].fields[0].values]).toEqual([3]);
    expect([...result.series[0].fields[1].values]).toEqual([1]);
    expect([...result.series[1].fields[0].values]).toEqual([9]);
    expect(result.usage.messagesDecoded).toBe(2);
  });

  it("escalates exactly one indivisible group after a zero-progress grant", async () => {
    const continuation = {
      endTimeNs: 2_000_000_000n,
      nextChunkStartOffset: 1_000n,
      preferredTimeNs: 1_500_000_000n,
      sourceKey: "test",
      startTimeNs: 1_000_000_000n,
      topicsKey: "/state",
      version: 1 as const,
    };
    const readBoundedMessages = vi
      .fn()
      .mockResolvedValueOnce({
        continuation,
        coverageByTopic: new Map(),
        messages: [],
        stopReason: "budget-exhausted",
        usage: createUsage(),
      })
      .mockResolvedValueOnce({
        coverageByTopic: new Map([
          ["/state", [{ endNs: 2_000_000_000n, startNs: 1_000_000_000n }]],
        ]),
        messages: [jsonMessage({ v: 7 }, 1_500_000_000n)],
        stopReason: "source-exhausted",
        usage: createUsage({ chunksOpened: 2, messagesDecoded: 1 }),
      });
    const reader = {
      ...createReader({
        channel: createChannel({
          messageEncoding: "json",
          topic: "/state",
        }),
      }),
      readBoundedMessages,
    };
    const absoluteBudget = {
      ...budget,
      maxSourceBytes: 2_000_000,
      maxUncompressedBytes: 2_000_000,
    };

    const result = await readMcapNumericSeriesSlice({
      reader,
      request: {
        absoluteBudget,
        absoluteMaxChunks: 4,
        budget,
        endTimeNs: 2_000_000_000n,
        maxChunks: 1,
        preferredTimeNs: 1_500_000_000n,
        selections: [{ fieldPaths: ["v"], topic: "/state" }],
        source: createSource(),
        startTimeNs: 1_000_000_000n,
      },
      timeline,
    });

    expect(readBoundedMessages).toHaveBeenCalledTimes(2);
    expect(readBoundedMessages.mock.calls[1][0]).toMatchObject({
      budget: absoluteBudget,
      maxChunks: 4,
      maxGroups: 1,
    });
    expect([...result.series[0].fields[0].values]).toEqual([7]);
    expect(result.usage.chunksOpened).toBe(2);
  });
});

function telemetryMessage(
  record: Record<string, unknown>,
  logTime: bigint,
): McapMessage {
  return createMessage(
    TELEMETRY_TYPE.encode(TELEMETRY_TYPE.create(record)).finish(),
    { logTime },
  );
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

function jsonMessage(
  record: Record<string, unknown>,
  logTime: bigint,
): McapMessage {
  return createMessage(new TextEncoder().encode(JSON.stringify(record)), {
    logTime,
  });
}

function createReader({
  channel = createChannel({ messageEncoding: "protobuf", topic: "/telemetry" }),
  messages = [],
  schema = createSchema(TELEMETRY_SCHEMA_DATA),
  statistics,
}: {
  readonly channel?: McapChannel;
  readonly messages?: readonly McapMessage[];
  readonly schema?: McapSchema;
  readonly statistics?: McapStatistics;
}) {
  return {
    channelsById: new Map([[channel.id, channel]]),
    chunkIndexes: [createChunkIndex()],
    readMessages: vi.fn(() => asyncValues(messages)),
    schemasById: new Map([[schema.id, schema]]),
    statistics,
  };
}

function createChannel(options: Partial<McapChannel> = {}): McapChannel {
  return {
    id: options.id ?? 1,
    messageEncoding: options.messageEncoding ?? "protobuf",
    metadata: options.metadata ?? new Map<string, string>(),
    schemaId: options.schemaId ?? 3,
    topic: options.topic ?? "/telemetry",
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
    name: options.name ?? "test.Telemetry",
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
    logTime: options.logTime ?? 1_000_000_000n,
    publishTime: options.publishTime ?? 1_000_000_000n,
    sequence: options.sequence ?? 0,
    type: "Message",
  };
}

function createChunkIndex(): McapChunkIndex {
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
    uncompressedSize: 0n,
  };
}

function createStatistics(
  options: Partial<McapStatistics> = {},
): McapStatistics {
  return {
    attachmentCount: 0,
    channelCount: 1,
    channelMessageCounts:
      options.channelMessageCounts ?? new Map<number, bigint>(),
    chunkCount: 1,
    messageCount: 0n,
    messageEndTime: 0n,
    messageStartTime: 0n,
    metadataCount: 0,
    schemaCount: 1,
    type: "Statistics",
  };
}

function createUsage(overrides: Partial<ReadWorkUsage> = {}): ReadWorkUsage {
  return {
    chunksOpened: 0,
    decompressedBytes: 0,
    decompressionCacheHits: 0,
    elapsedMs: 0,
    logicalSourceBytes: 0,
    logicalUncompressedBytes: 0,
    messagesDecoded: 0,
    transferredBytes: 0,
    ...overrides,
  };
}

function createSource() {
  return { sourceId: "test", url: "memory://test.mcap" };
}
