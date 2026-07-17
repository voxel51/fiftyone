import { Vector3 } from "three";
import type {
  PointCloudCameraPose,
  PointCloudSceneBoundsSummary,
} from "../../../visualization/panels/point-cloud";
import {
  cameraPoseFromTrackingAnchor,
  cameraTrackingAnchorFromPose,
  isFollowTrackingMode,
  trackingAnchorMatches,
  type CameraTargetResolution,
  type Mcap3dCameraTrackingAnchor,
  type Mcap3dTrackingMode,
} from "./mcap-3d-camera";
import type { Mcap3dSceneUpAxis } from "./mcap-3d-scene-up";

const MIN_SCENE_RADIUS = 1e-6;

/** Camera intent expressed relative to a semantic target frame. */
export interface Mcap3dTargetRelativeCameraComposition {
  readonly kind: "target-relative";
  readonly relativePosition: readonly [number, number, number];
  readonly relativeTarget: readonly [number, number, number];
  readonly rotationMode: "position" | "heading" | "pose";
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly targetFrameId: string;
  readonly trackingMode: Mcap3dTrackingMode;
}

/** Camera intent normalized to scene bounds when no target is compatible. */
export interface Mcap3dBoundsNormalizedCameraComposition {
  readonly distanceInRadii: number;
  readonly kind: "bounds-normalized";
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly targetOffsetInRadii: readonly [number, number, number];
  readonly trackingMode: Mcap3dTrackingMode;
  readonly viewDirection: readonly [number, number, number];
}

/** Portable camera candidates supported across recording boundaries. */
export type Mcap3dCameraComposition =
  | Mcap3dTargetRelativeCameraComposition
  | Mcap3dBoundsNormalizedCameraComposition;

/** Result of resolving a portable camera candidate against a recording. */
export type Mcap3dCameraCompositionResolution =
  | {
      readonly anchor: Mcap3dCameraTrackingAnchor | null;
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
export function captureMcap3dCameraCompositions({
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
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly trackingAnchor: Mcap3dCameraTrackingAnchor | null;
  readonly trackingMode: Mcap3dTrackingMode;
  readonly worldFrameId: string;
}): readonly Mcap3dCameraComposition[] {
  const candidates: Mcap3dCameraComposition[] = [];
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
export function resolveMcap3dCameraComposition({
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
  readonly composition: Mcap3dCameraComposition;
  readonly placementStatus:
    | "empty"
    | "provisional"
    | "transformed"
    | "unframed";
  readonly sceneBounds: PointCloudSceneBoundsSummary | null;
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly worldFrameId: string;
}): Mcap3dCameraCompositionResolution {
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

  const anchor: Mcap3dCameraTrackingAnchor = {
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
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly trackingMode: Mcap3dTrackingMode;
}): Mcap3dBoundsNormalizedCameraComposition | null {
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
  composition: Mcap3dBoundsNormalizedCameraComposition,
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
