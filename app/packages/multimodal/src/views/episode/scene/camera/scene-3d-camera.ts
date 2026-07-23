import { Quaternion, Vector3 } from "three";
import type {
  PointCloudCameraPose,
  PointCloudFrameTransform,
} from "../../../../visualization/scene-3d/index";
import {
  DEFAULT_SCENE_3D_UP_AXIS,
  type Scene3dUpAxis,
  type Scene3dFollowTrackingMode,
  type Scene3dTrackingMode,
} from "../../spatial/view-preferences";
import type { EpisodeHeldFrameTransform } from "../../../../runtime/frame-transform-types";
export type {
  Scene3dFollowTrackingMode,
  Scene3dTrackingMode,
} from "../../spatial/view-preferences";

const SCENE_UP_VECTORS: Record<Scene3dUpAxis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};
const HEADING_FORWARD_EPSILON = 0.000001;

/** Default tracking policy for a newly opened 3D inspection session. */
export const DEFAULT_SCENE_3D_TRACKING_MODE: Scene3dTrackingMode = "position";

export interface Scene3dCameraTargetPose {
  readonly rotation: Quaternion;
  readonly translation: Vector3;
}

export interface Scene3dCameraTrackingAnchor {
  readonly mode: Scene3dFollowTrackingMode;
  readonly relativePosition: readonly [number, number, number];
  readonly relativeTarget: readonly [number, number, number];
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly targetFrameId: string;
  readonly worldFrameId: string;
}

/**
 * Result of resolving the camera-target frame's pose in the world frame at
 * the playhead. `pending` means the transform window is still loading (the
 * camera must freeze, not fall back); `missing` means no path exists.
 */
export type CameraTargetResolution =
  | {
      readonly heldEdges?: readonly EpisodeHeldFrameTransform[];
      readonly pose: Scene3dCameraTargetPose;
      readonly status: "resolved";
    }
  | {
      readonly status: "missing" | "pending";
    };

export function isFollowTrackingMode(
  mode: Scene3dTrackingMode,
): mode is Scene3dFollowTrackingMode {
  return mode !== "free";
}

/**
 * Whether an anchor was derived under exactly the given follow configuration.
 * An anchor is only meaningful in the mode, scene-up axis, and frame pair it
 * was captured in — any mismatch means it must be re-derived, never reused.
 */
export function trackingAnchorMatches({
  anchor,
  mode,
  sceneUpAxis,
  targetFrameId,
  worldFrameId,
}: {
  readonly anchor: Scene3dCameraTrackingAnchor | null;
  readonly mode: Scene3dFollowTrackingMode;
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly targetFrameId: string;
  readonly worldFrameId: string;
}): boolean {
  return (
    anchor?.mode === mode &&
    anchor.sceneUpAxis === sceneUpAxis &&
    anchor.targetFrameId === targetFrameId &&
    anchor.worldFrameId === worldFrameId
  );
}

export function cameraTargetPoseFromFrameTransform(
  transform: PointCloudFrameTransform,
): Scene3dCameraTargetPose {
  const rotation = transform.rotation.clone();

  return {
    // A degenerate zero-length rotation normalizes to NaN and would poison
    // every downstream camera pose; treat it as identity instead.
    rotation: rotation.lengthSq() > 0 ? rotation.normalize() : new Quaternion(),
    translation: transform.translation.clone(),
  };
}

export function identityCameraTargetPose(): Scene3dCameraTargetPose {
  return {
    rotation: new Quaternion(),
    translation: new Vector3(),
  };
}

