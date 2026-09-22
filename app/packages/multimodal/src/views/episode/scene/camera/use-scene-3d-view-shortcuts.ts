import { useCallback, useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import type { PointCloudCameraPose } from "../../../../visualization/scene-3d/index";
import type { Scene3dCameraTargetPose } from "./scene-3d-camera";
import type { CameraPoseChangeSource } from "./use-scene-3d-camera-tracking";
import { resolveCameraTargetPose } from "./use-scene-3d-camera-tracking";
import type { FrameTransformsState } from "../../spatial/frame-transforms/use-frame-transforms";
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

export interface Scene3dViewShortcutsOptions {
  readonly cameraTargetFrameId: string;
  readonly frameTransforms: FrameTransformsState;
  readonly getDisplayedCameraPose: () => PointCloudCameraPose | null;
  readonly isActive: boolean;
  readonly onApplyCameraPose: (
    pose: PointCloudCameraPose,
    source: CameraPoseChangeSource,
  ) => void;
  readonly playbackTimeNs: bigint | undefined;
  readonly sceneUpAxis?: Scene3dUpAxis;
  readonly worldFrameId: string;
}

interface Scene3dViewActions {
  readonly applyEgoView: () => void;
  readonly applyTopView: () => void;
}

/**
 * Trained view-preset shortcuts for the 3D tile: E = ego view, T = top view
 * (the same keys looker-3d trained users on). Both route through the "focus"
 * camera channel, so follow modes re-base their anchor and keep tracking.
 *
 * Bound globally for the lifetime of the tile — the 3D scene is the modal's
 * one fused view, matching looker-3d's modal-global binding. Plain unmodified
 * keys only: the playback bar's temporal-tag hotkey lives on Shift+T, and
 * typing targets (inputs, selects) are ignored. The returned actions share
 * this same pose path with the on-canvas view buttons.
 */
export function useScene3dViewShortcuts(
  options: Scene3dViewShortcutsOptions,
): Scene3dViewActions {
  const latestOptionsRef = useRef(options);
  // This effect keeps the latest inputs readable from the stable key
  // listener without rebinding it on every playback tick.
  useEffect(() => {
    latestOptionsRef.current = options;
  });

  const applyViewPreset = useCallback((code: "KeyE" | "KeyT"): boolean => {
    const currentOptions = latestOptionsRef.current;
    const pose = viewPresetPoseFor(code, currentOptions);
    if (!pose) {
      return false;
    }

    currentOptions.onApplyCameraPose(pose, "focus");
    return true;
  }, []);

  const applyEgoView = useCallback(() => {
    applyViewPreset("KeyE");
  }, [applyViewPreset]);
  const applyTopView = useCallback(() => {
    applyViewPreset("KeyT");
  }, [applyViewPreset]);

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

      if (!applyViewPreset(event.code)) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applyViewPreset]);

  return { applyEgoView, applyTopView };
}

function viewPresetPoseFor(
  code: "KeyE" | "KeyT",
  {
    cameraTargetFrameId,
    frameTransforms,
    getDisplayedCameraPose,
    playbackTimeNs,
    sceneUpAxis = DEFAULT_SCENE_3D_UP_AXIS,
    worldFrameId,
  }: Scene3dViewShortcutsOptions,
): PointCloudCameraPose | null {
  const targetResolution = resolveCameraTargetPose({
    cameraTargetFrameId,
    frameTransforms,
    playbackTimeNs,
    worldFrameId,
  });
  const targetPose =
    targetResolution.status === "resolved" ? targetResolution.pose : null;

  if (code === "KeyE") {
    // No resolvable target this tick (transform window loading, no frames): a
    // no-op beats a jump to a wrong pose; the next press works once resolved.
    return targetPose ? egoViewCameraPose(targetPose, sceneUpAxis) : null;
  }

  const currentPose = getDisplayedCameraPose();
  const anchor = targetPose
    ? targetPose.translation
    : currentPose
      ? new Vector3(...currentPose.target)
      : null;
  if (!anchor) {
    return null;
  }

  return topViewCameraPose({
    anchor,
    currentDistance: currentPose ? cameraOrbitDistance(currentPose) : null,
    rotation: targetPose ? targetPose.rotation : null,
    sceneUpAxis,
  });
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
