/**
 * JSON payload descriptors supported by the MCAP decoder. JSON schema
 * names are exporter-chosen and unnamespaced, so decoders registered for
 * these triples must validate payload shape rather than trust the name.
 */
import type { PayloadDescriptor } from "../../../../ir/index";

/**
 * Payload identity for JSON `Pose` messages (odometry-style exports:
 * position/orientation plus optional velocity/acceleration/rotation rate).
 */
export const JSON_POSE_PAYLOAD: PayloadDescriptor = {
  encoding: "json",
  schema: "Pose",
  schemaEncoding: "jsonschema",
};

function jsonRosPayloads(
  ros1Schema: string,
  ros2Schema: string,
): readonly PayloadDescriptor[] {
  return [
    {
      encoding: "json",
      schema: ros1Schema,
      schemaEncoding: "jsonschema",
    },
    {
      encoding: "json",
      schema: ros2Schema,
      schemaEncoding: "jsonschema",
    },
  ];
}

/**
 * Payload descriptors for JSON-schema ROS PointCloud2 messages.
 */
export const JSON_ROS_POINT_CLOUD2_PAYLOADS = jsonRosPayloads(
  "sensor_msgs/PointCloud2",
  "sensor_msgs/msg/PointCloud2",
);

/**
 * Payload descriptors for JSON-schema ROS CompressedImage messages.
 */
export const JSON_ROS_COMPRESSED_IMAGE_PAYLOADS = jsonRosPayloads(
  "sensor_msgs/CompressedImage",
  "sensor_msgs/msg/CompressedImage",
);

/**
 * Payload descriptors for JSON-schema ROS Image messages.
 */
export const JSON_ROS_IMAGE_PAYLOADS = jsonRosPayloads(
  "sensor_msgs/Image",
  "sensor_msgs/msg/Image",
);

/**
 * Payload descriptors for JSON-schema ROS CameraInfo messages.
 */
export const JSON_ROS_CAMERA_INFO_PAYLOADS = jsonRosPayloads(
  "sensor_msgs/CameraInfo",
  "sensor_msgs/msg/CameraInfo",
);

/**
 * Payload descriptors for JSON-schema ROS LaserScan messages.
 */
export const JSON_ROS_LASER_SCAN_PAYLOADS = jsonRosPayloads(
  "sensor_msgs/LaserScan",
  "sensor_msgs/msg/LaserScan",
);

/**
 * Payload descriptors for JSON-schema ROS PoseStamped messages.
 */
export const JSON_ROS_POSE_STAMPED_PAYLOADS = jsonRosPayloads(
  "geometry_msgs/PoseStamped",
  "geometry_msgs/msg/PoseStamped",
);

/**
 * Payload descriptors for JSON-schema ROS PoseArray messages.
 */
export const JSON_ROS_POSE_ARRAY_PAYLOADS = jsonRosPayloads(
  "geometry_msgs/PoseArray",
  "geometry_msgs/msg/PoseArray",
);

/**
 * Payload descriptors for JSON-schema ROS Odometry messages.
 */
export const JSON_ROS_ODOMETRY_PAYLOADS = jsonRosPayloads(
  "nav_msgs/Odometry",
  "nav_msgs/msg/Odometry",
);

/**
 * Payload descriptors for JSON-schema ROS Path messages.
 */
export const JSON_ROS_PATH_PAYLOADS = jsonRosPayloads(
  "nav_msgs/Path",
  "nav_msgs/msg/Path",
);

/**
 * Payload descriptors for JSON-schema ROS NavSatFix messages.
 */
export const JSON_ROS_NAV_SAT_FIX_PAYLOADS = jsonRosPayloads(
  "sensor_msgs/NavSatFix",
  "sensor_msgs/msg/NavSatFix",
);

/**
 * Payload descriptors for JSON-schema ROS rosgraph Log messages.
 */
export const JSON_ROS_ROSGRAPH_LOG_PAYLOADS: readonly PayloadDescriptor[] = [
  {
    encoding: "json",
    schema: "rosgraph_msgs/Log",
    schemaEncoding: "jsonschema",
  },
];

/**
 * Payload descriptors for JSON-schema ROS 2 rcl_interfaces Log messages.
 */
export const JSON_ROS_RCL_LOG_PAYLOADS: readonly PayloadDescriptor[] = [
  {
    encoding: "json",
    schema: "rcl_interfaces/msg/Log",
    schemaEncoding: "jsonschema",
  },
];

/**
 * Payload descriptors for JSON-schema ROS DiagnosticArray messages.
 */
export const JSON_ROS_DIAGNOSTIC_ARRAY_PAYLOADS = jsonRosPayloads(
  "diagnostic_msgs/DiagnosticArray",
  "diagnostic_msgs/msg/DiagnosticArray",
);

/**
 * Payload descriptors for JSON-schema ROS OccupancyGrid messages.
 */
export const JSON_ROS_OCCUPANCY_GRID_PAYLOADS = jsonRosPayloads(
  "nav_msgs/OccupancyGrid",
  "nav_msgs/msg/OccupancyGrid",
);

/**
 * Payload descriptors for JSON-schema ROS visualization Marker messages.
 */
export const JSON_ROS_MARKER_PAYLOADS = jsonRosPayloads(
  "visualization_msgs/Marker",
  "visualization_msgs/msg/Marker",
);

/**
 * Payload descriptors for JSON-schema ROS visualization MarkerArray messages.
 */
export const JSON_ROS_MARKER_ARRAY_PAYLOADS = jsonRosPayloads(
  "visualization_msgs/MarkerArray",
  "visualization_msgs/msg/MarkerArray",
);

/**
 * Payload descriptors for JSON-schema ROS vision Detection2DArray messages.
 */
export const JSON_ROS_DETECTION_2D_ARRAY_PAYLOADS = jsonRosPayloads(
  "vision_msgs/Detection2DArray",
  "vision_msgs/msg/Detection2DArray",
);

/**
 * Payload descriptors for JSON-schema ROS vision Detection3DArray messages.
 */
export const JSON_ROS_DETECTION_3D_ARRAY_PAYLOADS = jsonRosPayloads(
  "vision_msgs/Detection3DArray",
  "vision_msgs/msg/Detection3DArray",
);

/**
 * Payload identity for JSON-encoded `foxglove.RawAudio` messages (the
 * Foxglove JSON schema registry's namespaced schema name).
 */
export const JSON_FOXGLOVE_RAW_AUDIO_PAYLOAD: PayloadDescriptor = {
  encoding: "json",
  schema: "foxglove.RawAudio",
  schemaEncoding: "jsonschema",
};

/**
 * Payload identity for JSON-encoded `foxglove.CompressedAudio` messages.
 */
export const JSON_FOXGLOVE_COMPRESSED_AUDIO_PAYLOAD: PayloadDescriptor = {
  encoding: "json",
  schema: "foxglove.CompressedAudio",
  schemaEncoding: "jsonschema",
};
