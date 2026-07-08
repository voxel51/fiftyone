import type { Decoder } from "../../../../decoders";
import { decodeRosCameraInfoRecord } from "../ros/camera-info";
import { decodeRosCompressedImageRecord } from "../ros/compressed-image";
import { decodeRosImageRecord } from "../ros/image";
import { decodeRosLaserScanRecord } from "../ros/laser-scan";
import {
  decodeRosMarkerArrayRecord,
  decodeRosMarkerRecord,
} from "../ros/marker";
import { decodeRosNavSatFixRecord } from "../ros/nav-sat-fix";
import { decodeRosOccupancyGridRecord } from "../ros/occupancy-grid";
import { decodeRosPathRecord, decodeRosPoseArrayRecord } from "../ros/path";
import { decodeRosPointCloud2Record } from "../ros/point-cloud2";
import {
  decodeRosOdometryRecord,
  decodeRosPoseStampedRecord,
} from "../ros/pose";
import { jsonDecodersForPayloads } from "./factory";
import {
  JSON_ROS_CAMERA_INFO_PAYLOADS,
  JSON_ROS_COMPRESSED_IMAGE_PAYLOADS,
  JSON_ROS_IMAGE_PAYLOADS,
  JSON_ROS_LASER_SCAN_PAYLOADS,
  JSON_ROS_MARKER_ARRAY_PAYLOADS,
  JSON_ROS_MARKER_PAYLOADS,
  JSON_ROS_NAV_SAT_FIX_PAYLOADS,
  JSON_ROS_OCCUPANCY_GRID_PAYLOADS,
  JSON_ROS_ODOMETRY_PAYLOADS,
  JSON_ROS_PATH_PAYLOADS,
  JSON_ROS_POINT_CLOUD2_PAYLOADS,
  JSON_ROS_POSE_ARRAY_PAYLOADS,
  JSON_ROS_POSE_STAMPED_PAYLOADS,
} from "./payloads";

/**
 * JSON-schema decoders for ROS CompressedImage records.
 */
export const jsonRosCompressedImageDecoders = jsonDecodersForPayloads({
  id: "json.ros.compressed-image",
  map: decodeRosCompressedImageRecord,
  payloads: JSON_ROS_COMPRESSED_IMAGE_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS Image records.
 */
export const jsonRosImageDecoders = jsonDecodersForPayloads({
  id: "json.ros.image",
  map: decodeRosImageRecord,
  payloads: JSON_ROS_IMAGE_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS PointCloud2 records.
 */
export const jsonRosPointCloud2Decoders = jsonDecodersForPayloads({
  id: "json.ros.point-cloud2",
  map: decodeRosPointCloud2Record,
  payloads: JSON_ROS_POINT_CLOUD2_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS LaserScan records.
 */
export const jsonRosLaserScanDecoders = jsonDecodersForPayloads({
  id: "json.ros.laser-scan",
  map: decodeRosLaserScanRecord,
  payloads: JSON_ROS_LASER_SCAN_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS Marker records.
 */
export const jsonRosMarkerDecoders = jsonDecodersForPayloads({
  id: "json.ros.marker",
  map: decodeRosMarkerRecord,
  payloads: JSON_ROS_MARKER_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS MarkerArray records.
 */
export const jsonRosMarkerArrayDecoders = jsonDecodersForPayloads({
  id: "json.ros.marker-array",
  map: decodeRosMarkerArrayRecord,
  payloads: JSON_ROS_MARKER_ARRAY_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS CameraInfo records.
 */
export const jsonRosCameraInfoDecoders = jsonDecodersForPayloads({
  id: "json.ros.camera-info",
  map: decodeRosCameraInfoRecord,
  payloads: JSON_ROS_CAMERA_INFO_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS NavSatFix records.
 */
export const jsonRosNavSatFixDecoders = jsonDecodersForPayloads({
  id: "json.ros.nav-sat-fix",
  map: decodeRosNavSatFixRecord,
  payloads: JSON_ROS_NAV_SAT_FIX_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS OccupancyGrid records.
 */
export const jsonRosOccupancyGridDecoders = jsonDecodersForPayloads({
  id: "json.ros.occupancy-grid",
  map: decodeRosOccupancyGridRecord,
  payloads: JSON_ROS_OCCUPANCY_GRID_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS PoseStamped records.
 */
export const jsonRosPoseStampedDecoders = jsonDecodersForPayloads({
  id: "json.ros.pose-stamped",
  map: decodeRosPoseStampedRecord,
  payloads: JSON_ROS_POSE_STAMPED_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS Odometry records.
 */
export const jsonRosOdometryDecoders = jsonDecodersForPayloads({
  id: "json.ros.odometry",
  map: decodeRosOdometryRecord,
  payloads: JSON_ROS_ODOMETRY_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS Path records.
 */
export const jsonRosPathDecoders = jsonDecodersForPayloads({
  id: "json.ros.path",
  map: decodeRosPathRecord,
  payloads: JSON_ROS_PATH_PAYLOADS,
});

/**
 * JSON-schema decoders for ROS PoseArray records.
 */
export const jsonRosPoseArrayDecoders = jsonDecodersForPayloads({
  id: "json.ros.pose-array",
  map: decodeRosPoseArrayRecord,
  payloads: JSON_ROS_POSE_ARRAY_PAYLOADS,
});

/**
 * Built-in JSON-schema decoders for supported ROS message families.
 */
export const jsonRosDecoders: readonly Decoder[] = [
  ...jsonRosCompressedImageDecoders,
  ...jsonRosImageDecoders,
  ...jsonRosPointCloud2Decoders,
  ...jsonRosLaserScanDecoders,
  ...jsonRosMarkerDecoders,
  ...jsonRosMarkerArrayDecoders,
  ...jsonRosCameraInfoDecoders,
  ...jsonRosNavSatFixDecoders,
  ...jsonRosOccupancyGridDecoders,
  ...jsonRosPoseStampedDecoders,
  ...jsonRosOdometryDecoders,
  ...jsonRosPathDecoders,
  ...jsonRosPoseArrayDecoders,
];
