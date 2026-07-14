import type { PayloadDescriptor } from "../../../../decoders";

function rosPayloads(
  ros1Schema: string,
  ros2Schema: string,
): readonly PayloadDescriptor[] {
  return [
    {
      encoding: "ros1",
      schema: ros1Schema,
      schemaEncoding: "ros1msg",
    },
    {
      encoding: "cdr",
      schema: ros2Schema,
      schemaEncoding: "ros2msg",
    },
    {
      encoding: "cdr",
      schema: ros2Schema,
      schemaEncoding: "ros2idl",
    },
  ];
}

/**
 * Payload descriptors for ROS PointCloud2 messages.
 */
export const ROS_POINT_CLOUD2_PAYLOADS = rosPayloads(
  "sensor_msgs/PointCloud2",
  "sensor_msgs/msg/PointCloud2",
);

/**
 * Payload descriptors for ROS CompressedImage messages.
 */
export const ROS_COMPRESSED_IMAGE_PAYLOADS = rosPayloads(
  "sensor_msgs/CompressedImage",
  "sensor_msgs/msg/CompressedImage",
);

/**
 * Payload descriptors for ROS Image messages.
 */
export const ROS_IMAGE_PAYLOADS = rosPayloads(
  "sensor_msgs/Image",
  "sensor_msgs/msg/Image",
);

/**
 * Payload descriptors for ROS CameraInfo messages.
 */
export const ROS_CAMERA_INFO_PAYLOADS = rosPayloads(
  "sensor_msgs/CameraInfo",
  "sensor_msgs/msg/CameraInfo",
);

/**
 * Payload descriptors for ROS LaserScan messages.
 */
export const ROS_LASER_SCAN_PAYLOADS = rosPayloads(
  "sensor_msgs/LaserScan",
  "sensor_msgs/msg/LaserScan",
);

/**
 * Payload descriptors for ROS PoseStamped messages.
 */
export const ROS_POSE_STAMPED_PAYLOADS = rosPayloads(
  "geometry_msgs/PoseStamped",
  "geometry_msgs/msg/PoseStamped",
);

/**
 * Payload descriptors for ROS PoseArray messages.
 */
export const ROS_POSE_ARRAY_PAYLOADS = rosPayloads(
  "geometry_msgs/PoseArray",
  "geometry_msgs/msg/PoseArray",
);

/**
 * Payload descriptors for ROS Odometry messages.
 */
export const ROS_ODOMETRY_PAYLOADS = rosPayloads(
  "nav_msgs/Odometry",
  "nav_msgs/msg/Odometry",
);

/**
 * Payload descriptors for ROS Path messages.
 */
export const ROS_PATH_PAYLOADS = rosPayloads(
  "nav_msgs/Path",
  "nav_msgs/msg/Path",
);

/**
 * Payload descriptors for ROS NavSatFix messages.
 */
export const ROS_NAV_SAT_FIX_PAYLOADS = rosPayloads(
  "sensor_msgs/NavSatFix",
  "sensor_msgs/msg/NavSatFix",
);

/**
 * Payload descriptors for ROS rosgraph Log messages.
 */
export const ROS_ROSGRAPH_LOG_PAYLOADS: readonly PayloadDescriptor[] = [
  {
    encoding: "ros1",
    schema: "rosgraph_msgs/Log",
    schemaEncoding: "ros1msg",
  },
];

/**
 * Payload descriptors for ROS 2 rcl_interfaces Log messages.
 */
export const ROS_RCL_LOG_PAYLOADS: readonly PayloadDescriptor[] = [
  {
    encoding: "cdr",
    schema: "rcl_interfaces/msg/Log",
    schemaEncoding: "ros2msg",
  },
  {
    encoding: "cdr",
    schema: "rcl_interfaces/msg/Log",
    schemaEncoding: "ros2idl",
  },
];

/**
 * Payload descriptors for ROS DiagnosticArray messages.
 */
export const ROS_DIAGNOSTIC_ARRAY_PAYLOADS = rosPayloads(
  "diagnostic_msgs/DiagnosticArray",
  "diagnostic_msgs/msg/DiagnosticArray",
);

/**
 * Payload descriptors for ROS OccupancyGrid messages.
 */
export const ROS_OCCUPANCY_GRID_PAYLOADS = rosPayloads(
  "nav_msgs/OccupancyGrid",
  "nav_msgs/msg/OccupancyGrid",
);

/**
 * Payload descriptors for ROS visualization Marker messages.
 */
export const ROS_MARKER_PAYLOADS = rosPayloads(
  "visualization_msgs/Marker",
  "visualization_msgs/msg/Marker",
);

/**
 * Payload descriptors for ROS visualization MarkerArray messages.
 */
export const ROS_MARKER_ARRAY_PAYLOADS = rosPayloads(
  "visualization_msgs/MarkerArray",
  "visualization_msgs/msg/MarkerArray",
);

/**
 * Payload descriptors for ROS vision Detection2DArray messages.
 */
export const ROS_DETECTION_2D_ARRAY_PAYLOADS = rosPayloads(
  "vision_msgs/Detection2DArray",
  "vision_msgs/msg/Detection2DArray",
);

/**
 * Payload descriptors for ROS vision Detection3DArray messages.
 */
export const ROS_DETECTION_3D_ARRAY_PAYLOADS = rosPayloads(
  "vision_msgs/Detection3DArray",
  "vision_msgs/msg/Detection3DArray",
);

/**
 * Payload descriptors for ROS TF transform messages.
 */
export const ROS_TF_MESSAGE_PAYLOADS = rosPayloads(
  "tf2_msgs/TFMessage",
  "tf2_msgs/msg/TFMessage",
);

export const ROS_TRANSFORM_STAMPED_PAYLOADS = rosPayloads(
  "geometry_msgs/TransformStamped",
  "geometry_msgs/msg/TransformStamped",
);
