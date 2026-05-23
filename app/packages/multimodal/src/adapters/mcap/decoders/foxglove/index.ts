import type { Decoder } from "../../../../decoders";
import { foxgloveCompressedImageDecoder } from "./compressed-image";
import { foxgloveFrameTransformDecoder } from "./frame-transform";
import { foxgloveImageAnnotationsDecoder } from "./image-annotations";
import { foxglovePointCloudDecoder } from "./point-cloud";
import { foxgloveSceneUpdateDecoder } from "./scene-update";

export { foxgloveCompressedImageDecoder } from "./compressed-image";
export { foxgloveFrameTransformDecoder } from "./frame-transform";
export { foxgloveImageAnnotationsDecoder } from "./image-annotations";
export { foxglovePointCloudDecoder } from "./point-cloud";
export { foxgloveSceneUpdateDecoder } from "./scene-update";

/**
 * Built-in Foxglove decoders for the MCAP adapter.
 */
export const foxgloveDecoders: readonly Decoder[] = [
  foxgloveCompressedImageDecoder,
  foxgloveFrameTransformDecoder,
  foxgloveImageAnnotationsDecoder,
  foxglovePointCloudDecoder,
  foxgloveSceneUpdateDecoder,
];
