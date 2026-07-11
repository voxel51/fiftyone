import { Quaternion, Vector3 } from "three";
import type {
  PointCloudCameraPose,
  PointCloudFrameTransform,
} from "../../../visualization/panels/point-cloud";
import {
  DEFAULT_MCAP_3D_SCENE_UP_AXIS,
  type Mcap3dSceneUpAxis,
} from "./mcap-3d-scene-up";

const SCENE_UP_VECTORS: Record<Mcap3dSceneUpAxis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};
const HEADING_FORWARD_EPSILON = 0.000001;

export type Mcap3dTrackingMode = "free" | "position" | "heading" | "pose";
export type Mcap3dFollowTrackingMode = Exclude<Mcap3dTrackingMode, "free">;

export interface Mcap3dCameraTargetPose {
  readonly rotation: Quaternion;
  readonly translation: Vector3;
}

export interface Mcap3dCameraTrackingAnchor {
  readonly mode: Mcap3dFollowTrackingMode;
  readonly relativePosition: readonly [number, number, number];
  readonly relativeTarget: readonly [number, number, number];
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
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
      readonly pose: Mcap3dCameraTargetPose;
      readonly status: "resolved";
    }
  | {
      readonly status: "missing" | "pending";
    };

export function isFollowTrackingMode(
  mode: Mcap3dTrackingMode,
): mode is Mcap3dFollowTrackingMode {
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
  readonly anchor: Mcap3dCameraTrackingAnchor | null;
  readonly mode: Mcap3dFollowTrackingMode;
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
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
): Mcap3dCameraTargetPose {
  const rotation = transform.rotation.clone();

  return {
    // A degenerate zero-length rotation normalizes to NaN and would poison
    // every downstream camera pose; treat it as identity instead.
    rotation: rotation.lengthSq() > 0 ? rotation.normalize() : new Quaternion(),
    translation: transform.translation.clone(),
  };
}

export function identityCameraTargetPose(): Mcap3dCameraTargetPose {
  return {
    rotation: new Quaternion(),
    translation: new Vector3(),
  };
}

export function cameraTrackingAnchorFromPose({
  cameraPose,
  mode,
  sceneUpAxis = DEFAULT_MCAP_3D_SCENE_UP_AXIS,
  targetFrameId,
  targetPose,
  worldFrameId,
}: {
  readonly cameraPose: PointCloudCameraPose;
  readonly mode: Mcap3dFollowTrackingMode;
  readonly sceneUpAxis?: Mcap3dSceneUpAxis;
  readonly targetFrameId: string;
  readonly targetPose: Mcap3dCameraTargetPose;
  readonly worldFrameId: string;
}): Mcap3dCameraTrackingAnchor {
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
  anchor: Mcap3dCameraTrackingAnchor,
  targetPose: Mcap3dCameraTargetPose,
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
  targetPose: Mcap3dCameraTargetPose,
  mode: Mcap3dFollowTrackingMode,
  sceneUpAxis: Mcap3dSceneUpAxis,
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
  sceneUpAxis: Mcap3dSceneUpAxis = DEFAULT_MCAP_3D_SCENE_UP_AXIS,
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

function sceneUpVector(sceneUpAxis: Mcap3dSceneUpAxis): Vector3 {
  return SCENE_UP_VECTORS[sceneUpAxis].clone();
}

function fallbackForwardDirection(sceneUpAxis: Mcap3dSceneUpAxis): Vector3 {
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
