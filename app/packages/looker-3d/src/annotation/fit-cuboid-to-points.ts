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
  /**
   * How far (in world units) below the annotation plane a point may sit and
   * still count as part of the object. The plane is a soft anchor, not a hard
   * floor: points within this margin pull the box down (objects that dip just
   * below the reference), while points further below are treated as ground bleed
   * or noise and dropped.
   */
  belowMargin?: number;
  /**
   * Percentile used for the bottom of the box. A small non-zero value rejects a
   * few stray low points without lifting off the real base.
   */
  lowPercentile?: number;
  /**
   * Percentile used for the top of the box, so a lone high outlier (antenna,
   * speckle) doesn't balloon the height.
   */
  highPercentile?: number;
}

const DEFAULT_MIN_POINTS = 8;
const DEFAULT_HEIGHT_MARGIN = 0.05;
const DEFAULT_BELOW_MARGIN = 0.5;
const DEFAULT_LOW_PERCENTILE = 2;
const DEFAULT_HIGH_PERCENTILE = 98;
const MIN_HEIGHT = 0.1;

const percentileOfSorted = (
  sortedAsc: number[],
  percentile: number,
): number => {
  const n = sortedAsc.length;
  if (n === 0) {
    return Number.NaN;
  }
  if (n === 1) {
    return sortedAsc[0];
  }
  const index = Math.round((percentile / 100) * (n - 1));
  return sortedAsc[Math.min(n - 1, Math.max(0, index))];
};

/**
 * Refine a freshly gestured cuboid by deriving its height and vertical center
 * from the point-cloud points that fall within its horizontal footprint.
 *
 * During creation the user sets the cuboid's center, heading, and width by
 * clicking, which fully determines the footprint (the local X/Y extent) and
 * orientation — but not the height, which is otherwise a hardcoded default that
 * forces a manual resize on every box. This measures the local-Z span (the
 * cuboid's height axis, aligned with the annotation-plane normal) of the points
 * sitting inside that footprint and snaps the box to it.
 *
 * The annotation plane is treated as a *soft anchor*: because the footprint
 * clicks land on it, the box center sits on it, so local Z = 0 is the plane.
 * Points more than `belowMargin` below the plane are dropped as ground bleed /
 * outliers, and the top and bottom of the box are taken from robust percentiles
 * of the remaining points rather than the raw min/max, so a single stray point
 * can't balloon or sink the box. The gestured length, width, and orientation are
 * preserved — only the height dimension and the center's position along the
 * height axis change. When too few points survive the footprint and plane
 * filters, the original transform is returned unchanged.
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
    belowMargin = DEFAULT_BELOW_MARGIN,
    lowPercentile = DEFAULT_LOW_PERCENTILE,
    highPercentile = DEFAULT_HIGH_PERCENTILE,
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
  // the height axis with the annotation plane at z = 0. worldToBox brings world
  // points into that frame.
  const boxToWorld = new THREE.Matrix4().compose(
    center,
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );
  const worldToBox = boxToWorld.clone().invert();

  const point = new THREE.Vector3();
  const enclosedZs: number[] = [];

  for (const pc of pointClouds) {
    const { positions, matrixWorld } = pc;
    // Combine each cloud's world matrix with worldToBox so each point only needs
    // a single matrix application to reach box-local space.
    const localToBox = worldToBox.clone().multiply(matrixWorld);

    for (let i = 0; i + 2 < positions.length; i += 3) {
      point
        .set(positions[i], positions[i + 1], positions[i + 2])
        .applyMatrix4(localToBox);

      // Inside the horizontal footprint? Height (Z) is unbounded above so we
      // capture the full column, but bounded below by the plane's soft anchor.
      if (
        Math.abs(point.x) <= halfLength &&
        Math.abs(point.y) <= halfWidth &&
        point.z >= -belowMargin
      ) {
        enclosedZs.push(point.z);
      }
    }
  }

  if (enclosedZs.length < minPoints) {
    return transform;
  }

  enclosedZs.sort((a, b) => a - b);
  const bottomZ = percentileOfSorted(enclosedZs, lowPercentile);
  const topZ = percentileOfSorted(enclosedZs, highPercentile);

  if (!Number.isFinite(bottomZ) || !Number.isFinite(topZ)) {
    return transform;
  }

  const measuredHeight = topZ - bottomZ;
  const newHeight = Math.max(measuredHeight + 2 * heightMargin, MIN_HEIGHT);

  // Midpoint of the measured span in box-local Z; shift the center along the
  // (world-space) local Z axis so the box wraps the points symmetrically.
  const centerZLocal = (bottomZ + topZ) / 2;
  const localZAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const newCenter = center.clone().addScaledVector(localZAxis, centerZLocal);

  return {
    ...transform,
    location: newCenter.toArray() as [number, number, number],
    dimensions: [transform.dimensions[0], transform.dimensions[1], newHeight],
  };
};
