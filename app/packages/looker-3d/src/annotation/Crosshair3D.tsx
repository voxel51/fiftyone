import { useTheme } from "@fiftyone/components";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import * as THREE from "three";
import { useFo3dContext } from "../fo3d/context";
import { sharedCursorPositionAtom } from "../state";

const CROSS_HAIR_SIZE = 20;
const LINE_WIDTH = 2;
const OPACITY = 0.7;

const HtmlContainer = styled.div`
  position: relative;
  pointer-events: none;
  z-index: 1000;
`;

const CrosshairBox = styled.div`
  position: absolute;
  left: -${CROSS_HAIR_SIZE / 2}px;
  top: -${CROSS_HAIR_SIZE / 2}px;
  width: ${CROSS_HAIR_SIZE}px;
  height: ${CROSS_HAIR_SIZE}px;
  pointer-events: none;
`;

const Horizontal = styled.div<{ $color: string }>`
  position: absolute;
  left: 0;
  top: 50%;
  width: 100%;
  height: ${LINE_WIDTH}px;
  background-color: ${(p) => p.$color};
  opacity: ${OPACITY};
  transform: translateY(-50%);
`;

const Vertical = styled.div<{ $color: string }>`
  position: absolute;
  left: 50%;
  top: 0;
  width: ${LINE_WIDTH}px;
  height: 100%;
  background-color: ${(p) => p.$color};
  opacity: ${OPACITY};
  transform: translateX(-50%);
`;

export const Crosshair3D = () => {
  const { camera } = useThree();
  const { sceneBoundingBox } = useFo3dContext();
  const theme = useTheme();

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

  // Calculate scale based on camera zoom (inverse)
  const scale = useMemo(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      return 1 / camera.zoom;
    }
    return 1;
  }, [camera]);

  if (!screenPosition) {
    return null;
  }

  // Only render if the point is in front of the camera
  if (screenPosition.z > 1) {
    return null;
  }

  // Only render if the point is within the viewport bounds (NDC: -1 to 1)
  if (
    screenPosition.x < -1 ||
    screenPosition.x > 1 ||
    screenPosition.y < -1 ||
    screenPosition.y > 1
  ) {
    return null;
  }

  return (
    <Html position={worldVector} scale={scale}>
      <HtmlContainer>
        <CrosshairBox>
          <Horizontal $color={theme.primary.main} />
          <Vertical $color={theme.primary.main} />
        </CrosshairBox>
      </HtmlContainer>
    </Html>
  );
};
