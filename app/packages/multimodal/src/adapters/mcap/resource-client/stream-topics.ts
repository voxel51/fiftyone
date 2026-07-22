import type { PayloadDescriptor } from "../../../ir/index";
import type { StreamInventory } from "../../../schemas/v1/index";
import {
  JSON_POSE_PAYLOAD,
  JSON_ROS_CAMERA_INFO_PAYLOADS,
  JSON_ROS_COMPRESSED_IMAGE_PAYLOADS,
  JSON_ROS_DETECTION_2D_ARRAY_PAYLOADS,
  JSON_ROS_DETECTION_3D_ARRAY_PAYLOADS,
  JSON_ROS_DIAGNOSTIC_ARRAY_PAYLOADS,
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
  JSON_ROS_RCL_LOG_PAYLOADS,
  JSON_ROS_ROSGRAPH_LOG_PAYLOADS,
} from "../message-decoders/json/payloads";
import {
  FOXGLOVE_CAMERA_CALIBRATION_CDR_PAYLOADS,
  FOXGLOVE_CAMERA_CALIBRATION_PAYLOAD,
  FOXGLOVE_COMPRESSED_IMAGE_CDR_PAYLOADS,
  FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD,
  FOXGLOVE_COMPRESSED_VIDEO_CDR_PAYLOADS,
  FOXGLOVE_COMPRESSED_VIDEO_PAYLOAD,
  FOXGLOVE_FRAME_TRANSFORM_CDR_PAYLOADS,
  FOXGLOVE_FRAME_TRANSFORM_PAYLOAD,
  FOXGLOVE_FRAME_TRANSFORMS_CDR_PAYLOADS,
  FOXGLOVE_FRAME_TRANSFORMS_PAYLOAD,
  FOXGLOVE_GRID_CDR_PAYLOADS,
  FOXGLOVE_GRID_PAYLOAD,
  FOXGLOVE_IMAGE_ANNOTATIONS_CDR_PAYLOADS,
  FOXGLOVE_LASER_SCAN_CDR_PAYLOADS,
  FOXGLOVE_LASER_SCAN_PAYLOAD,
  FOXGLOVE_LOCATION_FIX_CDR_PAYLOADS,
  FOXGLOVE_LOCATION_FIX_PAYLOAD,
  FOXGLOVE_LOG_CDR_PAYLOADS,
  FOXGLOVE_LOG_PAYLOAD,
  FOXGLOVE_POINT_CLOUD_CDR_PAYLOADS,
  FOXGLOVE_POSE_IN_FRAME_CDR_PAYLOADS,
  FOXGLOVE_POSE_IN_FRAME_PAYLOAD,
  FOXGLOVE_IMAGE_ANNOTATIONS_PAYLOAD,
  FOXGLOVE_POINT_CLOUD_PAYLOAD,
  FOXGLOVE_RAW_IMAGE_CDR_PAYLOADS,
  FOXGLOVE_RAW_IMAGE_PAYLOAD,
  FOXGLOVE_SCENE_UPDATE_CDR_PAYLOADS,
  FOXGLOVE_SCENE_UPDATE_PAYLOAD,
} from "../message-decoders/foxglove/payloads";
import {
  ROS_CAMERA_INFO_PAYLOADS,
  ROS_COMPRESSED_IMAGE_PAYLOADS,
  ROS_DETECTION_2D_ARRAY_PAYLOADS,
  ROS_DETECTION_3D_ARRAY_PAYLOADS,
  ROS_DIAGNOSTIC_ARRAY_PAYLOADS,
  ROS_IMAGE_PAYLOADS,
  ROS_LASER_SCAN_PAYLOADS,
  ROS_MARKER_ARRAY_PAYLOADS,
  ROS_MARKER_PAYLOADS,
  ROS_NAV_SAT_FIX_PAYLOADS,
  ROS_OCCUPANCY_GRID_PAYLOADS,
  ROS_ODOMETRY_PAYLOADS,
  ROS_PATH_PAYLOADS,
  ROS_POINT_CLOUD2_PAYLOADS,
  ROS_POSE_ARRAY_PAYLOADS,
  ROS_POSE_STAMPED_PAYLOADS,
  ROS_RCL_LOG_PAYLOADS,
  ROS_ROSGRAPH_LOG_PAYLOADS,
  ROS_TF_MESSAGE_PAYLOADS,
  ROS_TRANSFORM_STAMPED_PAYLOADS,
} from "../message-decoders/ros/payloads";

