/**
 * Pure functions for frustum geometry calculation.
 * These functions are isolated from React and Three.js for testability.
 */

import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import {
  FRUSTUM_DEFAULT_ASPECT_RATIO,
  FRUSTUM_DEFAULT_FOV_DEGREES,
  FRUSTUM_DEPTH,
  FRUSTUM_MAX_DEPTH,
  FRUSTUM_MIN_DEPTH,
  FRUSTUM_NEAR_PLANE_DISTANCE,
} from "./constants";
import type {
  CameraIntrinsics,
  FrustumGeometry,
  StaticTransform,
} from "./types";

/**
 * Converts static transform to a Three.js transformation matrix.
 *
 * @param staticTransform - Static transform with translation and quaternion
 * @returns Matrix4 transformation matrix
 */
export function staticTransformToMatrix4(
  staticTransform: StaticTransform
): Matrix4 {
  const matrix = new Matrix4();
  const position = new Vector3(
    staticTransform.translation[0],
    staticTransform.translation[1],
    staticTransform.translation[2]
  );
  // Normalize quaternion to ensure valid rotation (handles floating point errors)
  const quaternion = new Quaternion(
    staticTransform.quaternion[0],
    staticTransform.quaternion[1],
    staticTransform.quaternion[2],
    staticTransform.quaternion[3]
  ).normalize();

  matrix.compose(position, quaternion, new Vector3(1, 1, 1));
  return matrix;
}

/**
 * Computes optimal frustum depth based on scene bounding box.
 * The depth is scaled relative to the scene's diagonal to ensure
 * frustums are proportional to the scene size.
 *
 * @param sceneBounds - Bounding box of the entire scene (can be null)
 * @param scaleFactor - Factor to multiply the computed depth (default 0.15)
 * @returns Computed frustum depth, clamped to reasonable bounds
 */
export function computeFrustumDepth(
  sceneBounds: Box3 | null,
  scaleFactor: number = 0.1
): number {
  return FRUSTUM_DEPTH;
  // todo: need to "tune" proportionating with scene bbox more
  if (!sceneBounds || sceneBounds.isEmpty()) {
    return FRUSTUM_DEPTH;
  }

  const size = sceneBounds.getSize(new Vector3());
  const diagonal = Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2);

  // Scale depth based on scene diagonal
  const depth = diagonal * scaleFactor;

  // Clamp to reasonable bounds
  return Math.max(FRUSTUM_MIN_DEPTH, Math.min(FRUSTUM_MAX_DEPTH, depth));
}

/**
 * Computes the frustum corner points from intrinsics using pinhole camera projection.
 * Properly handles off-center principal points for asymmetric frustums.
 *
 * @param intrinsics - Camera intrinsics (optional)
 * @param depth - Distance to far plane
 * @param imageAspectRatio - Optional aspect ratio from actual image (overrides intrinsics)
 * @returns Array of 8 corner positions: [near plane (4), far plane (4)]
 */
export function computeFrustumCorners(
  intrinsics: CameraIntrinsics | null,
  depth: number,
  imageAspectRatio?: number
): {
  nearCorners: Vector3[];
  farCorners: Vector3[];
  farPlaneWidth: number;
  farPlaneHeight: number;
} {
  // If we have full intrinsics, use pinhole camera projection for accurate asymmetric frustum
  if (
    intrinsics &&
    intrinsics.fx &&
    intrinsics.fy &&
    intrinsics.width &&
    intrinsics.height
  ) {
    const { fx, fy, cx, cy, width, height } = intrinsics;

    // Compute corners using pinhole camera model
    // A pixel (u, v) projects to ray direction: ((u - cx) / fx, (v - cy) / fy, 1)
    // At depth d, the 3D point is: (d * (u - cx) / fx, d * (v - cy) / fy, d)
    //
    // Image corners (in pixel coordinates):
    // - Top-left: (0, 0)
    // - Top-right: (width, 0)
    // - Bottom-right: (width, height)
    // - Bottom-left: (0, height)

    const computeCornerAt = (u: number, v: number, d: number): Vector3 => {
      return new Vector3((d * (u - cx)) / fx, (d * (v - cy)) / fy, d);
    };

    // Near plane corners (CV convention: X=right, Y=down, Z=forward)
    // Order: top-left, top-right, bottom-right, bottom-left
    const nearCorners = [
      computeCornerAt(0, 0, FRUSTUM_NEAR_PLANE_DISTANCE), // top-left
      computeCornerAt(width, 0, FRUSTUM_NEAR_PLANE_DISTANCE), // top-right
      computeCornerAt(width, height, FRUSTUM_NEAR_PLANE_DISTANCE), // bottom-right
      computeCornerAt(0, height, FRUSTUM_NEAR_PLANE_DISTANCE), // bottom-left
    ];

    // Far plane corners
    const farCorners = [
      computeCornerAt(0, 0, depth), // top-left
      computeCornerAt(width, 0, depth), // top-right
      computeCornerAt(width, height, depth), // bottom-right
      computeCornerAt(0, height, depth), // bottom-left
    ];

    // Compute far plane dimensions (may be asymmetric, so use actual corner distances)
    const farPlaneWidth = farCorners[1].x - farCorners[0].x;
    const farPlaneHeight = farCorners[3].y - farCorners[0].y;

    return {
      nearCorners,
      farCorners,
      farPlaneWidth,
      farPlaneHeight,
    };
  }

  // Fallback: use FOV-based symmetric frustum when full intrinsics unavailable
  let fovY: number;
  let aspectRatio: number;

  if (intrinsics && intrinsics.fx && intrinsics.fy) {
    // Compute vertical FOV from focal length
    // FOV = 2 * atan(sensorHeight / (2 * fy))
    // Assuming cy * 2 approximates sensor height
    const sensorHeight = intrinsics.height ?? intrinsics.cy * 2;
    fovY = 2 * Math.atan(sensorHeight / (2 * intrinsics.fy));

    // Compute aspect ratio from focal lengths
    aspectRatio = intrinsics.fx / intrinsics.fy;
  } else {
    fovY = (FRUSTUM_DEFAULT_FOV_DEGREES * Math.PI) / 180;
    aspectRatio = FRUSTUM_DEFAULT_ASPECT_RATIO;
  }

  // Override with image aspect ratio if provided (most accurate)
  if (imageAspectRatio !== undefined && imageAspectRatio > 0) {
    aspectRatio = imageAspectRatio;
  }

  // Compute half-dimensions at each plane distance
  const nearHalfHeight = Math.tan(fovY / 2) * FRUSTUM_NEAR_PLANE_DISTANCE;
  const nearHalfWidth = nearHalfHeight * aspectRatio;
  const farHalfHeight = Math.tan(fovY / 2) * depth;
  const farHalfWidth = farHalfHeight * aspectRatio;

  // Near plane corners (looking down +Z axis, computer vision convention)
  // In CV convention: X=right, Y=down, Z=forward
  // Order: top-left, top-right, bottom-right, bottom-left
  const nearCorners = [
    new Vector3(-nearHalfWidth, -nearHalfHeight, FRUSTUM_NEAR_PLANE_DISTANCE),
    new Vector3(nearHalfWidth, -nearHalfHeight, FRUSTUM_NEAR_PLANE_DISTANCE),
    new Vector3(nearHalfWidth, nearHalfHeight, FRUSTUM_NEAR_PLANE_DISTANCE),
    new Vector3(-nearHalfWidth, nearHalfHeight, FRUSTUM_NEAR_PLANE_DISTANCE),
  ];

  // Far plane corners
  const farCorners = [
    new Vector3(-farHalfWidth, -farHalfHeight, depth),
    new Vector3(farHalfWidth, -farHalfHeight, depth),
    new Vector3(farHalfWidth, farHalfHeight, depth),
    new Vector3(-farHalfWidth, farHalfHeight, depth),
  ];

  return {
    nearCorners,
    farCorners,
    farPlaneWidth: farHalfWidth * 2,
    farPlaneHeight: farHalfHeight * 2,
  };
}

