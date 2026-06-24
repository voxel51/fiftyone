import { useCallback } from "react";
import type { PerspectiveCamera, Vector3, Vector3Tuple } from "three";
import {
  setCameraControlsLookAt,
  type Fo3dCameraControls,
} from "../fo3d/camera-controls";

type CameraVector = Vector3 | Vector3Tuple;

interface LookAtParams {
  position: CameraVector;
  target: CameraVector;
  animate: boolean;
}

interface UseFo3dCameraLookAtArgs {
  cameraRef: React.RefObject<PerspectiveCamera>;
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
}

/**
 * Thin adapter for FO3D look-at updates.
 * Keeps ref-readiness checks and vector/tuple normalization in one place.
 */
export const useFo3dCameraLookAt = ({
  cameraRef,
  cameraControlsRef,
}: UseFo3dCameraLookAtArgs) => {
  const applyLookAt = useCallback(
    (lookAt: LookAtParams): boolean => {
      if (!cameraRef.current || !cameraControlsRef.current) {
        return false;
      }

      setCameraControlsLookAt({
        camera: cameraRef.current,
        controls: cameraControlsRef.current,
        position: lookAt.position,
        target: lookAt.target,
      });

      return true;
    },
    [cameraRef, cameraControlsRef],
  );

  return {
    applyLookAt,
  };
};
