import { MathUtils, Vector3 } from "three";
import { DEFAULT_POINT_CLOUD_CAMERA_PROJECTION } from "../../../../visualization/scene-3d/camera-fit-bounds";
import type {
  PointCloudCameraPose,
  PointCloudCameraProjection,
} from "../../../../visualization/scene-3d/types";
import type { Episode3dSceneUpAxis } from "../../spatial/view-preferences";
import type { Episode3dCameraNavigationMode } from "./episode-3d-view-state";

const MIN_CAMERA_DISTANCE = 0.001;
const MAX_CAMERA_DISTANCE = 1e9;
const MIN_ELEVATION_DEGREES = -89.9;
const MAX_ELEVATION_DEGREES = 89.9;
const MIN_FOV_DEGREES = 5;
const MAX_FOV_DEGREES = 150;
const MIN_NEAR = 0.0001;
const MAX_FAR = 1e9;
const MAX_NEAR = MAX_FAR / 2;
const CAMERA_VALUE_EPSILON = 1e-9;

/** Human-readable orbit representation of a point-cloud camera pose. */
export interface Episode3dCameraOrbit {
  readonly azimuthDegrees: number;
  readonly distance: number;
  readonly elevationDegrees: number;
  readonly target: readonly [number, number, number];
}

/** Reactive camera values shown by the Viewpoint settings panel. */
export interface Episode3dViewpointSnapshot {
  readonly cameraNavigationMode: Episode3dCameraNavigationMode;
  readonly pose: PointCloudCameraPose | null;
  readonly projection: PointCloudCameraProjection;
  readonly sceneUpAxis: Episode3dSceneUpAxis;
}

/** External store that publishes live camera values without tile rerenders. */
export interface Episode3dViewpointStore {
  getSnapshot(): Episode3dViewpointSnapshot;
  publish(patch: Partial<Episode3dViewpointSnapshot>): void;
  subscribe(listener: () => void): () => void;
}

/** Converts a Cartesian camera pose into target, distance, and orbit angles. */
export function cameraOrbitFromPose(
  pose: PointCloudCameraPose,
  sceneUpAxis: Episode3dSceneUpAxis,
): Episode3dCameraOrbit {
  const target = new Vector3(...pose.target);
  const offset = new Vector3(...pose.position).sub(target);
  const distance = offset.length();
  if (!Number.isFinite(distance) || distance < MIN_CAMERA_DISTANCE) {
    return {
      azimuthDegrees: 0,
      distance: MIN_CAMERA_DISTANCE,
      elevationDegrees: 0,
      target: pose.target,
    };
  }

  const up = sceneUpVector(sceneUpAxis);
  const normalized = offset.clone().multiplyScalar(1 / distance);
  const vertical = Math.max(-1, Math.min(1, normalized.dot(up)));
  const horizontal = normalized.addScaledVector(up, -vertical);
  const reference = azimuthReference(sceneUpAxis);
  const azimuthRadians =
    horizontal.lengthSq() > CAMERA_VALUE_EPSILON
      ? Math.atan2(
          new Vector3().crossVectors(reference, horizontal).dot(up),
          reference.dot(horizontal),
        )
      : 0;

  return {
    azimuthDegrees: MathUtils.radToDeg(azimuthRadians),
    distance,
    elevationDegrees: MathUtils.radToDeg(Math.asin(vertical)),
    target: pose.target,
  };
}

