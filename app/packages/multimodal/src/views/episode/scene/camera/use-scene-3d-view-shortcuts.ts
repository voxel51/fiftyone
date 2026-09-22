import { useCallback, useEffect, useRef } from "react";
import { Vector3 } from "three";
import type { PointCloudCameraPose } from "../../../../visualization/scene-3d/index";
import type { CameraPoseChangeSource } from "./use-scene-3d-camera-tracking";
import { resolveCameraTargetPose } from "./use-scene-3d-camera-tracking";
import type { FrameTransformsState } from "../../spatial/frame-transforms/use-frame-transforms";
import {
  DEFAULT_SCENE_3D_UP_AXIS,
  type Scene3dUpAxis,
} from "../../spatial/view-preferences";
import { egoViewCameraPose, topViewCameraPose } from "./scene-3d-view-presets";

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
