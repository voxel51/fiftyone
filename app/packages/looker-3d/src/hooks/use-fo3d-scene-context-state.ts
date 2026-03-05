import { useCallback, useMemo, useState } from "react";
import type { Box3, Vector3 } from "three";
import {
  isFo3dCameraLifecycleReady,
  type Fo3dCameraLifecycleState,
} from "../fo3d/camera-lifecycle";
import { FoScene } from "../fo3d/render-types";
import type { Looker3dSettings } from "../settings";
import type { HoverMetadata } from "../types";
import { useFo3dDerivedSceneState } from "./use-fo3d-derived-scene-state";
import { useFo3dPersistentPreferences } from "./use-fo3d-persistent-preferences";
import { useFo3dUpVector } from "./use-fo3d-up-vector";

interface UseFo3dSceneContextStateArgs {
  foScene: FoScene | null;
  settings: Looker3dSettings | null;
  sceneBoundingBox: Box3 | null;
  isComputingSceneBoundingBox: boolean;
  rootAssetCount: number;
  fo3dRoot: string | null;
  cameraLifecycleState: Fo3dCameraLifecycleState;
}

/**
 * Composes fo3d scene context values from scene state, preferences, and camera lifecycle.
 */
export const useFo3dSceneContextState = ({
  foScene,
  settings,
  sceneBoundingBox,
  isComputingSceneBoundingBox,
  rootAssetCount,
  fo3dRoot,
  cameraLifecycleState,
}: UseFo3dSceneContextStateArgs) => {
  const [upVector, setUpVectorVal] = useFo3dUpVector(
    foScene,
    settings?.defaultUp
  );

  const {
    autoRotate,
    setAutoRotate,
    pointCloudSettings,
    setPointCloudSettings,
    raycastPrecision,
    setRaycastPrecision,
  } = useFo3dPersistentPreferences();

  const [hoverMetadata, setHoverMetadata] = useState<HoverMetadata | null>(
    null
  );

  const { effectiveSceneBoundingBox, cursorBounds, lookAt } =
    useFo3dDerivedSceneState(sceneBoundingBox);

  const setUpVector = useCallback(
    (nextUpVector: Vector3) => {
      setUpVectorVal(nextUpVector);
    },
    [setUpVectorVal]
  );

  const isSceneInitialized = isFo3dCameraLifecycleReady(cameraLifecycleState);

  const contextValue = useMemo(
    () => ({
      cameraLifecycleState,
      isSceneInitialized,
      numPrimaryAssets: rootAssetCount,
      upVector,
      setUpVector,
      isComputingSceneBoundingBox,
      fo3dRoot,
      sceneBoundingBox: effectiveSceneBoundingBox,
      cursorBounds,
      lookAt,
      autoRotate,
      setAutoRotate,
      pointCloudSettings,
      setPointCloudSettings,
      raycastPrecision,
      setRaycastPrecision,
      hoverMetadata,
      setHoverMetadata,
      pluginSettings: settings ?? null,
    }),
    [
      cameraLifecycleState,
      isSceneInitialized,
      rootAssetCount,
      upVector,
      setUpVector,
      isComputingSceneBoundingBox,
      fo3dRoot,
      effectiveSceneBoundingBox,
      cursorBounds,
      lookAt,
      autoRotate,
      setAutoRotate,
      pointCloudSettings,
      setPointCloudSettings,
      raycastPrecision,
      setRaycastPrecision,
      hoverMetadata,
      setHoverMetadata,
      settings,
    ]
  );

  return {
    upVector,
    effectiveSceneBoundingBox,
    contextValue,
  };
};
