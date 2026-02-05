import { useCallback, useMemo } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { useEmptyCanvasInteraction } from "../hooks/use-empty-canvas-interaction";
import { annotationPlaneAtom, sharedCursorPositionAtom } from "../state";
import { getPlaneFromPositionAndQuaternion } from "../utils";

/**
 * Tracks the cursor position in 3D space.
 */
export const CursorTracker = () => {
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const setSharedCursorPosition = useSetRecoilState(sharedCursorPositionAtom);

  const handlePointerMove = useCallback(
    (worldPos: THREE.Vector3, worldPosPerpendicular: THREE.Vector3 | null) => {
      if (!worldPos) return;

      // When annotation plane is enabled, use the plane intersection point directly
      // Otherwise, use the perpendicular plane intersection for a more natural cursor position
      const cursorPos =
        !annotationPlane.enabled && worldPosPerpendicular
          ? worldPosPerpendicular.clone()
          : worldPos.clone();

      setSharedCursorPosition([cursorPos.x, cursorPos.y, cursorPos.z]);
    },
    [annotationPlane.enabled, setSharedCursorPosition]
  );

  // Calculate the annotation plane for raycasting
  const raycastPlane = useMemo(() => {
    const plane = getPlaneFromPositionAndQuaternion(
      annotationPlane.position,
      annotationPlane.quaternion
    );

    return {
      ...plane,
      // Negative constant for raycasting
      constant: -plane.constant,
    } as THREE.Plane;
  }, [annotationPlane.position, annotationPlane.quaternion]);

  useEmptyCanvasInteraction({
    onPointerMove: handlePointerMove,
    planeNormal: raycastPlane.normal,
    planeConstant: raycastPlane.constant,
    doubleRaycast: true,
  });

  return null;
};
