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
export { useFrustumsVisible, useToggleFrustums } from "./hooks";
export { useFrustumData } from "./useFrustumData";
export { useFrustumGeometry } from "./useFrustumGeometry";

// Types
export type {
  CameraIntrinsics,
  FrustumData,
  FrustumGeometry,
  GroupIntrinsicsResponse,
  GroupStaticTransformResponse,
  StaticTransform,
  UseFrustumDataResult,
  UseFrustumGeometryResult,
} from "./types";

// Builders (for testing)
export {
  buildFrustumGeometry,
  computeFrustumCorners,
  computeFrustumDepth,
  getCameraPosition,
  isValidStaticTransform,
  staticTransformToMatrix4,
} from "./builders";
