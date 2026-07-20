import { describe, expect, it } from "vitest";
import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  STREAM_METADATA,
} from "../../ir";
import { sceneSourcesFromStreamInventory } from "../../scene-inventory";
import type { StreamInventory } from "../../schemas/v1";
import {
  EPISODE_STREAM_CAPABILITY,
  EPISODE_STREAM_CATEGORY,
  buildEpisodeStreamInventoryRows,
  filterEpisodeStreamInventoryRows,
  type EpisodeStreamInventoryRow,
} from "./stream-inventory";

describe("buildEpisodeStreamInventoryRows", () => {
  it("keeps stable stream IDs distinct from format source names", () => {
    const camera = {
      ...stream("/camera/front", "sensor_msgs/Image", "ros1", "ros1msg", "12"),
      streamId: "7",
    };

    expect(sceneSourcesFromStreamInventory([camera])).toEqual([
      expect.objectContaining({ id: "7", label: "camera" }),
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

    const rows = buildEpisodeStreamInventoryRows({
      sceneSources: sceneSourcesFromStreamInventory(streams),
      streams,
    });

    expect(rows.map((row) => row.stream)).toEqual([
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
      category: EPISODE_STREAM_CATEGORY.SENSORS,
      supportStatus: "renderable",
      capabilities: [
        EPISODE_STREAM_CAPABILITY.IMAGE,
        EPISODE_STREAM_CAPABILITY.RAW,
      ],
    });
    expect(row(rows, "/markers")).toMatchObject({
      category: EPISODE_STREAM_CATEGORY.ANNOTATIONS_PLANNING,
      supportStatus: "renderable",
      capabilities: [
        EPISODE_STREAM_CAPABILITY.THREE_D,
        EPISODE_STREAM_CAPABILITY.RAW,
      ],
    });
    expect(row(rows, "/gps")).toMatchObject({
      category: EPISODE_STREAM_CATEGORY.SENSORS,
      supportStatus: "renderable",
      capabilities: [
        EPISODE_STREAM_CAPABILITY.MAP,
        EPISODE_STREAM_CAPABILITY.RAW,
      ],
    });
    expect(row(rows, "/tf_static")).toMatchObject({
      category: EPISODE_STREAM_CATEGORY.TRANSFORMS_POSES,
      sourceType: null,
      supportStatus: "renderable",
      capabilities: [
        EPISODE_STREAM_CAPABILITY.THREE_D,
        EPISODE_STREAM_CAPABILITY.RAW,
      ],
    });
    expect(row(rows, "/diagnostics")).toMatchObject({
      category: EPISODE_STREAM_CATEGORY.DIAGNOSTICS,
      supportStatus: "renderable",
      capabilities: [
        EPISODE_STREAM_CAPABILITY.LOGS,
        EPISODE_STREAM_CAPABILITY.RAW,
      ],
    });
    expect(row(rows, "/imu")).toMatchObject({
      category: EPISODE_STREAM_CATEGORY.SENSORS,
      supportStatus: "inspectable",
      capabilities: [
        EPISODE_STREAM_CAPABILITY.PLOT,
        EPISODE_STREAM_CAPABILITY.RAW,
      ],
    });
    expect(row(rows, "/vendor/raw")).toMatchObject({
      category: EPISODE_STREAM_CATEGORY.CUSTOM,
      supportStatus: "inspectable",
      capabilities: [EPISODE_STREAM_CAPABILITY.RAW],
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

    const rows = buildEpisodeStreamInventoryRows({ sceneSources: [], streams });

    expect(row(rows, "/vehicle/IMU/data").category).toBe(
      EPISODE_STREAM_CATEGORY.SENSORS,
    );
    expect(row(rows, "/simulated_pose").category).not.toBe(
      EPISODE_STREAM_CATEGORY.SENSORS,
    );
  });

  it("searches stream names, schema names, categories, support, and capabilities", () => {
    const rows = buildEpisodeStreamInventoryRows({
      sceneSources: [],
      streams: [
        stream("/imu", "sensor_msgs/Imu", "ros1", "ros1msg", "9"),
        stream("/vendor/raw", "vendor_msgs/Widget", "cdr", "ros2msg", "3"),
      ],
    });

    expect(
      filterEpisodeStreamInventoryRows(rows, "sensors").map(streamName),
    ).toEqual(["/imu"]);
    expect(
      filterEpisodeStreamInventoryRows(rows, "Widget").map(streamName),
    ).toEqual(["/vendor/raw"]);
    expect(
      filterEpisodeStreamInventoryRows(rows, "plot").map(streamName),
    ).toEqual(["/imu"]);
    expect(filterEpisodeStreamInventoryRows(rows, "unsupported")).toEqual([]);
  });
});

function row(rows: readonly EpisodeStreamInventoryRow[], stream: string) {
  const match = rows.find((candidate) => candidate.stream === stream);
  if (!match) {
    throw new Error(`Missing stream inventory row: ${stream}`);
  }
  return match;
}

function streamName(row: { readonly stream: string }): string {
  return row.stream;
}

function stream(
  name: string,
  schema: string,
  encoding: string,
  schemaEncoding: string,
  count: string,
  decodeStatus = "decodable",
): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    displayName: name,
    metadata: {
      [SCENE_SOURCE_METADATA.SOURCE_NAME]: name,
      ...(testSceneType(schema)
        ? { [SCENE_SOURCE_METADATA.TYPE]: testSceneType(schema)! }
        : {}),
      [STREAM_METADATA.DECODE_STATUS]: decodeStatus,
      [STREAM_METADATA.ENCODING]: encoding,
      [STREAM_METADATA.SCHEMA_NAME]: schema,
    },
    payload: {
      $typeName: "fiftyone.multimodal.schemas.v1.PayloadDescriptor",
      encoding,
      schema,
      schemaEncoding,
    },
    recordCount: count,
    streamId: name,
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
