import type { Decoder } from "../../../../decoders";
import { rosCameraInfoDecoders } from "./camera-info";
import { rosCompressedImageDecoders } from "./compressed-image";
import { rosLaserScanDecoders } from "./laser-scan";
import { rosNavSatFixDecoders } from "./nav-sat-fix";
import { rosOccupancyGridDecoders } from "./occupancy-grid";
import { rosOdometryDecoders, rosPoseStampedDecoders } from "./pose";
import { rosPointCloud2Decoders } from "./point-cloud2";

export { rosCameraInfoDecoders } from "./camera-info";
export { rosCompressedImageDecoders } from "./compressed-image";
export { rosLaserScanDecoders } from "./laser-scan";
export { rosNavSatFixDecoders } from "./nav-sat-fix";
export { rosOccupancyGridDecoders } from "./occupancy-grid";
export { rosOdometryDecoders, rosPoseStampedDecoders } from "./pose";
export { rosPointCloud2Decoders } from "./point-cloud2";
export * from "./payloads";

export const rosDecoders: readonly Decoder[] = [
  ...rosCameraInfoDecoders,
  ...rosCompressedImageDecoders,
  ...rosLaserScanDecoders,
  ...rosNavSatFixDecoders,
  ...rosOccupancyGridDecoders,
  ...rosOdometryDecoders,
  ...rosPoseStampedDecoders,
  ...rosPointCloud2Decoders,
];
