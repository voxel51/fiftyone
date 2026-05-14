/**
 * Canonical Foxglove protobuf payload descriptors supported by the MCAP decoder.
 */
import type { PayloadDescriptor } from "../../../../decoders";

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