/**
 * Supported MCAP topics that the adapter can preview or pair.
 */
export interface McapPreviewTopics {
  readonly annotations: readonly string[];
  readonly image: readonly string[];
  readonly logs: readonly string[];
  readonly pointCloud: readonly string[];
  readonly previewable: readonly string[];
  readonly sceneUpdates: readonly string[];
}

/**
 * Classifies stream inventory into supported preview and pairing topic buckets.
 */
export function streamTopics(
  topics: readonly StreamInventory[],
): McapPreviewTopics {
  const image: string[] = [];
  const annotations: string[] = [];
  const logs: string[] = [];
  const pointCloud: string[] = [];
  const sceneUpdates: string[] = [];

  for (const topic of topics) {
    const name = topicName(topic);
    if (!name) {
      continue;
    }

    if (isImageStream(topic)) {
      image.push(name);
    } else if (isPointCloudStream(topic)) {
      pointCloud.push(name);
    } else if (isImageAnnotationsStream(topic)) {
      annotations.push(name);
    } else if (isSceneUpdateStream(topic)) {
      sceneUpdates.push(name);
    } else if (isLogStream(topic)) {
      logs.push(name);
    }
  }

  return {
    annotations,
    image,
    logs,
    pointCloud,
    previewable: [...image, ...pointCloud, ...logs],
    sceneUpdates,
  };
}

/**
 * Returns the MCAP topic name stored on a stream inventory item.
 */
export function topicName(topic: StreamInventory): string {
  return topic.metadata["mcap.topic"] ?? topic.displayName ?? "";
}

/**
 * Returns whether a stream inventory item is a supported image stream.
 */
