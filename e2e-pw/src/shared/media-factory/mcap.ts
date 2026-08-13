/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { McapWriter, type IWritable } from "@mcap/core";
import { promises as fs } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";

const TEXT_ENCODER = new TextEncoder();
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const EPOCH_START_NS = 1_704_067_200_000_000_000n;
const ABSOLUTE_TIMELINE_METADATA = { timeline_mode: "absolute" } as const;

export const MAX_LONG_MCAP_SIZE_BYTES = 10 * 1024 * 1024;

/** Stable values shared by the fixture generator and correctness spec. */
export const MCAP_FIXTURE_CONTRACT = {
  tinyA: {
    fileName: "tiny-episode-a.mcap",
    imageRgb: [
      [231, 76, 60],
      [46, 204, 113],
      [52, 152, 219],
    ],
    kind: "tiny-episode-a",
    poseX: [0, 10, 20],
  },
  tinyB: {
    fileName: "tiny-episode-b.mcap",
    kind: "tiny-episode-b",
    rearImageRgb: [
      [155, 89, 182],
      [243, 156, 18],
      [26, 188, 156],
      [232, 67, 147],
    ],
    sideImageRgb: [
      [52, 73, 94],
      [211, 84, 0],
      [22, 160, 133],
      [142, 68, 173],
    ],
    statusCodes: [200, 201, 202, 203],
  },
  long: {
    cameraPhaseSeconds: 900,
    cameraPhaseRgb: [
      [23, 63, 95],
      [32, 99, 155],
      [60, 174, 163],
      [246, 213, 92],
    ],
    diagnosticIntervalSeconds: 60,
    durationSeconds: 3_600,
    fileName: "long-mixed-episode.mcap",
    kind: "long-mixed-episode",
    lidarGapFirstSecond: 1_790,
    lidarGapLastSecond: 1_810,
    lidarIntervalSeconds: 2,
    logBeforeMidpointSecond: 1_600,
    midpointSecond: 1_800,
    rearFirstSecond: 600,
    rearIntervalSeconds: 2,
    rearLastSecond: 3_000,
    statusIntervalSeconds: 5,
  },
  unsupported: {
    fileName: "unsupported.mcap",
    kind: "unsupported",
  },
} as const;

const LONG_DURATION_SECONDS = MCAP_FIXTURE_CONTRACT.long.durationSeconds;
const LONG_REAR_FIRST_SECOND = MCAP_FIXTURE_CONTRACT.long.rearFirstSecond;
const LONG_REAR_LAST_SECOND = MCAP_FIXTURE_CONTRACT.long.rearLastSecond;
const LONG_REAR_INTERVAL_SECONDS =
  MCAP_FIXTURE_CONTRACT.long.rearIntervalSeconds;

export type McapFixtureKind =
  (typeof MCAP_FIXTURE_CONTRACT)[keyof typeof MCAP_FIXTURE_CONTRACT]["kind"];

export interface McapFixtureReport {
  readonly kind: McapFixtureKind;
  readonly messageCounts: Readonly<Record<string, number>>;
  readonly outputPath: string;
  readonly payloadBytes: Readonly<Record<string, number>>;
  readonly sizeBytes: number;
}

interface ChannelSpec {
  readonly messageEncoding?: "json" | "protobuf";
  readonly metadata?: Readonly<Record<string, string>>;
  readonly schemaData?: Uint8Array;
  readonly schemaEncoding?: "jsonschema" | "protobuf";
  readonly schemaName: string;
  readonly topic: string;
}

interface FixtureMessage {
  readonly channelIndex: number;
  readonly data: Uint8Array;
  readonly logTime: bigint;
  readonly order: number;
}

interface FixtureDefinition {
  readonly channels: readonly ChannelSpec[];
  readonly messages: readonly FixtureMessage[];
}