/**
 * Builds complete frustum geometry from camera parameters.
 *
 * @param staticTransform - Static transform for transformation
 * @param intrinsics - Camera intrinsics for shape (optional)
 * @param depth - Frustum depth (distance from camera to far plane)
 * @param imageAspectRatio - Optional aspect ratio from actual image (overrides intrinsics)
 * @returns FrustumGeometry with all data needed for rendering
 */
export function buildFrustumGeometry(
  staticTransform: StaticTransform,
  intrinsics: CameraIntrinsics | null,
  depth: number,
  imageAspectRatio?: number
): FrustumGeometry {
  const { nearCorners, farCorners, farPlaneWidth, farPlaneHeight } =
    computeFrustumCorners(intrinsics, depth, imageAspectRatio);

  // Build corners array: [near0, near1, near2, near3, far0, far1, far2, far3]
  const allCorners = [...nearCorners, ...farCorners];
  const corners = new Float32Array(allCorners.length * 3);
  allCorners.forEach((corner, i) => {
    corners[i * 3] = corner.x;
    corners[i * 3 + 1] = corner.y;
    corners[i * 3 + 2] = corner.z;
  });

  // Line indices for wireframe:
  // - Near plane edges (4 lines): 0-1, 1-2, 2-3, 3-0
  // - Far plane edges (4 lines): 4-5, 5-6, 6-7, 7-4
  // - Connecting edges (4 lines): 0-4, 1-5, 2-6, 3-7
  const lineIndices = [
    // Near plane
    0, 1, 1, 2, 2, 3, 3, 0,
    // Far plane
    4, 5, 5, 6, 6, 7, 7, 4,
    // Connecting edges
    0, 4, 1, 5, 2, 6, 3, 7,
  ];

  // Far plane corners for the mesh (in world space)
  const farPlaneCornerPositions: [number, number, number][] = farCorners.map(
    (c) => [c.x, c.y, c.z]
  );

  // Compute transformation matrix
  const transform = staticTransformToMatrix4(staticTransform);

  return {
    corners,
    lineIndices,
    farPlaneCorners: farPlaneCornerPositions,
    depth,
    farPlaneWidth,
    farPlaneHeight,
    transform,
  };
}

/**
 * Validates if static transform data is usable for frustum rendering.
 *
 * @param staticTransform - Static transform to validate
 * @returns true if static transform can be used for rendering
 */
export function isValidStaticTransform(
  staticTransform: StaticTransform | null
): staticTransform is StaticTransform {
  if (!staticTransform) return false;

  const { translation, quaternion } = staticTransform;

  // Check translation is valid array of 3 numbers
  if (
    !Array.isArray(translation) ||
    translation.length !== 3 ||
    translation.some((v) => typeof v !== "number" || !Number.isFinite(v))
  ) {
    return false;
  }

  // Check quaternion is valid array of 4 numbers
  if (
    !Array.isArray(quaternion) ||
    quaternion.length !== 4 ||
    quaternion.some((v) => typeof v !== "number" || !Number.isFinite(v))
  ) {
    return false;
  }

  return true;
}

/**
 * Gets the camera origin position from static transform.
 *
 * @param staticTransform - Static transform
 * @returns Vector3 position of camera origin
 */
export function getCameraPosition(staticTransform: StaticTransform): Vector3 {
  return new Vector3(
    staticTransform.translation[0],
    staticTransform.translation[1],
    staticTransform.translation[2]
  );
}
