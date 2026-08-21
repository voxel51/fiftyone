import { Vector3 } from "three";
import type {
  PointCloudCameraPose,
  PointCloudSceneBoundsSummary,
} from "../../../../visualization/scene-3d/index";
import {
  cameraPoseFromTrackingAnchor,
  cameraTrackingAnchorFromPose,
  isFollowTrackingMode,
  trackingAnchorMatches,
  type CameraTargetResolution,
  type Scene3dCameraTrackingAnchor,
  type Scene3dTrackingMode,
} from "./scene-3d-camera";
import type { Scene3dUpAxis } from "../../spatial/view-preferences";

const MIN_SCENE_RADIUS = 1e-6;

/** Camera intent expressed relative to a semantic target frame. */
export interface Scene3dTargetRelativeCameraComposition {
  readonly kind: "target-relative";
  readonly relativePosition: readonly [number, number, number];
  readonly relativeTarget: readonly [number, number, number];
  readonly rotationMode: "position" | "heading" | "pose";
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly targetFrameId: string;
  readonly trackingMode: Scene3dTrackingMode;
}

/** Camera intent normalized to scene bounds when no target is compatible. */
export interface Scene3dBoundsNormalizedCameraComposition {
  readonly distanceInRadii: number;
  readonly kind: "bounds-normalized";
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly targetOffsetInRadii: readonly [number, number, number];
  readonly trackingMode: Scene3dTrackingMode;
  readonly viewDirection: readonly [number, number, number];
}

/** Portable camera candidates supported across recording boundaries. */
export type Scene3dCameraComposition =
  | Scene3dTargetRelativeCameraComposition
  | Scene3dBoundsNormalizedCameraComposition;

/** Result of resolving a portable camera candidate against a recording. */
export type Scene3dCameraCompositionResolution =
  | {
      readonly anchor: Scene3dCameraTrackingAnchor | null;
      readonly pose: PointCloudCameraPose;
      readonly status: "resolved";
    }
  | {
      readonly reason:
        | "bounds-unavailable"
        | "placement-pending"
        | "scene-up-mismatch"
        | "target-frame-mismatch"
        | "target-pending"
        | "target-unavailable";
      readonly status: "pending" | "rejected";
    };

/** Captures portable camera candidates in deterministic preference order. */
export function captureScene3dCameraCompositions({
  cameraPose,
  cameraTargetResolution,
  cameraTargetFrameId,
  sceneBounds,
  sceneUpAxis,
  trackingAnchor,
  trackingMode,
  worldFrameId,
}: {
  readonly cameraPose: PointCloudCameraPose;
  readonly cameraTargetResolution: CameraTargetResolution;
  readonly cameraTargetFrameId: string;
  readonly sceneBounds: PointCloudSceneBoundsSummary | null;
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly trackingAnchor: Scene3dCameraTrackingAnchor | null;
  readonly trackingMode: Scene3dTrackingMode;
  readonly worldFrameId: string;
}): readonly Scene3dCameraComposition[] {
  const candidates: Scene3dCameraComposition[] = [];
  if (
    cameraTargetResolution.status === "resolved" &&
    cameraTargetFrameId &&
    worldFrameId
  ) {
    const rotationMode = isFollowTrackingMode(trackingMode)
      ? trackingMode
      : "position";
    const reusableAnchor =
      isFollowTrackingMode(trackingMode) &&
      trackingAnchorMatches({
        anchor: trackingAnchor,
        mode: trackingMode,
        sceneUpAxis,
        targetFrameId: cameraTargetFrameId,
        worldFrameId,
      })
        ? trackingAnchor
        : null;
    const anchor =
      reusableAnchor ??
      cameraTrackingAnchorFromPose({
        cameraPose,
        mode: rotationMode,
        sceneUpAxis,
        targetFrameId: cameraTargetFrameId,
        targetPose: cameraTargetResolution.pose,
        worldFrameId,
      });

    candidates.push({
      kind: "target-relative",
      relativePosition: anchor.relativePosition,
      relativeTarget: anchor.relativeTarget,
      rotationMode,
      sceneUpAxis,
      targetFrameId: cameraTargetFrameId,
      trackingMode,
    });
  }

  const boundsComposition = sceneBounds
    ? captureBoundsNormalizedComposition({
        cameraPose,
        sceneBounds,
        sceneUpAxis,
        trackingMode,
      })
    : null;
  if (boundsComposition) candidates.push(boundsComposition);
  return candidates;
}

