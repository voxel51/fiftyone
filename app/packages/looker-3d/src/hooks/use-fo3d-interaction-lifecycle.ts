import * as fos from "@fiftyone/state";
import type { CameraControls } from "@react-three/drei";
import { useEffect } from "react";
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
  isCurrentlyTransformingAtom,
  selectedPolylineVertexAtom,
} from "../state";
import { useZoomToSelected } from "./use-zoom-to-selected";

interface UseFo3dInteractionLifecycleArgs {
  cameraLifecycleState: Fo3dCameraLifecycleState;
  sample: fos.ModalSample;
  upVector: Vector3 | null;
  mode: string;
  cameraControlsRef: React.RefObject<CameraControls>;
}

/**
 * Coordinates scene-ready interaction resets and zoom-to-selected event handling.
 */
export const useFo3dInteractionLifecycle = ({
  cameraLifecycleState,
  sample,
  upVector,
  mode,
  cameraControlsRef,
}: UseFo3dInteractionLifecycleArgs) => {
  const { setAutoRotate } = useFo3dContext();
  const isActivelySegmenting = useRecoilValue(isActivelySegmentingSelector);
  const isSceneReady = isFo3dCameraLifecycleReady(cameraLifecycleState);

  const resetActiveNode = useRecoilCallback(
    ({ set }) =>
      (event: MouseEvent | null) => {
        // Don't handle right click since that might mean we're panning the camera
        if (event?.type === "contextmenu") {
          return;
        }

        if (isActivelySegmenting) {
          return;
        }

        set(activeNodeAtom, null);
        set(currentHoveredPointAtom, null);
        set(clearTransformStateSelector, null);
        set(selectedPolylineVertexAtom, null);
        set(isCurrentlyTransformingAtom, false);
        setAutoRotate(false);
      },
    [isActivelySegmenting, setAutoRotate]
  );

  // This effect clears active interaction state when scene readiness changes.
  useEffect(() => {
    resetActiveNode(null);
  }, [isSceneReady, resetActiveNode]);

  // Zoom to selected labels and use them as the new lookAt
  const handleZoomToSelected = useZoomToSelected({
    sample,
    upVector,
    mode,
    cameraControlsRef,
  });

  fos.useEventHandler(window, SET_ZOOM_TO_SELECTED_EVENT, handleZoomToSelected);

  return {
    resetActiveNode,
  };
};
