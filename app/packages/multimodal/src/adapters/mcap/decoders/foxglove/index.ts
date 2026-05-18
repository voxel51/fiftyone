import type { Decoder } from "../../../../decoders";
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
 * Built-in Foxglove decoders for the MCAP adapter.
 */
export const foxgloveDecoders: readonly Decoder[] = [
  foxgloveCompressedImageDecoder,
  foxglovePointCloudDecoder,
];