/** Resolves one carried composition against the current sample. */
export function resolveScene3dCameraComposition({
  cameraTargetFrameId,
  cameraTargetResolution,
  composition,
  placementStatus,
  sceneBounds,
  sceneUpAxis,
  worldFrameId,
}: {
  readonly cameraTargetFrameId: string;
  readonly cameraTargetResolution: CameraTargetResolution;
  readonly composition: Scene3dCameraComposition;
  readonly placementStatus:
    | "empty"
    | "provisional"
    | "transformed"
    | "unframed";
  readonly sceneBounds: PointCloudSceneBoundsSummary | null;
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly worldFrameId: string;
}): Scene3dCameraCompositionResolution {
  if (composition.sceneUpAxis !== sceneUpAxis) {
    return { reason: "scene-up-mismatch", status: "rejected" };
  }
  if (placementStatus !== "transformed") {
    return { reason: "placement-pending", status: "pending" };
  }

  if (composition.kind === "bounds-normalized") {
    if (!sceneBounds) {
      return { reason: "bounds-unavailable", status: "pending" };
    }
    return {
      anchor: null,
      pose: cameraPoseFromBoundsNormalizedComposition(composition, sceneBounds),
      status: "resolved",
    };
  }

  if (!cameraTargetFrameId || !worldFrameId) {
    return { reason: "target-pending", status: "pending" };
  }
  if (composition.targetFrameId !== cameraTargetFrameId) {
    return { reason: "target-frame-mismatch", status: "rejected" };
  }
  if (cameraTargetResolution.status !== "resolved") {
    return cameraTargetResolution.status === "pending"
      ? { reason: "target-pending", status: "pending" }
      : { reason: "target-unavailable", status: "rejected" };
  }

  const anchor: Scene3dCameraTrackingAnchor = {
    mode: composition.rotationMode,
    relativePosition: composition.relativePosition,
    relativeTarget: composition.relativeTarget,
    sceneUpAxis,
    targetFrameId: cameraTargetFrameId,
    worldFrameId,
  };
  return {
    anchor: isFollowTrackingMode(composition.trackingMode) ? anchor : null,
    pose: cameraPoseFromTrackingAnchor(anchor, cameraTargetResolution.pose),
    status: "resolved",
  };
}

function captureBoundsNormalizedComposition({
  cameraPose,
  sceneBounds,
  sceneUpAxis,
  trackingMode,
}: {
  readonly cameraPose: PointCloudCameraPose;
  readonly sceneBounds: PointCloudSceneBoundsSummary;
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly trackingMode: Scene3dTrackingMode;
}): Scene3dBoundsNormalizedCameraComposition | null {
  if (
    !Number.isFinite(sceneBounds.radius) ||
    sceneBounds.radius < MIN_SCENE_RADIUS
  ) {
    return null;
  }

  const position = new Vector3(...cameraPose.position);
  const target = new Vector3(...cameraPose.target);
  const offset = position.clone().sub(target);
  const distance = offset.length();
  if (!Number.isFinite(distance) || distance < MIN_SCENE_RADIUS) return null;

  const center = new Vector3(...sceneBounds.center);
  const targetOffset = target
    .sub(center)
    .multiplyScalar(1 / sceneBounds.radius);
  const viewDirection = offset.normalize();
  return {
    distanceInRadii: distance / sceneBounds.radius,
    kind: "bounds-normalized",
    sceneUpAxis,
    targetOffsetInRadii: targetOffset.toArray(),
    trackingMode,
    viewDirection: viewDirection.toArray(),
  };
}

function cameraPoseFromBoundsNormalizedComposition(
  composition: Scene3dBoundsNormalizedCameraComposition,
  sceneBounds: PointCloudSceneBoundsSummary,
): PointCloudCameraPose {
  const radius = Math.max(sceneBounds.radius, MIN_SCENE_RADIUS);
  const target = new Vector3(...sceneBounds.center).add(
    new Vector3(...composition.targetOffsetInRadii).multiplyScalar(radius),
  );
  const position = target
    .clone()
    .add(
      new Vector3(...composition.viewDirection).multiplyScalar(
        composition.distanceInRadii * radius,
      ),
    );

  return { position: position.toArray(), target: target.toArray() };
}
