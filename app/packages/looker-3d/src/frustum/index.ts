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
export { useFrustumActions, useFrustums } from "./hooks/public";

// Types
export type {
  CameraIntrinsics,
  FrustumData,
  FrustumGeometry,
  GroupIntrinsicsResponse,
  GroupStaticTransformResponse,
  StaticTransform,
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
