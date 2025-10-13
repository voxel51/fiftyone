import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import * as THREE from "three";
import { useFo3dContext } from "../fo3d/context";
import { segmentPolylineStateAtom, sharedCursorPositionAtom } from "../state";

const CROSS_HAIR_SIZE = 20;
const LINE_WIDTH = 2;
const COLOR = "#00ffff";
const OPACITY = 0.7;

export const Crosshair3D = () => {
  const { camera } = useThree();
  const { sceneBoundingBox } = useFo3dContext();

  const worldPosition = useRecoilValue(sharedCursorPositionAtom);

  const worldVector = useMemo(() => {
    if (!worldPosition) return null;

    const vector = new THREE.Vector3(...worldPosition);

    // Constrain position to scene bounds
    if (sceneBoundingBox && !sceneBoundingBox.isEmpty()) {
      vector.clamp(sceneBoundingBox.min, sceneBoundingBox.max);
    }

    return vector;
  }, [worldPosition, sceneBoundingBox]);

  // Convert 3D world position to 2D screen coordinates
  const screenPosition = useMemo(() => {
    if (!worldVector) return null;

    return worldVector.clone().project(camera);
  }, [worldVector, camera]);

  if (!screenPosition) {
    return null;
  }

  // Only render if the point is in front of the camera
  if (screenPosition.z > 1) {
    return null;
  }

  return (
    <Html
      position={worldVector}
      style={{
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -CROSS_HAIR_SIZE / 2,
          top: -CROSS_HAIR_SIZE / 2,
          width: CROSS_HAIR_SIZE,
          height: CROSS_HAIR_SIZE,
          pointerEvents: "none",
        }}
      >
        {/* Horizontal line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            width: "100%",
            height: LINE_WIDTH,
            backgroundColor: COLOR,
            opacity: OPACITY,
            transform: "translateY(-50%)",
          }}
        />
        {/* Vertical line */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: LINE_WIDTH,
            height: "100%",
            backgroundColor: COLOR,
            opacity: OPACITY,
            transform: "translateX(-50%)",
          }}
        />
      </div>
    </Html>
  );
};
