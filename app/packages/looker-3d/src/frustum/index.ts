/**
 * Camera frustum visualization module.
 *
 * Exports components and hooks for rendering camera frustums
 * in the fo3d viewer for grouped datasets.
 */

// Components
export { Frustum } from "./Frustum";
export { FrustumCollection } from "./FrustumCollection";

// Hooks
export { useFrustumData } from "./useFrustumData";
export { useFrustumGeometry } from "./useFrustumGeometry";
export { useFrustumsVisible, useToggleFrustums } from "./hooks";

// Types
export type {
  CameraExtrinsics,
  CameraIntrinsics,
  FrustumData,
  FrustumGeometry,
  GroupExtrinsicsResponse,
  GroupIntrinsicsResponse,
  UseFrustumDataResult,
  UseFrustumGeometryResult,
} from "./types";

// Builders (for testing)
export {
  buildFrustumGeometry,
  computeFrustumCorners,
  computeFrustumDepth,
  extrinsicsToMatrix4,
  getCameraPosition,
  isValidExtrinsics,
} from "./builders";
