import { useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";
import { headingRotation, type Mcap3dCameraTargetPose } from "./mcap-3d-camera";
import type { CameraPoseChangeSource } from "./use-mcap-3d-camera-tracking";
import { resolveCameraTargetPose } from "./use-mcap-3d-camera-tracking";
import { PREFERRED_CAMERA_TARGET_FRAMES } from "./use-mcap-3d-frame-selection";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";

// Ego chase view: behind and above the ego along its heading, looking at it.
// Fixed automotive-scale offsets — the trained looker-3d "ego view" is a
// close-in vehicle-centered view, not a scene fit.
const EGO_VIEW_BACK_M = 12;
const EGO_VIEW_UP_M = 5;
// Top view preserves the user's current zoom distance, clamped to a range
// that stays useful for automotive scenes (lidar radius ~50-100m).
const TOP_VIEW_MIN_HEIGHT_M = 25;
const TOP_VIEW_MAX_HEIGHT_M = 400;
const TOP_VIEW_DEFAULT_HEIGHT_M = 80;
// Slight horizontal lean in top view: keeps OrbitControls away from the
// degenerate straight-down pole (view direction parallel to the Z up vector)
// and pins the screen-up direction (~1 degree, visually imperceptible).
const TOP_VIEW_LEAN_RATIO = 0.02;

/**
 * Resolves which frame "the ego" means for view-preset shortcuts. Frame
 * names are the only trustworthy signal: prefer the trained ego frame names,
 * then fall back to whatever frame the camera is targeting — in a recording
 * without a recognizable ego, the tracked frame is the best available proxy.
 */
export function resolveMcap3dEgoFrameId({
  cameraTargetFrameId,
  frameIds,
}: {
  readonly cameraTargetFrameId: string;
  readonly frameIds: readonly string[];
}): string | null {
  for (const frameId of PREFERRED_CAMERA_TARGET_FRAMES) {
    if (frameIds.includes(frameId)) {
      return frameId;
    }
  }

  return cameraTargetFrameId || null;
}

/**
 * Chase view of the ego: camera behind and above it along its yaw heading
 * (level horizon), looking at the ego position. With an identity ego pose
 * (ego-centric world frame) this is a deterministic behind-the-origin view,
 * matching the trained looker-3d "reset to ego view" behavior.
 */
export function egoViewCameraPose(
  egoPose: Mcap3dCameraTargetPose,
): PointCloudCameraPose {
  const heading = headingRotation(egoPose.rotation);
  const position = new Vector3(-EGO_VIEW_BACK_M, 0, EGO_VIEW_UP_M)
    .applyQuaternion(heading)
    .add(egoPose.translation);

  return {
    position: [position.x, position.y, position.z],
    target: [
      egoPose.translation.x,
      egoPose.translation.y,
      egoPose.translation.z,
    ],
  };
}

/**
 * Top-down view over an anchor point, preserving the current orbit distance
 * (clamped) so T reads as "rotate my view to bird's-eye", not a zoom reset.
 * The camera leans slightly along the negated heading so the heading points
 * screen-up (with Z-up OrbitControls, screen-up in a near-vertical view is
 * the direction opposite the horizontal lean); without a heading the lean
 * defaults to south, i.e. north-up.
 */
export function topViewCameraPose({
  anchor,
  currentDistance,
  rotation,
}: {
  readonly anchor: Vector3;
  readonly currentDistance: number | null;
  readonly rotation: Quaternion | null;
}): PointCloudCameraPose {
  const height = Math.min(
    TOP_VIEW_MAX_HEIGHT_M,
    Math.max(
      TOP_VIEW_MIN_HEIGHT_M,
      currentDistance ?? TOP_VIEW_DEFAULT_HEIGHT_M,
    ),
  );
  const lean = rotation
    ? new Vector3(1, 0, 0).applyQuaternion(headingRotation(rotation))
    : new Vector3(0, 1, 0);
  lean.setZ(0);
  if (lean.lengthSq() === 0) {
    lean.set(0, 1, 0);
  }
  lean.normalize().multiplyScalar(-height * TOP_VIEW_LEAN_RATIO);
  const position = anchor
    .clone()
    .add(lean)
    .setZ(anchor.z + height);

  return {
    position: [position.x, position.y, position.z],
    target: [anchor.x, anchor.y, anchor.z],
  };
}

export interface Mcap3dViewShortcutsOptions {
  readonly cameraTargetFrameId: string;
  readonly frameIds: readonly string[];
  readonly frameTransforms: McapFrameTransformsState;
  readonly getDisplayedCameraPose: () => PointCloudCameraPose | null;
  readonly isActive: boolean;
  readonly onApplyCameraPose: (
    pose: PointCloudCameraPose,
    source: CameraPoseChangeSource,
  ) => void;
  readonly playbackTimeNs: bigint | undefined;
  readonly worldFrameId: string;
}

/**
 * Trained view-preset shortcuts for the 3D tile: E = ego view, T = top view
 * (the same keys looker-3d trained users on). Both route through the "focus"
 * camera channel, so follow modes re-base their anchor and keep tracking.
 *
 * Bound globally for the lifetime of the tile — the 3D scene is the modal's
 * one fused view, matching looker-3d's modal-global binding. Plain unmodified
 * keys only: the playback bar's temporal-tag hotkey lives on Shift+T, and
 * typing targets (inputs, selects) are ignored.
 */
export function useMcap3dViewShortcuts(
  options: Mcap3dViewShortcutsOptions,
): void {
  const latestOptionsRef = useRef(options);
  // This effect keeps the latest inputs readable from the stable key
  // listener without rebinding it on every playback tick.
  useEffect(() => {
    latestOptionsRef.current = options;
  });

  // This effect binds the key listener for the lifetime of the tile; all
  // per-event state is read through refs.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        (event.code !== "KeyE" && event.code !== "KeyT") ||
        !latestOptionsRef.current.isActive ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      const pose = viewPresetPoseFor(event.code, latestOptionsRef.current);
      if (!pose) {
        return;
      }

      event.preventDefault();
      latestOptionsRef.current.onApplyCameraPose(pose, "focus");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

function viewPresetPoseFor(
  code: "KeyE" | "KeyT",
  {
    cameraTargetFrameId,
    frameIds,
    frameTransforms,
    getDisplayedCameraPose,
    playbackTimeNs,
    worldFrameId,
  }: Mcap3dViewShortcutsOptions,
): PointCloudCameraPose | null {
  const egoFrameId = resolveMcap3dEgoFrameId({
    cameraTargetFrameId,
    frameIds,
  });
  const egoResolution = egoFrameId
    ? resolveCameraTargetPose({
        cameraTargetFrameId: egoFrameId,
        frameTransforms,
        playbackTimeNs,
        worldFrameId,
      })
    : null;
  const egoPose =
    egoResolution?.status === "resolved" ? egoResolution.pose : null;

  if (code === "KeyE") {
    // No resolvable ego this tick (transform window loading, no frames): a
    // no-op beats a jump to a wrong pose; the next press works once resolved.
    return egoPose ? egoViewCameraPose(egoPose) : null;
  }

  const currentPose = getDisplayedCameraPose();
  const anchor = egoPose
    ? egoPose.translation
    : currentPose
      ? new Vector3(...currentPose.target)
      : null;
  if (!anchor) {
    return null;
  }

  return topViewCameraPose({
    anchor,
    currentDistance: currentPose ? cameraOrbitDistance(currentPose) : null,
    rotation: egoPose ? egoPose.rotation : null,
  });
}

function cameraOrbitDistance(pose: PointCloudCameraPose): number {
  return new Vector3(...pose.position).distanceTo(new Vector3(...pose.target));
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}
