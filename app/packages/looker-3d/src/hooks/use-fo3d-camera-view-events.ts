import * as fos from "@fiftyone/state";
import type { CameraControls } from "@react-three/drei";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import type { Box3, PerspectiveCamera, Vector3 } from "three";
import { SET_EGO_VIEW_EVENT, SET_TOP_VIEW_EVENT } from "../constants";
import { resolveViewConfig } from "../fo3d/camera-init";
import { FoScene } from "../fo3d/render-types";
import type { Looker3dSettings } from "../settings";
import { cameraPositionAtom } from "../state";
import { useFo3dCameraLookAt } from "./use-fo3d-camera-look-at";

const BOUNDS_RETRY_DELAY_MS = 50;

interface UseFo3dCameraViewEventsArgs {
  cameraRef: React.RefObject<PerspectiveCamera>;
  cameraControlsRef: React.RefObject<CameraControls>;
  effectiveSceneBoundingBox: Box3;
  sceneBoundingBox: Box3 | null;
  upVector: Vector3 | null;
  foScene: FoScene | null;
  settings: Looker3dSettings | null;
  recomputeBounds: () => void;
}

/**
 * Registers top/ego view events and applies the matching camera view transitions.
 */
export const useFo3dCameraViewEvents = ({
  cameraRef,
  cameraControlsRef,
  effectiveSceneBoundingBox,
  sceneBoundingBox,
  upVector,
  foScene,
  settings,
  recomputeBounds,
}: UseFo3dCameraViewEventsArgs) => {
  const overriddenCameraPosition = useRecoilValue(cameraPositionAtom);

  const { applyLookAt } = useFo3dCameraLookAt({
    cameraRef,
    cameraControlsRef,
  });
  const pendingTimeoutIdsRef = useRef<number[]>([]);

  const buildViewLookAt = useCallback(
    (view: "pov" | "top", useAnimation: boolean) => {
      const viewConfig = resolveViewConfig(view, {
        boundingBox: effectiveSceneBoundingBox,
        upVector,
        overriddenCameraPosition,
        scenePosition: foScene?.cameraProps.position ?? null,
        pluginSettings: settings,
      });

      return {
        position: viewConfig.position,
        target: viewConfig.target,
        animate: useAnimation,
      };
    },
    [
      effectiveSceneBoundingBox,
      upVector,
      overriddenCameraPosition,
      foScene,
      settings,
    ]
  );

  const onChangeView = useCallback(
    (
      view: "pov" | "top",
      { useAnimation = true }: { useAnimation?: boolean } = {}
    ) => {
      return applyLookAt(buildViewLookAt(view, useAnimation));
    },
    [buildViewLookAt, applyLookAt]
  );

  const handleViewChangeEvent = useCallback(
    (view: "pov" | "top") => {
      // Sometimes the bbox isn't computed yet, especially on scene load or error
      // for big assets, or because of timeout, or three.js loading manager issues,
      // so we lazily recompute it and try again shortly after.
      if (!sceneBoundingBox) {
        recomputeBounds();
        const timeoutId = window.setTimeout(() => {
          pendingTimeoutIdsRef.current = pendingTimeoutIdsRef.current.filter(
            (id) => id !== timeoutId
          );
          const lookAt = buildViewLookAt(view, true);
          applyLookAt(lookAt);
        }, BOUNDS_RETRY_DELAY_MS);
        pendingTimeoutIdsRef.current.push(timeoutId);
        return;
      }

      onChangeView(view, { useAnimation: true });
    },
    [
      onChangeView,
      sceneBoundingBox,
      recomputeBounds,
      buildViewLookAt,
      applyLookAt,
    ]
  );

  // This effect clears any remaining timeouts
  useEffect(() => {
    return () => {
      for (const timeoutId of pendingTimeoutIdsRef.current) {
        window.clearTimeout(timeoutId);
      }

      pendingTimeoutIdsRef.current = [];
    };
  }, []);

  fos.useEventHandler(window, SET_TOP_VIEW_EVENT, () => {
    handleViewChangeEvent("top");
  });

  fos.useEventHandler(window, SET_EGO_VIEW_EVENT, () => {
    handleViewChangeEvent("pov");
  });
};
