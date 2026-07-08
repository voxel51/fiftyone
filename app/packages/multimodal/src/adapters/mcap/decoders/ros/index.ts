import type { Decoder } from "../../../../decoders";
import { rosCameraInfoDecoders } from "./camera-info";
import { rosCompressedImageDecoders } from "./compressed-image";
import { rosImageDecoders } from "./image";
import { rosLaserScanDecoders } from "./laser-scan";
import { rosMarkerArrayDecoders, rosMarkerDecoders } from "./marker";
import { rosNavSatFixDecoders } from "./nav-sat-fix";
import { rosOccupancyGridDecoders } from "./occupancy-grid";
import { rosOdometryDecoders, rosPoseStampedDecoders } from "./pose";
import { rosPointCloud2Decoders } from "./point-cloud2";

export { rosCameraInfoDecoders } from "./camera-info";
export { rosCompressedImageDecoders } from "./compressed-image";
export { rosImageDecoders } from "./image";
export { rosLaserScanDecoders } from "./laser-scan";
export { rosMarkerArrayDecoders, rosMarkerDecoders } from "./marker";
export { rosNavSatFixDecoders } from "./nav-sat-fix";
export { rosOccupancyGridDecoders } from "./occupancy-grid";
export { rosOdometryDecoders, rosPoseStampedDecoders } from "./pose";
export { rosPointCloud2Decoders } from "./point-cloud2";
export * from "./payloads";

/**
 * All ROS decoder registrations supported by the MCAP adapter.
 */
export const rosDecoders: readonly Decoder[] = [
  ...rosCameraInfoDecoders,
  ...rosCompressedImageDecoders,
  ...rosImageDecoders,
  ...rosLaserScanDecoders,
  ...rosMarkerDecoders,
  ...rosMarkerArrayDecoders,
  ...rosNavSatFixDecoders,
  ...rosOccupancyGridDecoders,
  ...rosOdometryDecoders,
  ...rosPoseStampedDecoders,
  ...rosPointCloud2Decoders,
];