/** Writes one deterministic, indexed, uncompressed MCAP correctness fixture. */
export async function createMcapFixture({
  kind,
  outputPath,
}: {
  readonly kind: McapFixtureKind;
  readonly outputPath: string;
}): Promise<McapFixtureReport> {
  const definition = fixtureDefinition(kind);
  const target = new MemoryWritable();
  const writer = new McapWriter({
    chunkSize: 1024 * 1024,
    useChunkIndex: true,
    useChunks: true,
    useMessageIndex: true,
    useStatistics: true,
    useSummaryOffsets: true,
    writable: target,
  });
  await writer.start({ library: "fiftyone-e2e-pw", profile: "" });

  const channelIds: number[] = [];
  for (const channel of definition.channels) {
    const schemaId = await writer.registerSchema({
      data: channel.schemaData ?? jsonSchemaData(channel.schemaName),
      encoding: channel.schemaEncoding ?? "jsonschema",
      name: channel.schemaName,
    });
    channelIds.push(
      await writer.registerChannel({
        messageEncoding: channel.messageEncoding ?? "json",
        metadata: new Map(Object.entries(channel.metadata ?? {})),
        schemaId,
        topic: channel.topic,
      }),
    );
  }

  const messageCounts: Record<string, number> = {};
  const payloadBytes: Record<string, number> = {};
  const sequences = new Array(definition.channels.length).fill(0);
  for (const message of [...definition.messages].sort(compareMessages)) {
    const channel = definition.channels[message.channelIndex];
    const sequence = sequences[message.channelIndex]++;
    await writer.addMessage({
      channelId: channelIds[message.channelIndex],
      data: message.data,
      logTime: message.logTime,
      publishTime: message.logTime,
      sequence,
    });
    messageCounts[channel.topic] = (messageCounts[channel.topic] ?? 0) + 1;
    payloadBytes[channel.topic] =
      (payloadBytes[channel.topic] ?? 0) + message.data.byteLength;
  }
  await writer.end();

  const bytes = target.get();
  if (
    kind === "long-mixed-episode" &&
    bytes.byteLength > MAX_LONG_MCAP_SIZE_BYTES
  ) {
    throw new Error(
      "long-mixed-episode.mcap is " +
        bytes.byteLength.toLocaleString() +
        " bytes, exceeding the 10 MiB correctness-fixture guard; payload bytes by channel: " +
        JSON.stringify(payloadBytes),
    );
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
  return {
    kind,
    messageCounts,
    outputPath,
    payloadBytes,
    sizeBytes: bytes.byteLength,
  };
}

function fixtureDefinition(kind: McapFixtureKind): FixtureDefinition {
  switch (kind) {
    case "tiny-episode-a":
      return tinyEpisodeA();
    case "tiny-episode-b":
      return tinyEpisodeB();
    case "unsupported":
      return unsupportedEpisode();
    case "long-mixed-episode":
      return longMixedEpisode();
  }
}

function tinyEpisodeA(): FixtureDefinition {
  const channels: ChannelSpec[] = [
    jsonChannel(
      "/camera/front",
      "sensor_msgs/msg/CompressedImage",
      ABSOLUTE_TIMELINE_METADATA,
    ),
    jsonChannel(
      "/points",
      "sensor_msgs/msg/PointCloud2",
      ABSOLUTE_TIMELINE_METADATA,
    ),
    jsonChannel("/log", "rosgraph_msgs/Log", ABSOLUTE_TIMELINE_METADATA),
    jsonChannel("/pose", "Pose", ABSOLUTE_TIMELINE_METADATA),
  ];
  const messages: FixtureMessage[] = [];
  for (let tick = 0; tick < 3; tick++) {
    const timeNs = EPOCH_START_NS + BigInt(tick) * NANOSECONDS_PER_SECOND;
    messages.push(
      jsonMessage(
        0,
        timeNs,
        compressedImageMessage({
          frameId: "camera_front",
          png: labeledPng(160, 90, A_COLORS[tick], "A" + tick),
          timeNs,
        }),
      ),
      jsonMessage(1, timeNs, pointCloudMessage(timeNs, "lidar", aPoints(tick))),
      jsonMessage(2, timeNs, rosgraphLogMessage(timeNs, "A log " + tick)),
      jsonMessage(3, timeNs, {
        acceleration: { x: tick, y: tick + 0.25, z: 0 },
        orientation: { w: 1, x: 0, y: 0, z: 0 },
        position: {
          x: MCAP_FIXTURE_CONTRACT.tinyA.poseX[tick],
          y: tick + 1,
          z: tick + 2,
        },
        velocity: { x: tick + 1, y: 0, z: 0 },
      }),
    );
  }
  return { channels, messages };
}

function tinyEpisodeB(): FixtureDefinition {
  const channels: ChannelSpec[] = [
    jsonChannel("/camera/rear", "sensor_msgs/msg/CompressedImage"),
    jsonChannel("/camera/side", "sensor_msgs/msg/CompressedImage"),
    jsonChannel("/scan/rear", "sensor_msgs/msg/LaserScan"),
    jsonChannel("/status", "fiftyone.e2e.Status"),
  ];
  const messages: FixtureMessage[] = [];
  for (let tick = 0; tick < 4; tick++) {
    const timeNs = BigInt(tick) * 500_000_000n;
    messages.push(
      jsonMessage(
        0,
        timeNs,
        compressedImageMessage({
          frameId: "camera_rear",
          png: labeledPng(180, 90, B_REAR_COLORS[tick], "BR" + tick),
          timeNs,
        }),
      ),
      jsonMessage(
        1,
        timeNs,
        compressedImageMessage({
          frameId: "camera_side",
          png: labeledPng(90, 180, B_SIDE_COLORS[tick], "BS" + tick),
          timeNs,
        }),
      ),
      jsonMessage(2, timeNs, laserScanMessage(timeNs, "rear_laser", tick)),
      jsonMessage(3, timeNs, {
        mode: tick < 2 ? "warming" : "ready",
        status_code: MCAP_FIXTURE_CONTRACT.tinyB.statusCodes[tick],
        tick,
        vehicle: { gear: tick % 2 === 0 ? "drive" : "reverse" },
      }),
    );
  }
  return { channels, messages };
}

function unsupportedEpisode(): FixtureDefinition {
  return {
    channels: [jsonChannel("/unsupported", "fiftyone.e2e.Unsupported")],
    messages: [
      jsonMessage(0, 0n, {
        note: "valid JSON with no previewable decoder",
        value: 17,
      }),
    ],
  };
}

function longMixedEpisode(): FixtureDefinition {
  const channels: ChannelSpec[] = [
    jsonChannel(
      "/camera/front",
      "sensor_msgs/msg/CompressedImage",
      ABSOLUTE_TIMELINE_METADATA,
    ),
    jsonChannel(
      "/camera/rear",
      "sensor_msgs/msg/CompressedImage",
      ABSOLUTE_TIMELINE_METADATA,
    ),
    jsonChannel(
      "/lidar/points",
      "sensor_msgs/msg/PointCloud2",
      ABSOLUTE_TIMELINE_METADATA,
    ),
    jsonChannel(
      "/scan/rear",
      "sensor_msgs/msg/LaserScan",
      ABSOLUTE_TIMELINE_METADATA,
    ),
    jsonChannel(
      "/odometry",
      "nav_msgs/msg/Odometry",
      ABSOLUTE_TIMELINE_METADATA,
    ),
    jsonChannel(
      "/camera/front/detections",
      "vision_msgs/msg/Detection2DArray",
      ABSOLUTE_TIMELINE_METADATA,
    ),
    {
      messageEncoding: "protobuf",
      metadata: ABSOLUTE_TIMELINE_METADATA,
      schemaData: FRAME_TRANSFORM_SCHEMA_DATA,
      schemaEncoding: "protobuf",
      schemaName: "foxglove.FrameTransform",
      topic: "/tf",
    },
    {
      messageEncoding: "protobuf",
      metadata: ABSOLUTE_TIMELINE_METADATA,
      schemaData: FRAME_TRANSFORM_SCHEMA_DATA,
      schemaEncoding: "protobuf",
      schemaName: "foxglove.FrameTransform",
      topic: "/tf_static",
    },
    jsonChannel("/status", "fiftyone.e2e.Status", ABSOLUTE_TIMELINE_METADATA),
    jsonChannel("/rosout", "rosgraph_msgs/Log", ABSOLUTE_TIMELINE_METADATA),
    jsonChannel(
      "/diagnostics",
      "diagnostic_msgs/msg/DiagnosticArray",
      ABSOLUTE_TIMELINE_METADATA,
    ),
  ];
  const messages: FixtureMessage[] = [];

  for (let frame = 0; frame < 7_200; frame++) {
    const offsetNs = BigInt(frame) * 500_000_000n;
    const timeNs = EPOCH_START_NS + offsetNs;
    messages.push(
      jsonMessage(
        0,
        timeNs,
        compressedImageMessage({
          frameId: "camera_front",
          png: longCameraPng(frame, "front"),
          timeNs,
        }),
      ),
    );
  }

  for (
    let second = LONG_REAR_FIRST_SECOND;
    second <= LONG_REAR_LAST_SECOND;
    second += LONG_REAR_INTERVAL_SECONDS
  ) {
    const timeNs = epochSecond(second);
    messages.push(
      jsonMessage(
        1,
        timeNs,
        compressedImageMessage({
          frameId: "camera_rear",
          png: longCameraPng(second * 2, "rear"),
          timeNs,
        }),
      ),
    );
  }

  for (
    let second = 0;
    second < LONG_DURATION_SECONDS;
    second += MCAP_FIXTURE_CONTRACT.long.lidarIntervalSeconds
  ) {
    if (
      second >= MCAP_FIXTURE_CONTRACT.long.lidarGapFirstSecond &&
      second <= MCAP_FIXTURE_CONTRACT.long.lidarGapLastSecond
    ) {
      continue;
    }
    const timeNs = epochSecond(second);
    messages.push(
      jsonMessage(
        2,
        timeNs,
        pointCloudMessage(timeNs, "lidar", longPoints(second)),
      ),
    );
  }

  for (let second = 0; second < LONG_DURATION_SECONDS; second += 10) {
    const timeNs = epochSecond(second);
    messages.push(
      jsonMessage(
        3,
        timeNs,
        laserScanMessage(timeNs, "rear_laser", second / 10),
      ),
    );
  }

  for (let second = 0; second < LONG_DURATION_SECONDS; second++) {
    const timeNs = epochSecond(second);
    messages.push(
      jsonMessage(4, timeNs, odometryMessage(timeNs, second)),
      protobufMessage(6, timeNs, frameTransformMessage(timeNs, second)),
    );
  }
  messages.push(
    protobufMessage(
      7,
      EPOCH_START_NS,
      frameTransformMessage(EPOCH_START_NS, 0, true),
    ),
  );

  for (let second = 0; second < LONG_DURATION_SECONDS; second += 2) {
    const timeNs = epochSecond(second);
    messages.push(jsonMessage(5, timeNs, detectionMessage(timeNs, second)));
  }

  for (
    let second = 0;
    second < LONG_DURATION_SECONDS;
    second += MCAP_FIXTURE_CONTRACT.long.statusIntervalSeconds
  ) {
    messages.push(jsonMessage(8, epochSecond(second), statusMessage(second)));
  }
  messages.push(
    jsonMessage(
      8,
      epochSecond(LONG_DURATION_SECONDS),
      statusMessage(LONG_DURATION_SECONDS, true),
    ),
  );

  for (const { message, second } of LONG_LOG_ANCHORS) {
    messages.push(
      jsonMessage(
        9,
        epochSecond(second),
        rosgraphLogMessage(epochSecond(second), message),
      ),
    );
  }

  for (
    let second = 0;
    second < LONG_DURATION_SECONDS;
    second += MCAP_FIXTURE_CONTRACT.long.diagnosticIntervalSeconds
  ) {
    const timeNs = epochSecond(second);
    messages.push(jsonMessage(10, timeNs, diagnosticMessage(timeNs, second)));
  }

  return { channels, messages };
}

const LONG_LOG_ANCHORS = [
  { message: "LONG recording start", second: 0 },
  { message: "LONG phase 200", second: 200 },
  { message: "LONG phase 400", second: 400 },
  { message: "LONG rear camera available", second: 600 },
  { message: "LONG phase 800", second: 800 },
  { message: "LONG quarter-hour phase", second: 1_000 },
  { message: "LONG phase 1200", second: 1_200 },
  { message: "LONG phase 1400", second: 1_400 },
  {
    message: "LONG pre-midpoint nominal",
    second: MCAP_FIXTURE_CONTRACT.long.logBeforeMidpointSecond,
  },
  {
    message: "LONG midpoint warning",
    second: MCAP_FIXTURE_CONTRACT.long.midpointSecond,
  },
  { message: "LONG warning sustained", second: 2_000 },
  { message: "LONG phase 2200", second: 2_200 },
  { message: "LONG transform phase", second: 2_400 },
  { message: "LONG phase 2600", second: 2_600 },
  { message: "LONG phase 2800", second: 2_800 },
  { message: "LONG rear camera final frame", second: 3_000 },
  { message: "LONG phase 3200", second: 3_200 },
  { message: "LONG phase 3400", second: 3_400 },
  {
    message: "LONG terminal 01:00:00",
    second: MCAP_FIXTURE_CONTRACT.long.durationSeconds,
  },
] as const;

function jsonChannel(
  topic: string,
  schemaName: string,
  metadata?: Readonly<Record<string, string>>,
): ChannelSpec {
  return { metadata, schemaName, topic };
}

function jsonMessage(
  channelIndex: number,
  logTime: bigint,
  value: Record<string, unknown>,
): FixtureMessage {
  return {
    channelIndex,
    data: TEXT_ENCODER.encode(JSON.stringify(value)),
    logTime,
    order: channelIndex,
  };
}

function protobufMessage(
  channelIndex: number,
  logTime: bigint,
  data: Uint8Array,
): FixtureMessage {
  return { channelIndex, data, logTime, order: channelIndex };
}

function compareMessages(left: FixtureMessage, right: FixtureMessage): number {
  if (left.logTime !== right.logTime)
    return left.logTime < right.logTime ? -1 : 1;
  return left.order - right.order;
}

function epochSecond(second: number): bigint {
  return EPOCH_START_NS + BigInt(second) * NANOSECONDS_PER_SECOND;
}

function rosTime(timeNs: bigint): { sec: number; nanosec: number } {
  return {
    nanosec: Number(timeNs % NANOSECONDS_PER_SECOND),
    sec: Number(timeNs / NANOSECONDS_PER_SECOND),
  };
}

function header(timeNs: bigint, frameId: string) {
  return { frame_id: frameId, stamp: rosTime(timeNs) };
}

function compressedImageMessage({
  frameId,
  png,
  timeNs,
}: {
  readonly frameId: string;
  readonly png: Uint8Array;
  readonly timeNs: bigint;
}): Record<string, unknown> {
  return {
    data: Array.from(png),
    format: "png",
    header: header(timeNs, frameId),
  };
}

function pointCloudMessage(
  timeNs: bigint,
  frameId: string,
  points: readonly (readonly [number, number, number])[],
): Record<string, unknown> {
  const bytes = new Uint8Array(points.length * 12);
  const view = new DataView(bytes.buffer);
  points.forEach((point, index) => {
    view.setFloat32(index * 12, point[0], true);
    view.setFloat32(index * 12 + 4, point[1], true);
    view.setFloat32(index * 12 + 8, point[2], true);
  });
  return {
    data: Array.from(bytes),
    fields: [
      { count: 1, datatype: 7, name: "x", offset: 0 },
      { count: 1, datatype: 7, name: "y", offset: 4 },
      { count: 1, datatype: 7, name: "z", offset: 8 },
    ],
    header: header(timeNs, frameId),
    height: 1,
    is_bigendian: false,
    is_dense: true,
    point_step: 12,
    row_step: points.length * 12,
    width: points.length,
  };
}

function laserScanMessage(
  timeNs: bigint,
  frameId: string,
  tick: number,
): Record<string, unknown> {
  const ranges = Array.from({ length: 9 }, (_, index) =>
    Number((2 + index * 0.2 + (tick % 7) * 0.05).toFixed(3)),
  );
  return {
    angle_increment: Math.PI / 8,
    angle_max: Math.PI / 2,
    angle_min: -Math.PI / 2,
    header: header(timeNs, frameId),
    intensities: ranges.map((_, index) => index + (tick % 5)),
    range_max: 20,
    range_min: 0.1,
    ranges,
    scan_time: 0.1,
    time_increment: 0,
  };
}

function rosgraphLogMessage(
  timeNs: bigint,
  message: string,
): Record<string, unknown> {
  return {
    file: "mcap-fixture.ts",
    function: "fixture",
    header: header(timeNs, ""),
    level: message.includes("warning") ? 4 : 2,
    line: 1,
    msg: message,
    name: "/fiftyone/e2e",
    topics: ["/rosout"],
  };
}

function odometryMessage(
  timeNs: bigint,
  second: number,
): Record<string, unknown> {
  return {
    child_frame_id: "base_link",
    header: header(timeNs, "map"),
    pose: {
      covariance: new Array(36).fill(0),
      pose: {
        orientation: { w: 1, x: 0, y: 0, z: 0 },
        position: {
          x: Number((second / 10).toFixed(1)),
          y: second % 100,
          z: second >= 2_400 ? 2 : 1,
        },
      },
    },
    twist: {
      covariance: new Array(36).fill(0),
      twist: {
        angular: { x: 0, y: 0, z: second >= 2_400 ? -0.1 : 0.1 },
        linear: { x: 10 + (second % 5), y: 0, z: 0 },
      },
    },
  };
}

function detectionMessage(
  timeNs: bigint,
  second: number,
): Record<string, unknown> {
  const phase = Math.floor(second / 900);
  return {
    detections: [
      {
        bbox: {
          center: { position: { x: 8 + (second % 16), y: 9 }, theta: 0 },
          size_x: 8,
          size_y: 6,
        },
        id: "front-target-" + second,
        results: [
          {
            hypothesis: {
              class_id: ["vehicle", "pedestrian", "cyclist", "animal"][phase],
              score: 0.95,
            },
          },
        ],
      },
    ],
    header: header(timeNs, "camera_front"),
  };
}

function statusMessage(
  second: number,
  terminal = false,
): Record<string, unknown> {
  return {
    counter: second / MCAP_FIXTURE_CONTRACT.long.statusIntervalSeconds,
    phase: Math.min(
      3,
      Math.floor(second / MCAP_FIXTURE_CONTRACT.long.cameraPhaseSeconds),
    ),
    state: terminal
      ? "complete"
      : second >= MCAP_FIXTURE_CONTRACT.long.midpointSecond
        ? "active-warning"
        : "active",
    terminal,
  };
}

function diagnosticMessage(
  timeNs: bigint,
  second: number,
): Record<string, unknown> {
  const warning = second >= MCAP_FIXTURE_CONTRACT.long.midpointSecond;
  return {
    header: header(timeNs, "base_link"),
    status: [
      {
        hardware_id: "synthetic-ecu",
        level: warning ? 1 : 0,
        message: warning ? "midpoint warning" : "nominal",
        name: "fixture health",
        values: [
          { key: "minute", value: String(second / 60) },
          { key: "phase", value: warning ? "warning" : "ok" },
        ],
      },
    ],
  };
}

function aPoints(tick: number): readonly (readonly [number, number, number])[] {
  if (tick === 0)
    return [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ];
  if (tick === 1)
    return [
      [0, 0, 0],
      [1, 1, 0],
      [2, 2, 0],
      [3, 3, 0],
    ];
  return [
    [0, 0, 0],
    [1, 0, 1],
    [0, 1, 1],
    [-1, 0, 1],
    [0, -1, 1],
  ];
}

function longPoints(
  second: number,
): readonly (readonly [number, number, number])[] {
  return Array.from({ length: 12 }, (_, index) => {
    const angle = (index / 12) * Math.PI * 2;
    const radius = 2 + (second % 20) / 20;
    return [
      Number((Math.cos(angle) * radius).toFixed(4)),
      Number((Math.sin(angle) * radius).toFixed(4)),
      Number(((index % 3) + Math.floor(second / 900)).toFixed(4)),
    ] as const;
  });
}

const FRAME_TRANSFORM_ROOT = Root.fromJSON({
  nested: {
    foxglove: {
      nested: {
        FrameTransform: {
          fields: {
            childFrameId: { id: 3, type: "string" },
            parentFrameId: { id: 2, type: "string" },
            rotation: { id: 5, type: "Quaternion" },
            timestamp: { id: 1, type: "Timestamp" },
            translation: { id: 4, type: "Vector3" },
          },
        },
        Quaternion: {
          fields: {
            w: { id: 4, type: "double" },
            x: { id: 1, type: "double" },
            y: { id: 2, type: "double" },
            z: { id: 3, type: "double" },
          },
        },
        Timestamp: {
          fields: {
            nanos: { id: 2, type: "int32" },
            seconds: { id: 1, type: "int64" },
          },
        },
        Vector3: {
          fields: {
            x: { id: 1, type: "double" },
            y: { id: 2, type: "double" },
            z: { id: 3, type: "double" },
          },
        },
      },
    },
  },
});
const FRAME_TRANSFORM_TYPE = FRAME_TRANSFORM_ROOT.lookupType(
  "foxglove.FrameTransform",
);
const FRAME_TRANSFORM_SCHEMA_DATA = descriptor.FileDescriptorSet.encode(
  (
    FRAME_TRANSFORM_ROOT as unknown as {
      toDescriptor(
        version: string,
      ): Parameters<typeof descriptor.FileDescriptorSet.encode>[0];
    }
  ).toDescriptor("proto3"),
).finish();

function frameTransformMessage(
  timeNs: bigint,
  second: number,
  isStatic = false,
): Uint8Array {
  const stamp = rosTime(timeNs);
  const direction = second >= 2_400 ? -1 : 1;
  return FRAME_TRANSFORM_TYPE.encode({
    childFrameId: isStatic ? "camera_front" : "base_link",
    parentFrameId: isStatic ? "base_link" : "map",
    rotation: { w: 1, x: 0, y: 0, z: 0 },
    timestamp: { nanos: stamp.nanosec, seconds: stamp.sec },
    translation: isStatic
      ? { x: 1, y: 0, z: 1.5 }
      : { x: direction * second * 0.1, y: second % 50, z: 0 },
  }).finish();
}

const A_COLORS = MCAP_FIXTURE_CONTRACT.tinyA.imageRgb.map(rgbToRgba);
const B_REAR_COLORS = MCAP_FIXTURE_CONTRACT.tinyB.rearImageRgb.map(rgbToRgba);
const B_SIDE_COLORS = MCAP_FIXTURE_CONTRACT.tinyB.sideImageRgb.map(rgbToRgba);

function labeledPng(
  width: number,
  height: number,
  rgba: number,
  label: string,
): Uint8Array {
  const pixels = solidPixels(width, height, rgba);
  drawLabel(pixels, width, height, label);
  return encodePng(width, height, pixels);
}

function longCameraPng(frame: number, camera: "front" | "rear"): Uint8Array {
  const phase = Math.min(
    3,
    Math.floor(frame / (MCAP_FIXTURE_CONTRACT.long.cameraPhaseSeconds * 2)),
  );
  const colors = MCAP_FIXTURE_CONTRACT.long.cameraPhaseRgb.map(rgbToRgba);
  const width = 32;
  const height = 18;
  const pixels = solidPixels(width, height, colors[phase]);
  const cameraColor = camera === "front" ? 0xffffffff : 0xff1744ff;
  setPixel(pixels, width, 0, 0, cameraColor);
  for (let bit = 0; bit < 13; bit++) {
    setPixel(
      pixels,
      width,
      bit + 1,
      0,
      (frame & (1 << bit)) !== 0 ? 0xffffffff : 0x000000ff,
    );
  }
  const squareX = 2 + (frame % (width - 6));
  for (let y = 7; y < 11; y++) {
    for (let x = squareX; x < squareX + 4; x++) {
      setPixel(pixels, width, x, y, cameraColor);
    }
  }
  return encodePng(width, height, pixels);
}

function rgbToRgba(rgb: readonly [number, number, number]): number {
  const [red, green, blue] = rgb;
  return ((red << 24) | (green << 16) | (blue << 8) | 0xff) >>> 0;
}

function solidPixels(width: number, height: number, rgba: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const red = (rgba >>> 24) & 0xff;
  const green = (rgba >>> 16) & 0xff;
  const blue = (rgba >>> 8) & 0xff;
  const alpha = rgba & 0xff;
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = red;
    pixels[index + 1] = green;
    pixels[index + 2] = blue;
    pixels[index + 3] = alpha;
  }
  return pixels;
}

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  R: ["110", "101", "110", "101", "101"],
  S: ["111", "100", "111", "001", "111"],
};

