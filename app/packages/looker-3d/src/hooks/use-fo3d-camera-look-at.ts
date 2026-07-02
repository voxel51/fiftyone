import { useCallback } from "react";
import type { PerspectiveCamera } from "three";
import {
  setCameraControlsLookAt,
  type Fo3dCameraControls,
} from "../fo3d/camera-controls";
import type { Vector3Input } from "../utils";

interface LookAtParams {
  position: Vector3Input;
  target: Vector3Input;
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

<<<<<<< HEAD
      const [positionX, positionY, positionZ] = toVectorTuple(lookAt.position);
      const [targetX, targetY, targetZ] = toVectorTuple(lookAt.target);

      cameraControlsRef.current.setLookAt(
        positionX,
        positionY,
        positionZ,
        targetX,
        targetY,
        targetZ,
        lookAt.animate,
      );
=======
      setCameraControlsLookAt({
        camera: cameraRef.current,
        controls: cameraControlsRef.current,
        position: lookAt.position,
        target: lookAt.target,
      });
>>>>>>> main

      return true;
    },
    [cameraRef, cameraControlsRef],
  );

  return {
    applyLookAt,
  };
};
