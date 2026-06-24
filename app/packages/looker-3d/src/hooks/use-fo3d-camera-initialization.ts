import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import type { Box3, PerspectiveCamera } from "three";
import { Vector3 } from "three";
import { DEFAULT_CAMERA_POSITION } from "../constants";
import { resolveCameraConfig } from "../fo3d/camera-init";
import {
  FO3D_CAMERA_LIFECYCLE_ACTION,
  Fo3dCameraLifecycleAction,
} from "../fo3d/camera-lifecycle";
import {
  getCameraControlsTarget,
  type Fo3dCameraControls,
} from "../fo3d/camera-controls";
import { FoScene } from "../fo3d/render-types";
import { getSavedCameraState, saveCameraState } from "../fo3d/utils";
import type { Looker3dSettings } from "../settings";
import { cameraPositionAtom } from "../state";
import { RenderPath } from "../types";
import { useFo3dCameraLookAt } from "./use-fo3d-camera-look-at";

const ORIGIN = new Vector3(0, 0, 0);
const FALLBACK_TARGET_OFFSET = new Vector3(0, 0, 1);
const MIN_TARGET_DISTANCE_SQUARED = 1e-8;

const isFiniteVector3 = (vector: Vector3): boolean => {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
};

const toVector3 = (tuple: [number, number, number]) => {
  return new Vector3(tuple[0], tuple[1], tuple[2]);
};

const areCoLocated = (a: Vector3, b: Vector3) => {
  return a.distanceToSquared(b) <= MIN_TARGET_DISTANCE_SQUARED;
};

interface UseFo3dCameraInitializationArgs {
  cameraRef: React.RefObject<PerspectiveCamera>;
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
  currentRenderPath: RenderPath;
  foScene: FoScene | null;
  sceneBoundingBox: Box3 | null;
  upVector: Vector3 | null;
  settings: Looker3dSettings | null;
  isBoundsResolved: boolean;
  dispatchCameraLifecycle: React.Dispatch<Fo3dCameraLifecycleAction>;
}

/**
 * Restores and persists camera state while coordinating scene-driven initialization.
 */
export const useFo3dCameraInitialization = ({
  cameraRef,
  cameraControlsRef,
  currentRenderPath,
  foScene,
  sceneBoundingBox,
  upVector,
  settings,
  isBoundsResolved,
  dispatchCameraLifecycle,
}: UseFo3dCameraInitializationArgs) => {
  const datasetName = useRecoilValue(fos.datasetName);
  const overriddenCameraPosition = useRecoilValue(cameraPositionAtom);

  const { applyLookAt } = useFo3dCameraLookAt({
    cameraRef,
    cameraControlsRef,
  });

  const resolveTargetForOverridePosition = useCallback(
    (overridePositionTuple: [number, number, number]) => {
      const overridePosition = toVector3(overridePositionTuple);

      if (!areCoLocated(overridePosition, ORIGIN)) {
        return ORIGIN;
      }

      // If origin override also targets origin, controls get a
      // zero camera-target distance which leads to degenerate state (eye = position - target, and can't be zero)
      // and pinch/truck effectively stalls.
      const currentTarget = cameraControlsRef.current
        ? getCameraControlsTarget(cameraControlsRef.current)
        : null;
      if (
        currentTarget &&
        isFiniteVector3(currentTarget) &&
        !areCoLocated(overridePosition, currentTarget)
      ) {
        return currentTarget;
      }

      return overridePosition.clone().add(FALLBACK_TARGET_OFFSET);
    },
    [cameraControlsRef],
  );

  // Default camera position for mounts/remounts. Prefer persisted position so
  // mode switches don't flash back to hardcoded defaults.
  const mountCameraPosition = useMemo(() => {
    const savedState = getSavedCameraState(datasetName ?? undefined);

    if (savedState?.position?.length === 3) {
      return new Vector3(
        savedState.position[0],
        savedState.position[1],
        savedState.position[2],
      );
    }

    return DEFAULT_CAMERA_POSITION();
  }, [datasetName]);

  const persistCurrentCameraState = useCallback(() => {
    if (!cameraRef.current || !cameraControlsRef.current) {
      return;
    }

    const target = getCameraControlsTarget(cameraControlsRef.current);

    saveCameraState(
      datasetName ?? undefined,
      cameraRef.current.position.toArray(),
      target.toArray(),
    );
  }, [cameraRef, cameraControlsRef, datasetName]);

  // Restore camera at most once per render path.
  const restoredRenderPathRef = useRef<RenderPath | null>(null);

  // This effect restores camera state and advances camera lifecycle readiness.
  useEffect(() => {
    if (!foScene) {
      dispatchCameraLifecycle({
        type: FO3D_CAMERA_LIFECYCLE_ACTION.WAIT_FOR_SCENE,
      });
      return;
    }

    if (restoredRenderPathRef.current === currentRenderPath) {
      dispatchCameraLifecycle({
        type: FO3D_CAMERA_LIFECYCLE_ACTION.MARK_READY,
      });
      return;
    }

    const latestSavedCameraState = getSavedCameraState(
      datasetName ?? undefined,
    );

    const config = resolveCameraConfig({
      savedState: latestSavedCameraState,
      overriddenCameraPosition,
      scenePosition: foScene.cameraProps.position,
      sceneLookAt: foScene.cameraProps.lookAt,
      pluginSettings: settings,
      boundingBox: sceneBoundingBox,
      upVector,
    });

    if (config.source === "fallback" && !isBoundsResolved) {
      dispatchCameraLifecycle({
        type: FO3D_CAMERA_LIFECYCLE_ACTION.WAIT_FOR_BOUNDS,
      });
      return;
    }

    dispatchCameraLifecycle({
      type: FO3D_CAMERA_LIFECYCLE_ACTION.START_RESTORE,
    });

    const didApply = applyLookAt({
      position: config.position,
      target: config.target,
      animate: false,
    });

    if (!didApply) {
      return;
    }

    restoredRenderPathRef.current = currentRenderPath;
    dispatchCameraLifecycle({
      type: FO3D_CAMERA_LIFECYCLE_ACTION.MARK_READY,
    });
  }, [
    foScene,
    currentRenderPath,
    datasetName,
    overriddenCameraPosition,
    settings,
    sceneBoundingBox,
    upVector,
    isBoundsResolved,
    applyLookAt,
    dispatchCameraLifecycle,
  ]);

  // Post-init override: animates to new position when operator sets
  // cameraPositionAtom AFTER init.
  const prevOverrideRef = useRef(overriddenCameraPosition);

  // This effect animates to a new overridden camera position after initialization.
  useEffect(() => {
    // Only fire when overriddenCameraPosition actually changes, not on mount/init
    if (prevOverrideRef.current === overriddenCameraPosition) {
      return;
    }
    prevOverrideRef.current = overriddenCameraPosition;

    if (!overriddenCameraPosition?.length) {
      return;
    }

    applyLookAt({
      position: overriddenCameraPosition,
      target: resolveTargetForOverridePosition(overriddenCameraPosition),
      animate: true,
    });
  }, [overriddenCameraPosition, applyLookAt, resolveTargetForOverridePosition]);

  // This effect persists camera state on cleanup for render-path changes and unmount.
  useEffect(() => {
    return () => {
      persistCurrentCameraState();
    };
  }, [currentRenderPath, persistCurrentCameraState]);

  return { mountCameraPosition };
};
