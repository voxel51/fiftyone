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

export const ROS_POINT_CLOUD2_PAYLOADS = rosPayloads(
  "sensor_msgs/PointCloud2",
  "sensor_msgs/msg/PointCloud2",
);

export const ROS_COMPRESSED_IMAGE_PAYLOADS = rosPayloads(
  "sensor_msgs/CompressedImage",
  "sensor_msgs/msg/CompressedImage",
);

export const ROS_IMAGE_PAYLOADS = rosPayloads(
  "sensor_msgs/Image",
  "sensor_msgs/msg/Image",
);

export const ROS_CAMERA_INFO_PAYLOADS = rosPayloads(
  "sensor_msgs/CameraInfo",
  "sensor_msgs/msg/CameraInfo",
);

export const ROS_LASER_SCAN_PAYLOADS = rosPayloads(
  "sensor_msgs/LaserScan",
  "sensor_msgs/msg/LaserScan",
);

export const ROS_POSE_STAMPED_PAYLOADS = rosPayloads(
  "geometry_msgs/PoseStamped",
  "geometry_msgs/msg/PoseStamped",
);

export const ROS_ODOMETRY_PAYLOADS = rosPayloads(
  "nav_msgs/Odometry",
  "nav_msgs/msg/Odometry",
);

export const ROS_NAV_SAT_FIX_PAYLOADS = rosPayloads(
  "sensor_msgs/NavSatFix",
  "sensor_msgs/msg/NavSatFix",
);

export const ROS_OCCUPANCY_GRID_PAYLOADS = rosPayloads(
  "nav_msgs/OccupancyGrid",
  "nav_msgs/msg/OccupancyGrid",
);
