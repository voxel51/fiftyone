/**
 * Pure functions for frustum geometry calculation.
 * These functions are isolated from React and Three.js for testability.
 */

import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import type {
  CameraExtrinsics,
  CameraIntrinsics,
  FrustumGeometry,
} from "./types";

/** Static frustum depth */
const STATIC_FRUSTUM_DEPTH = 1;

/** Minimum frustum depth to ensure visibility */
const MIN_FRUSTUM_DEPTH = 0.5;

/** Maximum frustum depth to prevent overwhelming the scene */
const MAX_FRUSTUM_DEPTH = 50;

/** Default near plane distance (small offset from camera origin) */
const NEAR_PLANE_DISTANCE = 0.01;

/** Default field of view for frustum calculation when intrinsics unavailable */
const DEFAULT_FOV_DEGREES = 60;

/** Default aspect ratio when intrinsics unavailable */
const DEFAULT_ASPECT_RATIO = 16 / 9;

/**
 * Converts camera extrinsics to a Three.js transformation matrix.
 *
 * @param extrinsics - Camera extrinsics with translation and quaternion
 * @returns Matrix4 transformation matrix
 */
export function extrinsicsToMatrix4(extrinsics: CameraExtrinsics): Matrix4 {
  const matrix = new Matrix4();
  const position = new Vector3(
    extrinsics.translation[0],
    extrinsics.translation[1],
    extrinsics.translation[2]
  );
  // Normalize quaternion to ensure valid rotation (handles floating point errors)
  const quaternion = new Quaternion(
    extrinsics.quaternion[0],
    extrinsics.quaternion[1],
    extrinsics.quaternion[2],
    extrinsics.quaternion[3]
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
  scaleFactor: number = 0.15
): number {
  return STATIC_FRUSTUM_DEPTH;
  // todo: need to "tune" proportionating with scene bbox more
  if (!sceneBounds || sceneBounds.isEmpty()) {
    return STATIC_FRUSTUM_DEPTH;
  }

  const size = sceneBounds.getSize(new Vector3());
  const diagonal = Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2);

  // Scale depth based on scene diagonal
  const depth = diagonal * scaleFactor;

  // Clamp to reasonable bounds
  return Math.max(MIN_FRUSTUM_DEPTH, Math.min(MAX_FRUSTUM_DEPTH, depth));
}

/**
 * Computes the frustum corner points from intrinsics.
 * Returns corners for both near and far planes.
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
  // Compute FOV and aspect from intrinsics or use defaults
  let fovY: number;
  let aspectRatio: number;

  if (intrinsics && intrinsics.fx && intrinsics.fy) {
    // Compute vertical FOV from focal length
    // FOV = 2 * atan(sensorHeight / (2 * fy))
    // Assuming cy * 2 approximates sensor height
    const sensorHeight = intrinsics.height ?? intrinsics.cy * 2;
    fovY = 2 * Math.atan(sensorHeight / (2 * intrinsics.fy));

    // Compute aspect ratio from sensor dimensions or focal lengths
    if (intrinsics.width && intrinsics.height) {
      aspectRatio = intrinsics.width / intrinsics.height;
    } else {
      aspectRatio = intrinsics.fx / intrinsics.fy;
    }
  } else {
    fovY = (DEFAULT_FOV_DEGREES * Math.PI) / 180;
    aspectRatio = DEFAULT_ASPECT_RATIO;
  }

  // Override with image aspect ratio if provided (most accurate)
  if (imageAspectRatio !== undefined && imageAspectRatio > 0) {
    aspectRatio = imageAspectRatio;
  }

  // Compute half-dimensions at each plane distance
  const nearHalfHeight = Math.tan(fovY / 2) * NEAR_PLANE_DISTANCE;
  const nearHalfWidth = nearHalfHeight * aspectRatio;
  const farHalfHeight = Math.tan(fovY / 2) * depth;
  const farHalfWidth = farHalfHeight * aspectRatio;

  // Near plane corners (looking down +Z axis, computer vision convention)
  // In CV convention: X=right, Y=down, Z=forward
  // Order: top-left, top-right, bottom-right, bottom-left
  const nearCorners = [
    new Vector3(-nearHalfWidth, -nearHalfHeight, NEAR_PLANE_DISTANCE),
    new Vector3(nearHalfWidth, -nearHalfHeight, NEAR_PLANE_DISTANCE),
    new Vector3(nearHalfWidth, nearHalfHeight, NEAR_PLANE_DISTANCE),
    new Vector3(-nearHalfWidth, nearHalfHeight, NEAR_PLANE_DISTANCE),
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
 * @param extrinsics - Camera extrinsics for transformation
 * @param intrinsics - Camera intrinsics for shape (optional)
 * @param depth - Frustum depth (distance from camera to far plane)
 * @param imageAspectRatio - Optional aspect ratio from actual image (overrides intrinsics)
 * @returns FrustumGeometry with all data needed for rendering
 */
export function buildFrustumGeometry(
  extrinsics: CameraExtrinsics,
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
  const transform = extrinsicsToMatrix4(extrinsics);

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
 * Validates if extrinsics data is usable for frustum rendering.
 *
 * @param extrinsics - Camera extrinsics to validate
 * @returns true if extrinsics can be used for rendering
 */
export function isValidExtrinsics(
  extrinsics: CameraExtrinsics | null
): extrinsics is CameraExtrinsics {
  if (!extrinsics) return false;

  const { translation, quaternion } = extrinsics;

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
 * Gets the camera origin position from extrinsics.
 *
 * @param extrinsics - Camera extrinsics
 * @returns Vector3 position of camera origin
 */
export function getCameraPosition(extrinsics: CameraExtrinsics): Vector3 {
  return new Vector3(
    extrinsics.translation[0],
    extrinsics.translation[1],
    extrinsics.translation[2]
  );
}
