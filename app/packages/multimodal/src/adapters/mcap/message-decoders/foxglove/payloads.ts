import type { PayloadDescriptor } from "../../../../ir/index";

export * from "./protobuf/payloads";

function foxgloveCdrPayloads(schema: string): readonly PayloadDescriptor[] {
  return [
    {
      encoding: "cdr",
      schema: `foxglove_msgs/msg/${schema}`,
      schemaEncoding: "ros2msg",
    },
    {
      encoding: "cdr",
      schema: `foxglove_msgs/msg/${schema}`,
      schemaEncoding: "ros2idl",
    },
  ];
}

/**
 * Payload identities for foxglove_msgs/msg/CameraCalibration messages carried
 * over ROS 2 CDR encodings.
 */
export const FOXGLOVE_CAMERA_CALIBRATION_CDR_PAYLOADS =
  foxgloveCdrPayloads("CameraCalibration");

/**
 * Payload identities for foxglove_msgs/msg/CompressedImage messages carried
 * over ROS 2 CDR encodings.
 */
export const FOXGLOVE_COMPRESSED_IMAGE_CDR_PAYLOADS =
  foxgloveCdrPayloads("CompressedImage");

/**
 * Payload identities for foxglove_msgs/msg/CompressedVideo messages carried
 * over ROS 2 CDR encodings.
 */
export const FOXGLOVE_COMPRESSED_VIDEO_CDR_PAYLOADS =
  foxgloveCdrPayloads("CompressedVideo");

/**
 * Payload identities for foxglove_msgs/msg/RawImage messages carried over
 * ROS 2 CDR encodings.
 */
export const FOXGLOVE_RAW_IMAGE_CDR_PAYLOADS = Object.freeze(
  foxgloveCdrPayloads("RawImage"),
);

/**
 * Payload identities for foxglove_msgs/msg/Grid messages carried over ROS 2
 * CDR encodings.
 */
export const FOXGLOVE_GRID_CDR_PAYLOADS = foxgloveCdrPayloads("Grid");

/**
 * Payload identities for foxglove_msgs/msg/ImageAnnotations messages carried
 * over ROS 2 CDR encodings.
 */
export const FOXGLOVE_IMAGE_ANNOTATIONS_CDR_PAYLOADS =
  foxgloveCdrPayloads("ImageAnnotations");

/**
 * Payload identities for foxglove_msgs/msg/LaserScan messages carried over
 * ROS 2 CDR encodings.
 */
export const FOXGLOVE_LASER_SCAN_CDR_PAYLOADS =
  foxgloveCdrPayloads("LaserScan");

/**
 * Payload identities for foxglove_msgs/msg/LocationFix messages carried over
 * ROS 2 CDR encodings.
 */
export const FOXGLOVE_LOCATION_FIX_CDR_PAYLOADS =
  foxgloveCdrPayloads("LocationFix");

/**
 * Payload identities for foxglove_msgs/msg/Log messages carried over ROS 2
 * CDR encodings.
 */
export const FOXGLOVE_LOG_CDR_PAYLOADS = foxgloveCdrPayloads("Log");

/**
 * Payload identities for foxglove_msgs/msg/PointCloud messages carried over
 * ROS 2 CDR encodings.
 */
export const FOXGLOVE_POINT_CLOUD_CDR_PAYLOADS =
  foxgloveCdrPayloads("PointCloud");

/**
 * Payload identities for foxglove_msgs/msg/PoseInFrame messages carried over
 * ROS 2 CDR encodings.
 */
export const FOXGLOVE_POSE_IN_FRAME_CDR_PAYLOADS =
  foxgloveCdrPayloads("PoseInFrame");

/**
 * Payload identities for foxglove_msgs/msg/SceneUpdate messages carried over
 * ROS 2 CDR encodings.
 */
export const FOXGLOVE_SCENE_UPDATE_CDR_PAYLOADS =
  foxgloveCdrPayloads("SceneUpdate");

/**
 * Payload identities for foxglove_msgs/msg/FrameTransform(s) messages carried
 * over ROS 2 CDR encodings. Frame transforms are discovered by the transform
 * reader rather than the visual decoder registry, but stream classification
 * and tests need the same canonical spellings.
 */
export const FOXGLOVE_FRAME_TRANSFORM_CDR_PAYLOADS =
  foxgloveCdrPayloads("FrameTransform");
export const FOXGLOVE_FRAME_TRANSFORMS_CDR_PAYLOADS =
  foxgloveCdrPayloads("FrameTransforms");
