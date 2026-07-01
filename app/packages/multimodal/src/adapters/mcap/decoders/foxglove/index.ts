import type { Decoder } from "../../../../decoders";
import { foxgloveCompressedImageDecoder } from "./compressed-image";
import { foxgloveImageAnnotationsDecoder } from "./image-annotations";
import { foxglovePointCloudDecoder } from "./point-cloud";
import { foxgloveSceneUpdateDecoder } from "./scene-update";

/**
 * Foxglove compressed image decoder export.
 */
export { foxgloveCompressedImageDecoder } from "./compressed-image";

/**
 * Foxglove image annotations decoder export.
 */
export { foxgloveImageAnnotationsDecoder } from "./image-annotations";

/**
 * Foxglove point cloud decoder export.
 */
export { foxglovePointCloudDecoder } from "./point-cloud";

/**
 * Foxglove SceneUpdate decoder export.
 */
export { foxgloveSceneUpdateDecoder } from "./scene-update";

/**
 * Built-in Foxglove decoders for the MCAP adapter.
 */
export const foxgloveDecoders: readonly Decoder[] = [
  foxgloveCompressedImageDecoder,
  foxgloveImageAnnotationsDecoder,
  foxglovePointCloudDecoder,
  foxgloveSceneUpdateDecoder,
];
