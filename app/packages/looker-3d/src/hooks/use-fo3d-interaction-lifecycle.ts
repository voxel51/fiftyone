import * as fos from "@fiftyone/state";
import type { CameraControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import type { Vector3 } from "three";
import { SET_ZOOM_TO_SELECTED_EVENT } from "../constants";
import {
  isFo3dCameraLifecycleReady,
  type Fo3dCameraLifecycleState,
} from "../fo3d/camera-lifecycle";
import { useFo3dContext } from "../fo3d/context";
import {
  activeNodeAtom,
  clearTransformStateSelector,
  currentHoveredPointAtom,
  isActivelySegmentingSelector,
} from "../state";
import { useZoomToSelected } from "./use-zoom-to-selected";

interface UseFo3dInteractionLifecycleArgs {
  cameraLifecycleState: Fo3dCameraLifecycleState;
  interactionSample: fos.ModalSample;
  upVector: Vector3 | null;
  mode: string;
  cameraControlsRef: React.RefObject<CameraControls>;
}

/**
 * Coordinates scene-ready interaction resets and zoom-to-selected event handling.
 */
export const useFo3dInteractionLifecycle = ({
  cameraLifecycleState,
  interactionSample,
  upVector,
  mode,
  cameraControlsRef,
}: UseFo3dInteractionLifecycleArgs) => {
  const { setAutoRotate } = useFo3dContext();
  const isActivelySegmenting = useRecoilValue(isActivelySegmentingSelector);
  const isSceneReady = isFo3dCameraLifecycleReady(cameraLifecycleState);
  const isActivelySegmentingRef = useRef(isActivelySegmenting);
  const setAutoRotateRef = useRef(setAutoRotate);

  useEffect(() => {
    isActivelySegmentingRef.current = isActivelySegmenting;
  }, [isActivelySegmenting]);

  useEffect(() => {
    setAutoRotateRef.current = setAutoRotate;
  }, [setAutoRotate]);

  const resetActiveNode = useRecoilCallback(
    ({ set }) =>
      (event: MouseEvent | null) => {
        // Don't handle right click since that might mean we're panning the camera
        if (event?.type === "contextmenu") {
          return;
        }

        if (isActivelySegmentingRef.current) {
          return;
        }

        set(activeNodeAtom, null);
        set(currentHoveredPointAtom, null);
        set(clearTransformStateSelector, null);
        setAutoRotateRef.current(false);
      },
    [],
  );

  // This effect clears active interaction state when scene readiness changes.
  useEffect(() => {
    resetActiveNode(null);
  }, [isSceneReady, resetActiveNode]);

  // Zoom to selected labels and use them as the new lookAt
  const handleZoomToSelected = useZoomToSelected({
    interactionSample,
    upVector,
    mode,
    cameraControlsRef,
  });

  fos.useEventHandler(window, SET_ZOOM_TO_SELECTED_EVENT, handleZoomToSelected);

  return {
    resetActiveNode,
  };
};