/** Converts target, distance, and orbit angles into a Cartesian camera pose. */
export function cameraPoseFromOrbit(
  orbit: Episode3dCameraOrbit,
  sceneUpAxis: Episode3dSceneUpAxis,
): PointCloudCameraPose {
  const distance = clampFinite(
    orbit.distance,
    MIN_CAMERA_DISTANCE,
    MAX_CAMERA_DISTANCE,
    MIN_CAMERA_DISTANCE,
  );
  const elevationRadians = MathUtils.degToRad(
    clampFinite(
      orbit.elevationDegrees,
      MIN_ELEVATION_DEGREES,
      MAX_ELEVATION_DEGREES,
      0,
    ),
  );
  const azimuthRadians = MathUtils.degToRad(
    Number.isFinite(orbit.azimuthDegrees) ? orbit.azimuthDegrees : 0,
  );
  const up = sceneUpVector(sceneUpAxis);
  const horizontal = azimuthReference(sceneUpAxis).applyAxisAngle(
    up,
    azimuthRadians,
  );
  const offset = horizontal
    .multiplyScalar(Math.cos(elevationRadians) * distance)
    .addScaledVector(up, Math.sin(elevationRadians) * distance);
  const target = finiteTuple(orbit.target, [0, 0, 0]);
  const position = new Vector3(...target).add(offset);

  return { position: [position.x, position.y, position.z], target };
}

/** Clamps perspective projection parameters to safe renderer bounds. */
export function normalizeEpisode3dCameraProjection(
  projection: PointCloudCameraProjection,
): PointCloudCameraProjection {
  const near = clampFinite(
    projection.near,
    MIN_NEAR,
    MAX_NEAR,
    DEFAULT_POINT_CLOUD_CAMERA_PROJECTION.near,
  );
  const minimumFar = near + Math.max(MIN_NEAR, near * 0.001);
  const far =
    Number.isFinite(projection.far) && projection.far >= minimumFar
      ? Math.min(MAX_FAR, projection.far)
      : Math.max(DEFAULT_POINT_CLOUD_CAMERA_PROJECTION.far, minimumFar);

  return {
    far,
    fovDegrees: clampFinite(
      projection.fovDegrees,
      MIN_FOV_DEGREES,
      MAX_FOV_DEGREES,
      DEFAULT_POINT_CLOUD_CAMERA_PROJECTION.fovDegrees,
    ),
    near,
  };
}

/** Creates an external store for one mounted 3D tile's live viewpoint. */
export function createEpisode3dViewpointStore(
  initial: Episode3dViewpointSnapshot,
): Episode3dViewpointStore {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    publish: (patch) => {
      const next = { ...snapshot, ...patch };
      if (viewpointSnapshotsEqual(snapshot, next)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function sceneUpVector(axis: Episode3dSceneUpAxis): Vector3 {
  switch (axis) {
    case "x":
      return new Vector3(1, 0, 0);
    case "y":
      return new Vector3(0, 1, 0);
    default:
      return new Vector3(0, 0, 1);
  }
}

function azimuthReference(axis: Episode3dSceneUpAxis): Vector3 {
  return axis === "x" ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
}

function clampFinite(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  return Math.max(
    min,
    Math.min(max, Number.isFinite(value) ? value : fallback),
  );
}

function finiteTuple(
  value: readonly [number, number, number],
  fallback: readonly [number, number, number],
): readonly [number, number, number] {
  return value.every(Number.isFinite) ? value : fallback;
}

function viewpointSnapshotsEqual(
  a: Episode3dViewpointSnapshot,
  b: Episode3dViewpointSnapshot,
): boolean {
  return (
    a.cameraNavigationMode === b.cameraNavigationMode &&
    a.sceneUpAxis === b.sceneUpAxis &&
    cameraPosesEqual(a.pose, b.pose) &&
    a.projection.fovDegrees === b.projection.fovDegrees &&
    a.projection.near === b.projection.near &&
    a.projection.far === b.projection.far
  );
}

function cameraPosesEqual(
  a: PointCloudCameraPose | null,
  b: PointCloudCameraPose | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    tupleAlmostEqual(a.position, b.position) &&
    tupleAlmostEqual(a.target, b.target)
  );
}

function tupleAlmostEqual(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): boolean {
  return a.every(
    (value, index) => Math.abs(value - b[index]) <= CAMERA_VALUE_EPSILON,
  );
}
