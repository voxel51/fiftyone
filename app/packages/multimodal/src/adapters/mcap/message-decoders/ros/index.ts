import type { Decoder } from "../../../../decoders/index";
import { rosCameraInfoDecoders } from "./camera-info";
import { rosCompressedImageDecoders } from "./compressed-image";
import { rosCompressedPointCloud2Decoders } from "./compressed-point-cloud2";
import { rosImageDecoders } from "./image";
import { rosLaserScanDecoders } from "./laser-scan";
import {
  rosDiagnosticArrayDecoders,
  rosRclLogDecoders,
  rosRosgraphLogDecoders,
} from "./log";
import { rosMarkerArrayDecoders, rosMarkerDecoders } from "./marker";
import { rosNavSatFixDecoders } from "./nav-sat-fix";
import { rosOccupancyGridDecoders } from "./occupancy-grid";
import { rosOdometryDecoders, rosPoseStampedDecoders } from "./pose";
import { rosPathDecoders, rosPoseArrayDecoders } from "./path";
import { rosPointCloud2Decoders } from "./point-cloud2";
import {
  rosDetection2DArrayDecoders,
  rosDetection3DArrayDecoders,
} from "./vision";

export { rosCameraInfoDecoders } from "./camera-info";
export { rosCompressedImageDecoders } from "./compressed-image";
export { rosImageDecoders } from "./image";
export { rosLaserScanDecoders } from "./laser-scan";
export {
  rosDiagnosticArrayDecoders,
  rosRclLogDecoders,
  rosRosgraphLogDecoders,
} from "./log";
export { rosMarkerArrayDecoders } from "./marker";
export { rosNavSatFixDecoders } from "./nav-sat-fix";
export { rosOccupancyGridDecoders } from "./occupancy-grid";
export { rosOdometryDecoders, rosPoseStampedDecoders } from "./pose";
export { rosPathDecoders, rosPoseArrayDecoders } from "./path";
export { rosPointCloud2Decoders } from "./point-cloud2";
export {
  rosDetection2DArrayDecoders,
  rosDetection3DArrayDecoders,
} from "./vision";
export * from "./payloads";

/**
 * All ROS decoder registrations supported by the MCAP adapter.
 */
export const rosDecoders: readonly Decoder[] = [
  ...rosCameraInfoDecoders,
  ...rosCompressedImageDecoders,
  ...rosCompressedPointCloud2Decoders,
  ...rosImageDecoders,
  ...rosLaserScanDecoders,
  ...rosRosgraphLogDecoders,
  ...rosRclLogDecoders,
  ...rosDiagnosticArrayDecoders,
  ...rosMarkerDecoders,
  ...rosMarkerArrayDecoders,
  ...rosNavSatFixDecoders,
  ...rosOccupancyGridDecoders,
  ...rosOdometryDecoders,
  ...rosPathDecoders,
  ...rosPoseArrayDecoders,
  ...rosPoseStampedDecoders,
  ...rosPointCloud2Decoders,
  ...rosDetection2DArrayDecoders,
  ...rosDetection3DArrayDecoders,
];
