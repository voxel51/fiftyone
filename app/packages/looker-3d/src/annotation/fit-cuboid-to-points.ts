import * as THREE from "three";
import type { CuboidTransformData } from "./types";

/**
 * A point cloud sampled from the live scene: a flat [x, y, z, x, y, z, ...]
 * position buffer plus the world matrix that places those local positions in
 * world space.
 */
export interface ScenePointCloud {
  positions: ArrayLike<number>;
  matrixWorld: THREE.Matrix4;
}

export interface FitCuboidOptions {
  /**
   * Minimum number of enclosed points required before we trust the measured
   * extent. Below this we leave the gestured cuboid untouched.
   */
  minPoints?: number;
  /**
   * Padding (in world units) added above and below the measured point extent so
   * the box doesn't visually clip the outermost points.
   */
  heightMargin?: number;
}

const DEFAULT_MIN_POINTS = 8;
const DEFAULT_HEIGHT_MARGIN = 0.05;
const MIN_HEIGHT = 0.1;

/**
 * Refine a freshly gestured cuboid by deriving its height and vertical center
 * from the point-cloud points that fall within its horizontal footprint.
 *
 * During creation the user sets the cuboid's center, heading, and width by
 * clicking, which fully determines the footprint (the local X/Y extent) and
 * orientation — but not the height, which is otherwise a hardcoded default that
 * forces a manual resize on every box. This measures the local-Z span (the
 * cuboid's height axis, aligned with the annotation-plane normal) of the points
 * sitting inside that footprint and snaps the box to it: the bottom drops to the
 * lowest enclosed point and the top rises to the highest (plus a small margin).
 *
 * The gestured length, width, and orientation are preserved — only the height
 * dimension and the center's position along the height axis change. When too few
 * points fall inside the footprint (sparse regions, empty space) the original
 * transform is returned unchanged.
 *
 * Note: this scans every point of every supplied cloud once. That is fine for a
 * discrete commit action (it runs once when a cuboid is placed, not per frame).
 */
export const fitCuboidHeightToPoints = (
  transform: CuboidTransformData,
  pointClouds: ScenePointCloud[],
  options: FitCuboidOptions = {},
): CuboidTransformData => {
  const {
    minPoints = DEFAULT_MIN_POINTS,
    heightMargin = DEFAULT_HEIGHT_MARGIN,
  } = options;

  if (!transform.quaternion || pointClouds.length === 0) {
    return transform;
  }

  const center = new THREE.Vector3().fromArray(transform.location);
  const quaternion = new THREE.Quaternion().fromArray(transform.quaternion);
  const [length, width] = transform.dimensions;

  const halfLength = length / 2;
  const halfWidth = width / 2;

  if (halfLength <= 0 || halfWidth <= 0) {
    return transform;
  }

  // Box-local frame: local X spans `length`, local Y spans `width`, local Z is
  // the height axis. worldToBox brings world points into that frame.
  const boxToWorld = new THREE.Matrix4().compose(
    center,
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );
  const worldToBox = boxToWorld.clone().invert();

  // Combine each cloud's world matrix with worldToBox so each point only needs a
  // single matrix application to reach box-local space.
  const point = new THREE.Vector3();
  let count = 0;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const pc of pointClouds) {
    const { positions, matrixWorld } = pc;
    const localToBox = worldToBox.clone().multiply(matrixWorld);

    for (let i = 0; i + 2 < positions.length; i += 3) {
      point
        .set(positions[i], positions[i + 1], positions[i + 2])
        .applyMatrix4(localToBox);

      // Inside the horizontal footprint? Height (Z) is intentionally unbounded
      // so we capture the full vertical column of the object.
      if (Math.abs(point.x) <= halfLength && Math.abs(point.y) <= halfWidth) {
        count += 1;
        if (point.z < minZ) minZ = point.z;
        if (point.z > maxZ) maxZ = point.z;
      }
    }
  }

  if (count < minPoints || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return transform;
  }

  const measuredHeight = maxZ - minZ;
  const newHeight = Math.max(measuredHeight + 2 * heightMargin, MIN_HEIGHT);

  // Midpoint of the measured span in box-local Z; shift the center along the
  // (world-space) local Z axis so the box wraps the points symmetrically.
  const centerZLocal = (minZ + maxZ) / 2;
  const localZAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const newCenter = center.clone().addScaledVector(localZAxis, centerZLocal);

  return {
    ...transform,
    location: newCenter.toArray() as [number, number, number],
    dimensions: [transform.dimensions[0], transform.dimensions[1], newHeight],
  };
};
