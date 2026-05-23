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
};

/**
 * Payload identity for foxglove.PointCloud messages.
 */
export const FOXGLOVE_POINT_CLOUD_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.PointCloud",
  schemaEncoding: "protobuf",
};

/**
 * Payload identity for foxglove.ImageAnnotations messages.
 */
export const FOXGLOVE_IMAGE_ANNOTATIONS_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.ImageAnnotations",
  schemaEncoding: "protobuf",
};

/**
 * Payload identity for foxglove.SceneUpdate messages.
 */
export const FOXGLOVE_SCENE_UPDATE_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.SceneUpdate",
  schemaEncoding: "protobuf",
};

/**
 * Payload identity for foxglove.FrameTransform messages.
 */
export const FOXGLOVE_FRAME_TRANSFORM_PAYLOAD: PayloadDescriptor = {
  encoding: "protobuf",
  schema: "foxglove.FrameTransform",
  schemaEncoding: "protobuf",
};
