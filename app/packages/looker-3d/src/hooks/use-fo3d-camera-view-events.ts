import { isLegacyDomMirror } from "@fiftyone/events";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import type { Box3, PerspectiveCamera, Vector3 } from "three";
import { SET_EGO_VIEW_EVENT, SET_TOP_VIEW_EVENT } from "../constants";
import { resolveViewConfig } from "../fo3d/camera-init";
import type { Fo3dCameraControls } from "../fo3d/camera-controls";
import { FoScene } from "../fo3d/render-types";
import type { Looker3dSettings } from "../settings";
import { cameraPositionAtom } from "../state";
import { useFo3dCameraLookAt } from "./use-fo3d-camera-look-at";
import { useLooker3dEventHandler } from "./use-looker3d-event-handler";

const BOUNDS_RETRY_DELAY_MS = 50;

interface UseFo3dCameraViewEventsArgs {
  cameraRef: React.RefObject<PerspectiveCamera>;
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
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
    (view: "pov" | "top") => {
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
      };
    },
    [
      effectiveSceneBoundingBox,
      upVector,
      overriddenCameraPosition,
      foScene,
      settings,
    ],
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
            (id) => id !== timeoutId,
          );
          applyLookAt(buildViewLookAt(view));
        }, BOUNDS_RETRY_DELAY_MS);
        pendingTimeoutIdsRef.current.push(timeoutId);
        return;
      }

      applyLookAt(buildViewLookAt(view));
    },
    [sceneBoundingBox, recomputeBounds, buildViewLookAt, applyLookAt],
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

  const onTopView = useCallback(
    () => handleViewChangeEvent("top"),
    [handleViewChangeEvent],
  );
  const onEgoView = useCallback(
    () => handleViewChangeEvent("pov"),
    [handleViewChangeEvent],
  );
  useLooker3dEventHandler(SET_TOP_VIEW_EVENT, onTopView);
  useLooker3dEventHandler(SET_EGO_VIEW_EVENT, onEgoView);
  // plugins may still send the window events these commands used to be; the
  // App's own mirrors of its bus events are skipped
  fos.useEventHandler(
    window,
    SET_TOP_VIEW_EVENT,
    (e: Event) => !isLegacyDomMirror(e) && onTopView(),
  );
  fos.useEventHandler(
    window,
    SET_EGO_VIEW_EVENT,
    (e: Event) => !isLegacyDomMirror(e) && onEgoView(),
  );
};
