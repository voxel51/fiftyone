import type { Decoder } from "../../../decoders";
import { foxgloveCompressedImageDecoder } from "./compressed-image";
import { foxglovePointCloudDecoder } from "./point-cloud";

/**
 * Foxglove compressed image decoder export.
 */
export { foxgloveCompressedImageDecoder } from "./compressed-image";

/**
 * Foxglove point cloud decoder export.
 */
export { foxglovePointCloudDecoder } from "./point-cloud";

/**
 * Foxglove payload descriptors matched by the built-in MCAP decoders.
 */
export {
  FOXGLOVE_COMPRESSED_IMAGE_PAYLOAD,
  FOXGLOVE_POINT_CLOUD_PAYLOAD,
} from "./protobuf/payloads";

/**
 * Built-in Foxglove decoders for the MCAP adapter.
 */
export const foxgloveDecoders: readonly Decoder[] = [
  foxgloveCompressedImageDecoder,
  foxglovePointCloudDecoder,
];
