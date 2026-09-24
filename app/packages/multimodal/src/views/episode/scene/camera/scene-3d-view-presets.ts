import { Quaternion, Vector3 } from "three";
import type { PointCloudCameraPose } from "../../../../visualization/scene-3d/index";
import type { Scene3dCameraTargetPose } from "./scene-3d-camera";
import {
  DEFAULT_SCENE_3D_UP_AXIS,
  type Scene3dUpAxis,
} from "../../spatial/view-preferences";
import { sceneUpVector } from "./scene-up-vector";

// Ego chase view: behind and above the selected target along its heading.
// Fixed automotive-scale offsets — the trained looker-3d "ego view" is a
// close-in vehicle-centered view, not a scene fit.
const EGO_VIEW_BACK_M = 22;
const EGO_VIEW_UP_M = 7;
// Top view preserves the user's current zoom distance, clamped to a range
// that stays useful for automotive scenes (lidar radius ~50-100m).
const TOP_VIEW_MIN_HEIGHT_M = 25;
const TOP_VIEW_MAX_HEIGHT_M = 400;
const TOP_VIEW_DEFAULT_HEIGHT_M = 80;
// Slight horizontal lean in top view: keeps OrbitControls away from the
// degenerate straight-down pole (view direction parallel to the scene-up
// vector) and pins the screen-up direction (~1 degree, visually imperceptible).
const TOP_VIEW_LEAN_RATIO = 0.02;

const HEADING_DIRECTION_EPSILON = 0.000001;

/**
 * Chase view of the selected target: camera behind its heading and above it
 * along the configured scene-up axis, looking at its position. With an identity
 * pose (ego-centric world frame) this is a deterministic behind-the-origin
 * view, matching the trained looker-3d "reset to ego view" behavior.
 */
export function egoViewCameraPose(
  targetPose: Scene3dCameraTargetPose,
  sceneUpAxis: Scene3dUpAxis = DEFAULT_SCENE_3D_UP_AXIS,
): PointCloudCameraPose {
  const up = sceneUpVector(sceneUpAxis);
  const forward = headingDirection(targetPose.rotation, sceneUpAxis);
  const position = targetPose.translation
    .clone()
    .addScaledVector(forward, -EGO_VIEW_BACK_M)
    .addScaledVector(up, EGO_VIEW_UP_M);

  return {
    position: [position.x, position.y, position.z],
    target: [
      targetPose.translation.x,
      targetPose.translation.y,
      targetPose.translation.z,
    ],
  };
}

/**
 * Top-down view over an anchor point, preserving the current orbit distance
 * (clamped) so T reads as "rotate my view to bird's-eye", not a zoom reset.
 * The camera leans slightly along the negated heading so the heading points
 * screen-up (in a near-vertical view, screen-up is the direction opposite the
 * horizontal lean); without a heading the lean defaults to south, i.e.
 * north-up for the default Z-up view.
 */
export function topViewCameraPose({
  anchor,
  currentDistance,
  rotation,
  sceneUpAxis = DEFAULT_SCENE_3D_UP_AXIS,
}: {
  readonly anchor: Vector3;
  readonly currentDistance: number | null;
  readonly rotation: Quaternion | null;
  readonly sceneUpAxis?: Scene3dUpAxis;
}): PointCloudCameraPose {
  const height = Math.min(
    TOP_VIEW_MAX_HEIGHT_M,
    Math.max(
      TOP_VIEW_MIN_HEIGHT_M,
      currentDistance ?? TOP_VIEW_DEFAULT_HEIGHT_M,
    ),
  );
  const up = sceneUpVector(sceneUpAxis);
  const lean = rotation
    ? headingDirection(rotation, sceneUpAxis)
    : defaultTopViewDirection(sceneUpAxis);
  lean.normalize().multiplyScalar(-height * TOP_VIEW_LEAN_RATIO);
  const position = anchor.clone().add(lean).addScaledVector(up, height);

  return {
    position: [position.x, position.y, position.z],
    target: [anchor.x, anchor.y, anchor.z],
  };
}

function headingDirection(
  rotation: Quaternion,
  sceneUpAxis: Scene3dUpAxis,
): Vector3 {
  const up = sceneUpVector(sceneUpAxis);
  const forward = new Vector3(1, 0, 0).applyQuaternion(rotation);
  forward.addScaledVector(up, -forward.dot(up));
  if (forward.lengthSq() <= HEADING_DIRECTION_EPSILON ** 2) {
    return fallbackForwardDirection(sceneUpAxis);
  }
  return forward.normalize();
}

function fallbackForwardDirection(sceneUpAxis: Scene3dUpAxis): Vector3 {
  return sceneUpAxis === "x" ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
}

function defaultTopViewDirection(sceneUpAxis: Scene3dUpAxis): Vector3 {
  return sceneUpAxis === "z"
    ? new Vector3(0, 1, 0)
    : fallbackForwardDirection(sceneUpAxis);
}
