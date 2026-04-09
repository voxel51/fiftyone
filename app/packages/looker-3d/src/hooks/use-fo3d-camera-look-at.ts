import type { CameraControls } from "@react-three/drei";
import { useCallback } from "react";
import type { PerspectiveCamera, Vector3Tuple } from "three";
import { Vector3 } from "three";

type CameraVector = Vector3 | Vector3Tuple;

interface LookAtParams {
  position: CameraVector;
  target: CameraVector;
  animate: boolean;
}

interface UseFo3dCameraLookAtArgs {
  cameraRef: React.RefObject<PerspectiveCamera>;
  cameraControlsRef: React.RefObject<CameraControls>;
}

const toVectorTuple = (value: CameraVector): Vector3Tuple => {
  if (value instanceof Vector3) {
    return [value.x, value.y, value.z];
  }

  return value;
};

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

      const [positionX, positionY, positionZ] = toVectorTuple(lookAt.position);
      const [targetX, targetY, targetZ] = toVectorTuple(lookAt.target);

      cameraControlsRef.current.setLookAt(
        positionX,
        positionY,
        positionZ,
        targetX,
        targetY,
        targetZ,
        lookAt.animate
      );

      return true;
    },
    [cameraRef, cameraControlsRef]
  );

  return {
    applyLookAt,
  };
};
