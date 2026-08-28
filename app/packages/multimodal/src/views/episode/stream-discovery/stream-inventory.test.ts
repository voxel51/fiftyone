import { describe, expect, it } from "vitest";
import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  STREAM_METADATA,
  type StreamDescriptor,
} from "../../../ir/index";
import { sceneSourcesFromStreamDescriptors } from "../../../stream-selection";
import {
  STREAM_CAPABILITY,
  STREAM_CATEGORY,
  buildStreamInventoryRows,
  filterStreamInventoryRows,
  type StreamInventoryRow,
} from "./stream-inventory";

describe("buildStreamInventoryRows", () => {
  it("keeps stable stream IDs distinct from format source names", () => {
    const camera = {
      ...stream("/camera/front", "sensor_msgs/Image", "ros1", "ros1msg", "12"),
      id: "7",
    };

    const sceneSources = sceneSourcesFromStreamDescriptors([camera]);
    expect(sceneSources).toEqual([
      expect.objectContaining({
        id: "7",
        label: "camera/front",
        sourceName: "/camera/front",
      }),
    ]);
    expect(
      buildStreamInventoryRows({ sceneSources, streams: [camera] }),
    ).toEqual([
      expect.objectContaining({
        rateHz: null,
        rateLabel: null,
        sourceName: "/camera/front",
        sourceType: SCENE_SOURCE_TYPE.IMAGE,
        streamId: "7",
      }),
    ]);
  });

  it("keeps all streams and buckets them by customer job", () => {
    const streams = [
      stream("/camera/front", "sensor_msgs/Image", "ros1", "ros1msg", "12"),
      stream("/gps", "sensor_msgs/NavSatFix", "ros1", "ros1msg", "10"),
      stream("/lidar/top", "sensor_msgs/PointCloud2", "ros1", "ros1msg", "8"),
      stream(
        "/markers",
        "visualization_msgs/msg/MarkerArray",
        "cdr",
        "ros2msg",
        "4",
      ),
      stream("/plan", "nav_msgs/Path", "ros1", "ros1msg", "5"),
      stream("/odom", "nav_msgs/msg/Odometry", "cdr", "ros2msg", "6"),
      stream("/tf_static", "tf2_msgs/TFMessage", "ros1", "ros1msg", "2"),
      stream(
        "/diagnostics",
        "diagnostic_msgs/DiagnosticArray",
        "ros1",
        "ros1msg",
        "7",
      ),
      stream("/imu", "sensor_msgs/msg/Imu", "cdr", "ros2msg", "9"),
      stream("/vendor/raw", "vendor_msgs/Widget", "cdr", "ros2msg", "3"),
      stream(
        "/broken",
        "vendor_msgs/Broken",
        "cdr",
        "ros2msg",
        "1",
        "schema-unavailable",
      ),
      stream(
        "/binary",
        "vendor.Binary",
        "cbor",
        "protobuf",
        "1",
        "unsupported-encoding",
      ),
    ];

    const rows = buildStreamInventoryRows({
      sceneSources: sceneSourcesFromStreamDescriptors(streams),
      streams,
    });

    expect(rows.map((row) => row.sourceName)).toEqual([
      "/camera/front",
      "/gps",
      "/imu",
      "/lidar/top",
      "/markers",
      "/plan",
      "/odom",
      "/tf_static",
      "/diagnostics",
      "/binary",
      "/broken",
      "/vendor/raw",
    ]);
    expect(row(rows, "/camera/front")).toMatchObject({
      category: STREAM_CATEGORY.SENSORS,
      supportStatus: "renderable",
      capabilities: [STREAM_CAPABILITY.IMAGE, STREAM_CAPABILITY.RAW],
    });
    expect(row(rows, "/markers")).toMatchObject({
      category: STREAM_CATEGORY.ANNOTATIONS_PLANNING,
      supportStatus: "renderable",
      capabilities: [STREAM_CAPABILITY.THREE_D, STREAM_CAPABILITY.RAW],
    });
    expect(row(rows, "/gps")).toMatchObject({
      category: STREAM_CATEGORY.SENSORS,
      supportStatus: "renderable",
      capabilities: [STREAM_CAPABILITY.MAP, STREAM_CAPABILITY.RAW],
    });
    expect(row(rows, "/tf_static")).toMatchObject({
      category: STREAM_CATEGORY.TRANSFORMS_POSES,
      sourceType: null,
      supportStatus: "renderable",
      capabilities: [STREAM_CAPABILITY.THREE_D, STREAM_CAPABILITY.RAW],
    });
    expect(row(rows, "/diagnostics")).toMatchObject({
      category: STREAM_CATEGORY.DIAGNOSTICS,
      supportStatus: "renderable",
      capabilities: [STREAM_CAPABILITY.LOGS, STREAM_CAPABILITY.RAW],
    });
    expect(row(rows, "/imu")).toMatchObject({
      category: STREAM_CATEGORY.SENSORS,
      supportStatus: "inspectable",
      capabilities: [STREAM_CAPABILITY.PLOT, STREAM_CAPABILITY.RAW],
    });
    expect(row(rows, "/vendor/raw")).toMatchObject({
      category: STREAM_CATEGORY.CUSTOM,
      supportStatus: "inspectable",
      capabilities: [STREAM_CAPABILITY.RAW],
    });
    expect(row(rows, "/broken")).toMatchObject({
      supportStatus: "schema-unavailable",
      capabilities: [],
    });
    expect(row(rows, "/binary")).toMatchObject({
      supportStatus: "encoding-unsupported",
      capabilities: [],
    });
  });

  it("classifies imu path segments as sensors", () => {
    const streams = [
      stream("/vehicle/IMU/data", "vendor_msgs/Widget", "cdr", "ros2msg", "3"),
      stream("/simulated_pose", "vendor_msgs/Widget", "cdr", "ros2msg", "3"),
    ];

    const rows = buildStreamInventoryRows({ sceneSources: [], streams });

    expect(row(rows, "/vehicle/IMU/data").category).toBe(
      STREAM_CATEGORY.SENSORS,
    );
    expect(row(rows, "/simulated_pose").category).not.toBe(
      STREAM_CATEGORY.SENSORS,
    );
  });

  it("searches stream names, schema names, categories, support, and capabilities", () => {
    const rows = buildStreamInventoryRows({
      sceneSources: [],
      streams: [
        stream("/imu", "sensor_msgs/Imu", "ros1", "ros1msg", "9"),
        stream("/vendor/raw", "vendor_msgs/Widget", "cdr", "ros2msg", "3"),
      ],
    });

    expect(filterStreamInventoryRows(rows, "sensors").map(streamName)).toEqual([
      "/imu",
    ]);
    expect(filterStreamInventoryRows(rows, "Widget").map(streamName)).toEqual([
      "/vendor/raw",
    ]);
    expect(filterStreamInventoryRows(rows, "plot").map(streamName)).toEqual([
      "/imu",
    ]);
    expect(filterStreamInventoryRows(rows, "unsupported")).toEqual([]);
  });

  it("carries and formats validated approximate message rates", () => {
    const rowForRate = (approxRateHz: number | undefined) =>
      buildStreamInventoryRows({
        sceneSources: [],
        streams: [
          {
            ...stream("/camera", "sensor_msgs/Image", "ros1", "ros1msg", "12"),
            approxRateHz,
          },
        ],
      })[0];

    expect(rowForRate(29.976)).toMatchObject({
      rateHz: 29.976,
      rateLabel: "29.98 Hz",
    });
    expect(rowForRate(30)?.rateLabel).toBe("30 Hz");
    expect(rowForRate(0.009)?.rateLabel).toBe("<0.01 Hz");
    expect(rowForRate(0)?.rateLabel).toBe("0 Hz");
    for (const invalidRate of [
      undefined,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(rowForRate(invalidRate)).toMatchObject({
        rateHz: null,
        rateLabel: null,
      });
    }
  });

  it("uses adapter categories and semantic count nouns without inventing counts", () => {
    const rows = buildStreamInventoryRows({
      sceneSources: [],
      streams: [
        {
          ...stream("observation.images.front", "image", "parquet", "", "3"),
          kind: "image",
          metadata: {
            [STREAM_METADATA.CATEGORY]: STREAM_CATEGORY.OBSERVATIONS,
            [STREAM_METADATA.COUNT_NOUN]: "frames",
            [STREAM_METADATA.INSPECTABLE]: "false",
          },
        },
        {
          ...stream("action", "float32", "parquet", "", "3"),
          kind: "scalar",
          metadata: {
            [STREAM_METADATA.CATEGORY]: STREAM_CATEGORY.ACTIONS,
            [STREAM_METADATA.COUNT_NOUN]: "samples",
            [STREAM_METADATA.INSPECTABLE]: "true",
          },
        },
        {
          ...stream("instruction.text", "string", "parquet", "", "1"),
          metadata: {
            [STREAM_METADATA.CATEGORY]: STREAM_CATEGORY.INSTRUCTIONS,
            [STREAM_METADATA.INSPECTABLE]: "false",
          },
        },
        {
          ...stream("camera.video", "h264", "mp4", "", "1"),
          count: undefined,
          kind: "video",
          metadata: { [STREAM_METADATA.INSPECTABLE]: "false" },
        },
      ],
    });

    expect(row(rows, "observation.images.front")).toMatchObject({
      category: STREAM_CATEGORY.OBSERVATIONS,
      countLabel: "3 frames",
      canInspect: false,
    });
    expect(row(rows, "action")).toMatchObject({
      category: STREAM_CATEGORY.ACTIONS,
      countLabel: "3 samples",
      canInspect: true,
    });
    expect(row(rows, "instruction.text").category).toBe(
      STREAM_CATEGORY.INSTRUCTIONS,
    );
    expect(row(rows, "camera.video").countLabel).toBeNull();
  });
});

function row(rows: readonly StreamInventoryRow[], stream: string) {
  const match = rows.find((candidate) => candidate.sourceName === stream);
  if (!match) {
    throw new Error(`Missing stream inventory row: ${stream}`);
  }
  return match;
}

function streamName(row: { readonly sourceName: string }): string {
  return row.sourceName;
}

function stream(
  name: string,
  schema: string,
  encoding: string,
  schemaEncoding: string,
  count: string,
  decodeStatus = "decodable",
): StreamDescriptor {
  const sceneType = testSceneType(schema);
  return {
    count: Number(count),
    id: name,
    kind: "unknown",
    metadata: {
      [SCENE_SOURCE_METADATA.SOURCE_NAME]: name,
      ...(sceneType ? { [SCENE_SOURCE_METADATA.TYPE]: sceneType } : {}),
      [STREAM_METADATA.DECODE_STATUS]: decodeStatus,
      [STREAM_METADATA.INSPECTABLE]:
        decodeStatus === "decodable" ? "true" : "false",
      [STREAM_METADATA.ENCODING]: encoding,
      [STREAM_METADATA.SCHEMA_NAME]: schema,
    },
    payload: {
      encoding,
      schema,
      schemaEncoding,
    },
    sourceName: name,
    timeRange: { endNs: 1n, startNs: 0n },
  };
}

function testSceneType(schema: string): string | null {
  if (/Image$/.test(schema)) return SCENE_SOURCE_TYPE.IMAGE;
  if (/NavSatFix/.test(schema)) return SCENE_SOURCE_TYPE.LOCATION;
  if (/PointCloud/.test(schema)) return SCENE_SOURCE_TYPE.POINT_CLOUD;
  if (/Marker|Path/.test(schema)) return SCENE_SOURCE_TYPE.SCENE_ANNOTATION;
  if (/Odometry/.test(schema)) return SCENE_SOURCE_TYPE.POSE;
  if (/Diagnostic/.test(schema)) return SCENE_SOURCE_TYPE.LOG;
  return null;
}
