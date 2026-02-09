import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { staticTransformToMatrix4 } from "../../frustum/builders";
import type { CameraIntrinsics, FrustumData } from "../../frustum/types";
import type { CuboidTransformData, PolylineTransformData } from "../types";
import type {
  CuboidProjectionData,
  PolylineProjectionData,
  ProjectedCorner,
} from "./types";

/** 12 edges of a cuboid, as pairs of corner indices. */
export const CUBOID_EDGES: [number, number][] = [
  // bottom face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  // top face
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  // verticals
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/**
 * Compute the 8 world-space corners of a cuboid.
 */
export function getCuboidWorldCorners(
  location: [number, number, number],
  dimensions: [number, number, number],
  rotation?: [number, number, number],
  quaternion?: [number, number, number, number]
): Vector3[] {
  const [w, h, d] = dimensions;
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;

  const corners = [
    new Vector3(-hw, -hh, -hd),
    new Vector3(+hw, -hh, -hd),
    new Vector3(+hw, +hh, -hd),
    new Vector3(-hw, +hh, -hd),
    new Vector3(-hw, -hh, +hd),
    new Vector3(+hw, -hh, +hd),
    new Vector3(+hw, +hh, +hd),
    new Vector3(-hw, +hh, +hd),
  ];

  let q: Quaternion;

  if (quaternion) {
    q = new Quaternion(
      quaternion[0],
      quaternion[1],
      quaternion[2],
      quaternion[3]
    );
  } else if (rotation) {
    q = new Quaternion().setFromEuler(
      new Euler(rotation[0], rotation[1], rotation[2])
    );
  } else {
    q = new Quaternion();
  }

  const center = new Vector3(location[0], location[1], location[2]);

  return corners.map((c) => {
    c.applyQuaternion(q);
    c.add(center);
    return c;
  });
}

/**
 * Project a world-space point to pixel coordinates using camera extrinsics + intrinsics.
 */
export function projectToPixel(
  worldPoint: Vector3,
  worldToCam: Matrix4,
  intrinsics: CameraIntrinsics
): ProjectedCorner | null {
  const camPt = worldPoint.clone().applyMatrix4(worldToCam);

  // point must be in front of camera (z > 0 in CV convention)
  if (camPt.z <= 0) return null;

  const u = intrinsics.fx * (camPt.x / camPt.z) + intrinsics.cx;
  const v = intrinsics.fy * (camPt.y / camPt.z) + intrinsics.cy;

  return { u, v, z: camPt.z };
}

/**
 * Compute projected edges and corners for a cuboid label.
 *
 * Returns null if frustum data is incomplete or all corners are behind the camera.
 */
export function computeCuboidProjection(
  label: CuboidTransformData,
  frustumData: FrustumData
): CuboidProjectionData | null {
  if (!frustumData.intrinsics || !frustumData.staticTransform) return null;

  const { intrinsics, staticTransform } = frustumData;

  const corners = getCuboidWorldCorners(
    label.location,
    label.dimensions,
    label.rotation,
    label.quaternion
  );

  const camToWorld = staticTransformToMatrix4(staticTransform);
  const worldToCam = camToWorld.clone().invert();

  const projected = corners.map((c) =>
    projectToPixel(c, worldToCam, intrinsics)
  );

  const edges: CuboidProjectionData["edges"] = [];
  for (const [i, j] of CUBOID_EDGES) {
    const p1 = projected[i];
    const p2 = projected[j];
    if (p1 && p2) {
      edges.push({ x1: p1.u, y1: p1.v, x2: p2.u, y2: p2.v });
    }
  }

  if (edges.length === 0) return null;

  return { edges, corners: projected };
}

/**
 * Compute projected edges and vertices for a polyline label.
 *
 * Returns null if frustum data is incomplete or no valid edges can be produced.
 */
export function computePolylineProjection(
  label: PolylineTransformData,
  frustumData: FrustumData
): PolylineProjectionData | null {
  if (!frustumData.intrinsics || !frustumData.staticTransform) return null;

  const { intrinsics, staticTransform } = frustumData;

  const camToWorld = staticTransformToMatrix4(staticTransform);
  const worldToCam = camToWorld.clone().invert();

  const allVertices: (ProjectedCorner | null)[] = [];
  const edges: PolylineProjectionData["edges"] = [];

  for (const segment of label.points3d) {
    const projected = segment.map((pt) =>
      projectToPixel(new Vector3(pt[0], pt[1], pt[2]), worldToCam, intrinsics)
    );

    allVertices.push(...projected);

    // Connect consecutive points within the segment
    for (let i = 0; i < projected.length - 1; i++) {
      const p1 = projected[i];
      const p2 = projected[i + 1];
      if (p1 && p2) {
        edges.push({ x1: p1.u, y1: p1.v, x2: p2.u, y2: p2.v });
      }
    }

    // If closed, add edge from last to first point
    if (label.closed && projected.length >= 2) {
      const pFirst = projected[0];
      const pLast = projected[projected.length - 1];
      if (pFirst && pLast) {
        edges.push({
          x1: pLast.u,
          y1: pLast.v,
          x2: pFirst.u,
          y2: pFirst.v,
        });
      }
    }
  }

  if (edges.length === 0) return null;

  return { edges, vertices: allVertices };
}
