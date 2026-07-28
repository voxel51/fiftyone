import { describe, expect, it } from "vitest";
import type { StreamInventory } from "../../schemas/v1";
import { mcapSceneSources } from "./scene-sources";
import {
  MCAP_TOPIC_CAPABILITY,
  MCAP_TOPIC_CATEGORY,
  buildMcapTopicInventoryRows,
  filterMcapTopicInventoryRows,
  type McapTopicInventoryRow,
} from "./topic-inventory";

describe("buildMcapTopicInventoryRows", () => {
  it("keeps all topics and buckets them by customer job", () => {
    const topics = [
      topic("/camera/front", "sensor_msgs/Image", "ros1", "ros1msg", "12"),
      topic("/gps", "sensor_msgs/NavSatFix", "ros1", "ros1msg", "10"),
      topic("/lidar/top", "sensor_msgs/PointCloud2", "ros1", "ros1msg", "8"),
      topic(
        "/markers",
        "visualization_msgs/msg/MarkerArray",
        "cdr",
        "ros2msg",
        "4",
      ),
      topic("/plan", "nav_msgs/Path", "ros1", "ros1msg", "5"),
      topic("/odom", "nav_msgs/msg/Odometry", "cdr", "ros2msg", "6"),
      topic("/tf_static", "tf2_msgs/TFMessage", "ros1", "ros1msg", "2"),
      topic(
        "/diagnostics",
        "diagnostic_msgs/DiagnosticArray",
        "ros1",
        "ros1msg",
        "7",
      ),
      topic("/imu", "sensor_msgs/msg/Imu", "cdr", "ros2msg", "9"),
      topic("/vendor/raw", "vendor_msgs/Widget", "cdr", "ros2msg", "3"),
      topic(
        "/broken",
        "vendor_msgs/Broken",
        "cdr",
        "ros2msg",
        "1",
        "schema-unavailable",
      ),
      topic(
        "/binary",
        "vendor.Binary",
        "cbor",
        "protobuf",
        "1",
        "unsupported-encoding",
      ),
    ];

    const rows = buildMcapTopicInventoryRows({
      sceneSources: mcapSceneSources(topics),
      topics,
    });

    expect(rows.map((row) => row.topic)).toEqual([
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
      category: MCAP_TOPIC_CATEGORY.SENSORS,
      supportStatus: "renderable",
      capabilities: [MCAP_TOPIC_CAPABILITY.IMAGE, MCAP_TOPIC_CAPABILITY.RAW],
    });
    expect(row(rows, "/markers")).toMatchObject({
      category: MCAP_TOPIC_CATEGORY.ANNOTATIONS_PLANNING,
      supportStatus: "renderable",
      capabilities: [MCAP_TOPIC_CAPABILITY.THREE_D, MCAP_TOPIC_CAPABILITY.RAW],
    });
    expect(row(rows, "/gps")).toMatchObject({
      category: MCAP_TOPIC_CATEGORY.SENSORS,
      supportStatus: "renderable",
      capabilities: [MCAP_TOPIC_CAPABILITY.MAP, MCAP_TOPIC_CAPABILITY.RAW],
    });
    expect(row(rows, "/tf_static")).toMatchObject({
      category: MCAP_TOPIC_CATEGORY.TRANSFORMS_POSES,
      sourceType: null,
      supportStatus: "renderable",
      capabilities: [MCAP_TOPIC_CAPABILITY.THREE_D, MCAP_TOPIC_CAPABILITY.RAW],
    });
    expect(row(rows, "/diagnostics")).toMatchObject({
      category: MCAP_TOPIC_CATEGORY.DIAGNOSTICS,
      supportStatus: "renderable",
      capabilities: [MCAP_TOPIC_CAPABILITY.LOGS, MCAP_TOPIC_CAPABILITY.RAW],
    });
    expect(row(rows, "/imu")).toMatchObject({
      category: MCAP_TOPIC_CATEGORY.SENSORS,
      supportStatus: "inspectable",
      capabilities: [MCAP_TOPIC_CAPABILITY.PLOT, MCAP_TOPIC_CAPABILITY.RAW],
    });
    expect(row(rows, "/vendor/raw")).toMatchObject({
      category: MCAP_TOPIC_CATEGORY.CUSTOM,
      supportStatus: "inspectable",
      capabilities: [MCAP_TOPIC_CAPABILITY.RAW],
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
    const topics = [
      topic("/vehicle/IMU/data", "vendor_msgs/Widget", "cdr", "ros2msg", "3"),
      topic("/simulated_pose", "vendor_msgs/Widget", "cdr", "ros2msg", "3"),
    ];

    const rows = buildMcapTopicInventoryRows({ sceneSources: [], topics });

    expect(row(rows, "/vehicle/IMU/data").category).toBe(
      MCAP_TOPIC_CATEGORY.SENSORS,
    );
    expect(row(rows, "/simulated_pose").category).not.toBe(
      MCAP_TOPIC_CATEGORY.SENSORS,
    );
  });

  it("searches topic names, schema names, categories, support, and capabilities", () => {
    const rows = buildMcapTopicInventoryRows({
      sceneSources: [],
      topics: [
        topic("/imu", "sensor_msgs/Imu", "ros1", "ros1msg", "9"),
        topic("/vendor/raw", "vendor_msgs/Widget", "cdr", "ros2msg", "3"),
      ],
    });

    expect(
      filterMcapTopicInventoryRows(rows, "sensors").map(topicName),
    ).toEqual(["/imu"]);
    expect(filterMcapTopicInventoryRows(rows, "Widget").map(topicName)).toEqual(
      ["/vendor/raw"],
    );
    expect(filterMcapTopicInventoryRows(rows, "plot").map(topicName)).toEqual([
      "/imu",
    ]);
    expect(filterMcapTopicInventoryRows(rows, "unsupported")).toEqual([]);
  });
});

function row(rows: readonly McapTopicInventoryRow[], topic: string) {
  const match = rows.find((candidate) => candidate.topic === topic);
  if (!match) {
    throw new Error(`Missing topic inventory row: ${topic}`);
  }
  return match;
}

function topicName(row: { readonly topic: string }): string {
  return row.topic;
}

function topic(
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
      "mcap.generic_decode_status": decodeStatus,
      "mcap.message_encoding": encoding,
      "mcap.schema_name": schema,
      "mcap.topic": name,
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
