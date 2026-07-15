/**
 * Canonical Foxglove protobuf payload descriptors supported by the MCAP decoder.
 */
import type { PayloadDescriptor } from "../../../../../decoders";

/**
 * Payload identity for foxglove.CompressedImage messages.
 */
export const FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.CompressedImage",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.CompressedVideo messages.
 */
export const FOXGLOVE_COMPRESSED_VIDEO_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.CompressedVideo",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.RawImage messages.
 */
export const FOXGLOVE_RAW_IMAGE_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.RawImage",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.PointCloud messages.
 */
export const FOXGLOVE_POINT_CLOUD_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.PointCloud",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.ImageAnnotations messages.
 */
export const FOXGLOVE_IMAGE_ANNOTATIONS_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.ImageAnnotations",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.LaserScan messages.
 */
export const FOXGLOVE_LASER_SCAN_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.LaserScan",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.SceneUpdate messages.
 */
export const FOXGLOVE_SCENE_UPDATE_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.SceneUpdate",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.Grid messages.
 */
export const FOXGLOVE_GRID_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.Grid",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.CameraCalibration messages.
 */
export const FOXGLOVE_CAMERA_CALIBRATION_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.CameraCalibration",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.PoseInFrame messages.
 */
export const FOXGLOVE_POSE_IN_FRAME_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.PoseInFrame",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.LocationFix messages.
 */
export const FOXGLOVE_LOCATION_FIX_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.LocationFix",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identity for foxglove.Log messages.
 */
export const FOXGLOVE_LOG_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.Log",
  schemaEncoding: "protobuf",
} as const;

/**
 * Payload identities for Foxglove frame transform protobuf messages.
 */
export const FOXGLOVE_FRAME_TRANSFORM_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.FrameTransform",
  schemaEncoding: "protobuf",
} as const;

export const FOXGLOVE_FRAME_TRANSFORMS_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.FrameTransforms",
  schemaEncoding: "protobuf",
} as const;
