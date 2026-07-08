import type { Decoder } from "../../../../decoders";
import {
  foxgloveCameraCalibrationCdrDecoders,
  foxgloveCameraCalibrationDecoder,
} from "./camera-calibration";
import {
  foxgloveCompressedImageCdrDecoders,
  foxgloveCompressedImageDecoder,
} from "./compressed-image";
import {
  foxgloveCompressedVideoCdrDecoders,
  foxgloveCompressedVideoDecoder,
} from "./compressed-video";
import { foxgloveGridCdrDecoders, foxgloveGridDecoder } from "./grid";
import {
  foxgloveImageAnnotationsCdrDecoders,
  foxgloveImageAnnotationsDecoder,
} from "./image-annotations";
import {
  foxgloveLaserScanCdrDecoders,
  foxgloveLaserScanDecoder,
} from "./laser-scan";
import {
  foxgloveLocationFixCdrDecoders,
  foxgloveLocationFixDecoder,
} from "./location-fix";
import {
  foxglovePointCloudCdrDecoders,
  foxglovePointCloudDecoder,
} from "./point-cloud";
import {
  foxglovePoseInFrameCdrDecoders,
  foxglovePoseInFrameDecoder,
} from "./pose-in-frame";
import {
  foxgloveSceneUpdateCdrDecoders,
  foxgloveSceneUpdateDecoder,
} from "./scene-update";

/**
 * Foxglove camera calibration decoder export.
 */
export {
  foxgloveCameraCalibrationCdrDecoders,
  foxgloveCameraCalibrationDecoder,
} from "./camera-calibration";

/**
 * Foxglove compressed image decoder export.
 */
export {
  foxgloveCompressedImageCdrDecoders,
  foxgloveCompressedImageDecoder,
} from "./compressed-image";

/**
 * Foxglove compressed video decoder export.
 */
export {
  foxgloveCompressedVideoCdrDecoders,
  foxgloveCompressedVideoDecoder,
} from "./compressed-video";

/**
 * Foxglove Grid decoder export.
 */
export { foxgloveGridCdrDecoders, foxgloveGridDecoder } from "./grid";

/**
 * Foxglove image annotations decoder export.
 */
export {
  foxgloveImageAnnotationsCdrDecoders,
  foxgloveImageAnnotationsDecoder,
} from "./image-annotations";

/**
 * Foxglove LaserScan decoder export.
 */
export {
  foxgloveLaserScanCdrDecoders,
  foxgloveLaserScanDecoder,
} from "./laser-scan";

/**
 * Foxglove point cloud decoder export.
 */
export {
  foxglovePointCloudCdrDecoders,
  foxglovePointCloudDecoder,
} from "./point-cloud";

/**
 * Foxglove LocationFix decoder export.
 */
export {
  foxgloveLocationFixCdrDecoders,
  foxgloveLocationFixDecoder,
} from "./location-fix";

/**
 * Foxglove PoseInFrame decoder export.
 */
export {
  foxglovePoseInFrameCdrDecoders,
  foxglovePoseInFrameDecoder,
} from "./pose-in-frame";

/**
 * Foxglove SceneUpdate decoder export.
 */
export {
  foxgloveSceneUpdateCdrDecoders,
  foxgloveSceneUpdateDecoder,
} from "./scene-update";

/**
 * Foxglove payload descriptor exports.
 */
export * from "./payloads";

/**
 * Built-in Foxglove decoders for the MCAP adapter.
 */
export const foxgloveDecoders: readonly Decoder[] = [
  foxgloveCameraCalibrationDecoder,
  ...foxgloveCameraCalibrationCdrDecoders,
  foxgloveCompressedImageDecoder,
  ...foxgloveCompressedImageCdrDecoders,
  foxgloveCompressedVideoDecoder,
  ...foxgloveCompressedVideoCdrDecoders,
  foxgloveGridDecoder,
  ...foxgloveGridCdrDecoders,
  foxgloveImageAnnotationsDecoder,
  ...foxgloveImageAnnotationsCdrDecoders,
  foxgloveLaserScanDecoder,
  ...foxgloveLaserScanCdrDecoders,
  foxgloveLocationFixDecoder,
  ...foxgloveLocationFixCdrDecoders,
  foxglovePointCloudDecoder,
  ...foxglovePointCloudCdrDecoders,
  foxglovePoseInFrameDecoder,
  ...foxglovePoseInFrameCdrDecoders,
  foxgloveSceneUpdateDecoder,
  ...foxgloveSceneUpdateCdrDecoders,
];
