import { Quaternion, Vector3 } from "three";
import type {
  PointCloudCameraPose,
  PointCloudFrameTransform,
} from "../../../visualization/panels/point-cloud";

const Z_AXIS = new Vector3(0, 0, 1);

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
  readonly targetFrameId: string;
  readonly worldFrameId: string;
}

export function isFollowTrackingMode(
  mode: Mcap3dTrackingMode,
): mode is Mcap3dFollowTrackingMode {
  return mode !== "free";
}

export function cameraTargetPoseFromFrameTransform(
  transform: PointCloudFrameTransform,
): Mcap3dCameraTargetPose {
  return {
    rotation: transform.rotation.clone().normalize(),
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
  targetFrameId,
  targetPose,
  worldFrameId,
}: {
  readonly cameraPose: PointCloudCameraPose;
  readonly mode: Mcap3dFollowTrackingMode;
  readonly targetFrameId: string;
  readonly targetPose: Mcap3dCameraTargetPose;
  readonly worldFrameId: string;
}): Mcap3dCameraTrackingAnchor {
  const inverseRotation = trackingRotation(targetPose, mode).invert();

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
    targetFrameId,
    worldFrameId,
  };
}

export function cameraPoseFromTrackingAnchor(
  anchor: Mcap3dCameraTrackingAnchor,
  targetPose: Mcap3dCameraTargetPose,
): PointCloudCameraPose {
  const rotation = trackingRotation(targetPose, anchor.mode);

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
): Quaternion {
  if (mode === "position") {
    return new Quaternion();
  }
  if (mode === "heading") {
    return headingRotation(targetPose.rotation);
  }

  return targetPose.rotation.clone().normalize();
}

function headingRotation(rotation: Quaternion): Quaternion {
  const forward = new Vector3(1, 0, 0).applyQuaternion(rotation);
  const yaw = Math.atan2(forward.y, forward.x);
  return new Quaternion().setFromAxisAngle(Z_AXIS, yaw).normalize();
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
