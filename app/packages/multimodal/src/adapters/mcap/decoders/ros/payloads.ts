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
 * Payload descriptors for ROS Odometry messages.
 */
export const ROS_ODOMETRY_PAYLOADS = rosPayloads(
  "nav_msgs/Odometry",
  "nav_msgs/msg/Odometry",
);

/**
 * Payload descriptors for ROS NavSatFix messages.
 */
export const ROS_NAV_SAT_FIX_PAYLOADS = rosPayloads(
  "sensor_msgs/NavSatFix",
  "sensor_msgs/msg/NavSatFix",
);

/**
 * Payload descriptors for ROS OccupancyGrid messages.
 */
export const ROS_OCCUPANCY_GRID_PAYLOADS = rosPayloads(
  "nav_msgs/OccupancyGrid",
  "nav_msgs/msg/OccupancyGrid",
);
