import type { Decoder } from "../../../../decoders/index";
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
import { foxgloveLogCdrDecoders, foxgloveLogDecoder } from "./log";
import {
  foxglovePointCloudCdrDecoders,
  foxglovePointCloudDecoder,
} from "./point-cloud";
import {
  foxglovePoseInFrameCdrDecoders,
  foxglovePoseInFrameDecoder,
} from "./pose-in-frame";
import {
  foxgloveRawImageCdrDecoders,
  foxgloveRawImageDecoder,
} from "./raw-image";
import {
  foxgloveSceneUpdateCdrDecoders,
  foxgloveSceneUpdateDecoder,
} from "./scene-update";

export {
  foxgloveCameraCalibrationCdrDecoders,
  foxgloveCameraCalibrationDecoder,
} from "./camera-calibration";
export {
  foxgloveCompressedImageCdrDecoders,
  foxgloveCompressedImageDecoder,
} from "./compressed-image";
export {
  foxgloveCompressedVideoCdrDecoders,
  foxgloveCompressedVideoDecoder,
} from "./compressed-video";
export { foxgloveGridCdrDecoders, foxgloveGridDecoder } from "./grid";
export {
  foxgloveImageAnnotationsCdrDecoders,
  foxgloveImageAnnotationsDecoder,
} from "./image-annotations";
export {
  foxgloveLaserScanCdrDecoders,
  foxgloveLaserScanDecoder,
} from "./laser-scan";
export {
  foxglovePointCloudCdrDecoders,
  foxglovePointCloudDecoder,
} from "./point-cloud";
export {
  foxgloveLocationFixCdrDecoders,
  foxgloveLocationFixDecoder,
} from "./location-fix";
export { foxgloveLogCdrDecoders, foxgloveLogDecoder } from "./log";
export {
  foxglovePoseInFrameCdrDecoders,
  foxglovePoseInFrameDecoder,
} from "./pose-in-frame";
export {
  foxgloveRawImageCdrDecoders,
  foxgloveRawImageDecoder,
} from "./raw-image";
export {
  foxgloveSceneUpdateCdrDecoders,
  foxgloveSceneUpdateDecoder,
} from "./scene-update";
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
  foxgloveLogDecoder,
  ...foxgloveLogCdrDecoders,
  foxglovePointCloudDecoder,
  ...foxglovePointCloudCdrDecoders,
  foxglovePoseInFrameDecoder,
  ...foxglovePoseInFrameCdrDecoders,
  foxgloveRawImageDecoder,
  ...foxgloveRawImageCdrDecoders,
  foxgloveSceneUpdateDecoder,
  ...foxgloveSceneUpdateCdrDecoders,
];
