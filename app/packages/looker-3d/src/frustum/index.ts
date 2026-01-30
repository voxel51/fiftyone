/**
 * Camera frustum visualization module.
 *
 * Exports components and hooks for rendering camera frustums
 * in the fo3d viewer for grouped datasets.
 */

export { Frustum } from "./Frustum";
export { FrustumCollection } from "./FrustumCollection";

export { useFrustumActions, useFrustums } from "./hooks/public";

export type {
  CameraIntrinsics,
  FrustumData,
  FrustumGeometry,
  GroupIntrinsicsResponse,
  GroupStaticTransformResponse,
  StaticTransform,
} from "./types";

export {
  buildFrustumGeometry,
  computeFrustumCorners,
  computeFrustumDepth,
  getCameraPosition,
  isValidStaticTransform,
  staticTransformToMatrix4,
} from "./builders";
