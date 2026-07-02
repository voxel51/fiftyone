import type { Decoder } from "../../../../decoders";
import { foxgloveCameraCalibrationDecoder } from "./camera-calibration";
import { foxgloveCompressedImageDecoder } from "./compressed-image";
import { foxgloveGridDecoder } from "./grid";
import { foxgloveImageAnnotationsDecoder } from "./image-annotations";
import { foxgloveLocationFixDecoder } from "./location-fix";
import { foxglovePointCloudDecoder } from "./point-cloud";
import { foxglovePoseInFrameDecoder } from "./pose-in-frame";
import { foxgloveSceneUpdateDecoder } from "./scene-update";

/**
 * Foxglove camera calibration decoder export.
 */
export { foxgloveCameraCalibrationDecoder } from "./camera-calibration";

/**
 * Foxglove compressed image decoder export.
 */
export { foxgloveCompressedImageDecoder } from "./compressed-image";

/**
 * Foxglove Grid decoder export.
 */
export { foxgloveGridDecoder } from "./grid";

/**
 * Foxglove image annotations decoder export.
 */
export { foxgloveImageAnnotationsDecoder } from "./image-annotations";

/**
 * Foxglove point cloud decoder export.
 */
export { foxglovePointCloudDecoder } from "./point-cloud";

/**
 * Foxglove LocationFix decoder export.
 */
export { foxgloveLocationFixDecoder } from "./location-fix";

/**
 * Foxglove PoseInFrame decoder export.
 */
export { foxglovePoseInFrameDecoder } from "./pose-in-frame";

/**
 * Foxglove SceneUpdate decoder export.
 */
export { foxgloveSceneUpdateDecoder } from "./scene-update";

/**
 * Built-in Foxglove decoders for the MCAP adapter.
 */
export const foxgloveDecoders: readonly Decoder[] = [
  foxgloveCameraCalibrationDecoder,
  foxgloveCompressedImageDecoder,
  foxgloveGridDecoder,
  foxgloveImageAnnotationsDecoder,
  foxgloveLocationFixDecoder,
  foxglovePointCloudDecoder,
  foxglovePoseInFrameDecoder,
  foxgloveSceneUpdateDecoder,
];
