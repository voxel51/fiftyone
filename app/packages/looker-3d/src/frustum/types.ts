/**
 * TypeScript interfaces for camera frustum visualization.
 */

import type { Matrix4 } from "three";

/**
 * Camera extrinsics (pose) data from the API.
 * Represents a rigid 3D transformation (translation + rotation).
 */
export interface CameraExtrinsics {
  /** Translation vector [tx, ty, tz] */
  translation: [number, number, number];
  /** Quaternion [qx, qy, qz, qw] in scalar-last convention */
  quaternion: [number, number, number, number];
  /** Source coordinate frame name */
  source_frame?: string;
  /** Target coordinate frame name */
  target_frame?: string;
}

/**
 * Camera intrinsics data from the API.
 * Contains focal length and principal point for computing projection.
 */
export interface CameraIntrinsics {
  /** Focal length in pixels (x-axis) */
  fx: number;
  /** Focal length in pixels (y-axis) */
  fy: number;
  /** Principal point x-coordinate in pixels */
  cx: number;
  /** Principal point y-coordinate in pixels */
  cy: number;
  /** Skew coefficient (typically 0) */
  skew?: number;
  /** Image width in pixels (for aspect ratio calculation) */
  width?: number;
  /** Image height in pixels (for aspect ratio calculation) */
  height?: number;
}

/**
 * Combined frustum data for a single slice.
 */
export interface FrustumData {
  /** Name of the slice this frustum represents */
  sliceName: string;
  /** Camera extrinsics (pose) - null if not available */
  extrinsics: CameraExtrinsics | null;
  /** Camera intrinsics - null if not available */
  intrinsics: CameraIntrinsics | null;
  /** Whether there was an error fetching this slice's data */
  hasError?: boolean;
  /** Error message if hasError is true */
  errorMessage?: string;
  /** URL to the image for this slice (for texture projection) */
  imageUrl?: string;
  /** Aspect ratio of the image (width/height) for accurate frustum shape */
  imageAspectRatio?: number;
}

/**
 * Geometry data for rendering a single frustum.
 */
export interface FrustumGeometry {
  /** 8 corner vertices of the frustum (near plane + far plane) */
  corners: Float32Array;
  /** Line segment indices for wireframe rendering (pairs of vertex indices) */
  lineIndices: number[];
  /** Far plane quad vertices for the semi-transparent plane */
  farPlaneCorners: [number, number, number][];
  /** Frustum depth (distance from camera to far plane) */
  depth: number;
  /** Width of the far plane */
  farPlaneWidth: number;
  /** Height of the far plane */
  farPlaneHeight: number;
  /** Transformation matrix for positioning the frustum */
  transform: Matrix4;
}

/**
 * API response for group extrinsics endpoint.
 */
export interface GroupExtrinsicsResponse {
  group_id: string;
  results: {
    [sliceName: string]:
      | { extrinsics: CameraExtrinsics }
      | { error: string }
      | { extrinsics: null };
  };
}

/**
 * API response for group intrinsics endpoint.
 */
export interface GroupIntrinsicsResponse {
  group_id: string;
  results: {
    [sliceName: string]:
      | { intrinsics: CameraIntrinsics }
      | { error: string }
      | { intrinsics: null };
  };
}

/**
 * Hook result for useFrustumData.
 */
export interface UseFrustumDataResult {
  /** Array of frustum data for all non-current slices with valid extrinsics */
  data: FrustumData[];
  /** Whether data is currently being fetched */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Function to manually refetch data */
  refetch: () => void;
}

/**
 * Hook result for useFrustumGeometry.
 */
export interface UseFrustumGeometryResult {
  /** Map of slice name to computed frustum geometry */
  geometries: Map<string, FrustumGeometry>;
}