export function cameraTrackingAnchorFromPose({
  cameraPose,
  mode,
  sceneUpAxis = DEFAULT_SCENE_3D_UP_AXIS,
  targetFrameId,
  targetPose,
  worldFrameId,
}: {
  readonly cameraPose: PointCloudCameraPose;
  readonly mode: Scene3dFollowTrackingMode;
  readonly sceneUpAxis?: Scene3dUpAxis;
  readonly targetFrameId: string;
  readonly targetPose: Scene3dCameraTargetPose;
  readonly worldFrameId: string;
}): Scene3dCameraTrackingAnchor {
  const inverseRotation = trackingRotation(
    targetPose,
    mode,
    sceneUpAxis,
  ).invert();

  return {
    mode,
    relativePosition: worldPointToTargetOffset(
      cameraPose.position,
      targetPose.translation,
      inverseRotation,
    ),
    relativeTarget: worldPointToTargetOffset(
      cameraPose.target,
      targetPose.translation,
      inverseRotation,
    ),
    sceneUpAxis,
    targetFrameId,
    worldFrameId,
  };
}

export function cameraPoseFromTrackingAnchor(
  anchor: Scene3dCameraTrackingAnchor,
  targetPose: Scene3dCameraTargetPose,
  sceneUpAxis = anchor.sceneUpAxis,
): PointCloudCameraPose {
  const rotation = trackingRotation(targetPose, anchor.mode, sceneUpAxis);

  return {
    position: targetOffsetToWorldPoint(
      anchor.relativePosition,
      targetPose.translation,
      rotation,
    ),
    target: targetOffsetToWorldPoint(
      anchor.relativeTarget,
      targetPose.translation,
      rotation,
    ),
  };
}

function trackingRotation(
  targetPose: Scene3dCameraTargetPose,
  mode: Scene3dFollowTrackingMode,
  sceneUpAxis: Scene3dUpAxis,
): Quaternion {
  if (mode === "position") {
    return new Quaternion();
  }
  if (mode === "heading") {
    return headingRotation(targetPose.rotation, sceneUpAxis);
  }

  return targetPose.rotation.clone().normalize();
}

/**
 * Yaw-only rotation extracted from a frame rotation, for camera math that
 * should follow heading but stay level (heading tracking, ego/top view
 * presets).
 */
export function headingRotation(
  rotation: Quaternion,
  sceneUpAxis: Scene3dUpAxis = DEFAULT_SCENE_3D_UP_AXIS,
): Quaternion {
  // Heading assumes an X-forward body frame (ROS REP 103) — true for ego
  // frames like base_link, wrong for optical camera frames whose X axis
  // points right. When the forward axis is parallel to scene-up the yaw is
  // undefined; fall back to no rotation instead of a jittery angle.
  const up = sceneUpVector(sceneUpAxis);
  const forward = new Vector3(1, 0, 0).applyQuaternion(rotation);
  forward.addScaledVector(up, -forward.dot(up));
  if (forward.lengthSq() < HEADING_FORWARD_EPSILON ** 2) {
    return new Quaternion();
  }
  forward.normalize();

  const reference = fallbackForwardDirection(sceneUpAxis);
  const signedYaw = Math.atan2(
    new Vector3().crossVectors(reference, forward).dot(up),
    reference.dot(forward),
  );
  return new Quaternion().setFromAxisAngle(up, signedYaw).normalize();
}

function sceneUpVector(sceneUpAxis: Scene3dUpAxis): Vector3 {
  return SCENE_UP_VECTORS[sceneUpAxis].clone();
}

function fallbackForwardDirection(sceneUpAxis: Scene3dUpAxis): Vector3 {
  return sceneUpAxis === "x" ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
}

function worldPointToTargetOffset(
  point: readonly [number, number, number],
  translation: Vector3,
  inverseRotation: Quaternion,
): readonly [number, number, number] {
  return tupleFromVector(
    vectorFromTuple(point).sub(translation).applyQuaternion(inverseRotation),
  );
}

function targetOffsetToWorldPoint(
  offset: readonly [number, number, number],
  translation: Vector3,
  rotation: Quaternion,
): readonly [number, number, number] {
  return tupleFromVector(
    vectorFromTuple(offset).applyQuaternion(rotation).add(translation),
  );
}

function vectorFromTuple(value: readonly [number, number, number]): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

function tupleFromVector(value: Vector3): readonly [number, number, number] {
  return [value.x, value.y, value.z];
}