function drawLabel(
  pixels: Uint8Array,
  width: number,
  height: number,
  label: string,
): void {
  const scale = Math.max(3, Math.floor(Math.min(width, height) / 18));
  const glyphWidth = 3 * scale;
  const totalWidth = label.length * glyphWidth + (label.length - 1) * scale;
  const startX = Math.floor((width - totalWidth) / 2);
  const startY = Math.floor((height - 5 * scale) / 2);
  [...label].forEach((character, characterIndex) => {
    const glyph = GLYPHS[character];
    if (!glyph) return;
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((bit, columnIndex) => {
        if (bit !== "1") return;
        for (let y = 0; y < scale; y++) {
          for (let x = 0; x < scale; x++) {
            setPixel(
              pixels,
              width,
              startX +
                characterIndex * (glyphWidth + scale) +
                columnIndex * scale +
                x,
              startY + rowIndex * scale + y,
              0xffffffff,
            );
          }
        }
      });
    });
  });
}

function setPixel(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  rgba: number,
): void {
  const index = (y * width + x) * 4;
  pixels[index] = (rgba >>> 24) & 0xff;
  pixels[index + 1] = (rgba >>> 16) & 0xff;
  pixels[index + 2] = (rgba >>> 8) & 0xff;
  pixels[index + 3] = rgba & 0xff;
}

function encodePng(
  width: number,
  height: number,
  pixels: Uint8Array,
): Uint8Array {
  const scanlines = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const targetOffset = y * (width * 4 + 1);
    scanlines[targetOffset] = 0;
    scanlines.set(
      pixels.subarray(y * width * 4, (y + 1) * width * 4),
      targetOffset + 1,
    );
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return concatBytes(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", new Uint8Array()),
  );
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = TEXT_ENCODER.encode(type);
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(concatBytes(typeBytes, data)));
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(...arrays: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    arrays.reduce((sum, array) => sum + array.byteLength, 0),
  );
  let offset = 0;
  for (const array of arrays) {
    output.set(array, offset);
    offset += array.byteLength;
  }
  return output;
}

function jsonSchemaData(title: string): Uint8Array {
  return TEXT_ENCODER.encode(
    JSON.stringify({ additionalProperties: true, title, type: "object" }),
  );
}

class MemoryWritable implements IWritable {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  position(): bigint {
    return BigInt(this.length);
  }

  async write(data: Uint8Array): Promise<void> {
    this.chunks.push(data.slice());
    this.length += data.byteLength;
  }

  get(): Uint8Array {
    const output = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }
}