export function isImageStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_COMPRESSED_IMAGE_CDR_PAYLOADS) ||
    hasPayload(topic, FOXGLOVE_COMPRESSED_VIDEO_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_COMPRESSED_VIDEO_CDR_PAYLOADS) ||
    hasPayload(topic, FOXGLOVE_RAW_IMAGE_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_RAW_IMAGE_CDR_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_COMPRESSED_IMAGE_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_IMAGE_PAYLOADS) ||
    hasAnyPayload(topic, ROS_COMPRESSED_IMAGE_PAYLOADS) ||
    hasAnyPayload(topic, ROS_IMAGE_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item is a supported compressed image.
 */
export function isCompressedImageStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_COMPRESSED_IMAGE_CDR_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_COMPRESSED_IMAGE_PAYLOADS) ||
    hasAnyPayload(topic, ROS_COMPRESSED_IMAGE_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item is a supported Foxglove image annotation stream.
 */
export function isImageAnnotationsStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_IMAGE_ANNOTATIONS_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_IMAGE_ANNOTATIONS_CDR_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_DETECTION_2D_ARRAY_PAYLOADS) ||
    hasAnyPayload(topic, ROS_DETECTION_2D_ARRAY_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item is a supported point-cloud-kind
 * stream: Foxglove PointCloud, or LaserScan (decoded into cartesian points).
 */
export function isPointCloudStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_POINT_CLOUD_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_POINT_CLOUD_CDR_PAYLOADS) ||
    hasPayload(topic, FOXGLOVE_LASER_SCAN_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_LASER_SCAN_CDR_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_POINT_CLOUD2_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_LASER_SCAN_PAYLOADS) ||
    hasAnyPayload(topic, ROS_POINT_CLOUD2_PAYLOADS) ||
    hasAnyPayload(topic, ROS_LASER_SCAN_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item is a supported Foxglove SceneUpdate stream.
 */
export function isSceneUpdateStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_SCENE_UPDATE_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_SCENE_UPDATE_CDR_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_MARKER_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_MARKER_ARRAY_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_PATH_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_POSE_ARRAY_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_DETECTION_3D_ARRAY_PAYLOADS) ||
    hasAnyPayload(topic, ROS_MARKER_PAYLOADS) ||
    hasAnyPayload(topic, ROS_MARKER_ARRAY_PAYLOADS) ||
    hasAnyPayload(topic, ROS_PATH_PAYLOADS) ||
    hasAnyPayload(topic, ROS_POSE_ARRAY_PAYLOADS) ||
    hasAnyPayload(topic, ROS_DETECTION_3D_ARRAY_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item is a supported Foxglove Grid stream.
 */
export function isGridStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_GRID_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_GRID_CDR_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_OCCUPANCY_GRID_PAYLOADS) ||
    hasAnyPayload(topic, ROS_OCCUPANCY_GRID_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item is a supported Foxglove
 * CameraCalibration stream.
 */
export function isCameraCalibrationStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_CAMERA_CALIBRATION_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_CAMERA_CALIBRATION_CDR_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_CAMERA_INFO_PAYLOADS) ||
    hasAnyPayload(topic, ROS_CAMERA_INFO_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item is a supported pose stream:
 * Foxglove PoseInFrame or an odometry-style JSON `Pose` export.
 */
export function isPoseStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_POSE_IN_FRAME_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_POSE_IN_FRAME_CDR_PAYLOADS) ||
    hasPayload(topic, JSON_POSE_PAYLOAD) ||
    hasAnyPayload(topic, JSON_ROS_POSE_STAMPED_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_ODOMETRY_PAYLOADS) ||
    hasAnyPayload(topic, ROS_POSE_STAMPED_PAYLOADS) ||
    hasAnyPayload(topic, ROS_ODOMETRY_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item is a supported Foxglove
 * LocationFix stream.
 */
export function isLocationFixStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_LOCATION_FIX_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_LOCATION_FIX_CDR_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_NAV_SAT_FIX_PAYLOADS) ||
    hasAnyPayload(topic, ROS_NAV_SAT_FIX_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item is a supported log/diagnostic stream.
 */
export function isLogStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_LOG_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_LOG_CDR_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_ROSGRAPH_LOG_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_RCL_LOG_PAYLOADS) ||
    hasAnyPayload(topic, JSON_ROS_DIAGNOSTIC_ARRAY_PAYLOADS) ||
    hasAnyPayload(topic, ROS_ROSGRAPH_LOG_PAYLOADS) ||
    hasAnyPayload(topic, ROS_RCL_LOG_PAYLOADS) ||
    hasAnyPayload(topic, ROS_DIAGNOSTIC_ARRAY_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item can feed the 3D frame-transform
 * resolver. Transform topics are not scene sources themselves; they support
 * placement of renderable streams discovered elsewhere.
 */
export function isFrameTransformStream(topic: StreamInventory): boolean {
  return (
    hasPayload(topic, FOXGLOVE_FRAME_TRANSFORM_PAYLOAD) ||
    hasPayload(topic, FOXGLOVE_FRAME_TRANSFORMS_PAYLOAD) ||
    hasAnyPayload(topic, FOXGLOVE_FRAME_TRANSFORM_CDR_PAYLOADS) ||
    hasAnyPayload(topic, FOXGLOVE_FRAME_TRANSFORMS_CDR_PAYLOADS) ||
    hasAnyPayload(topic, ROS_TF_MESSAGE_PAYLOADS) ||
    hasAnyPayload(topic, ROS_TRANSFORM_STAMPED_PAYLOADS)
  );
}

/**
 * Returns whether a stream inventory item exactly matches a payload descriptor.
 */
export function hasPayload(
  topic: StreamInventory,
  payload: PayloadDescriptor,
): boolean {
  const topicPayload = topic.payload;
  if (!topicPayload) {
    return false;
  }

  return (
    topicPayload.encoding === payload.encoding &&
    topicPayload.schema === payload.schema &&
    topicPayload.schemaEncoding === payload.schemaEncoding
  );
}

function hasAnyPayload(
  topic: StreamInventory,
  payloads: readonly PayloadDescriptor[],
): boolean {
  return payloads.some((payload) => hasPayload(topic, payload));
}
