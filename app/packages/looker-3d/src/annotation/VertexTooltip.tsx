import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import styled from "styled-components";
import * as THREE from "three";

const TooltipContainer = styled.div`
  position: relative;
  pointer-events: none;
  z-index: 1000;
`;

const TooltipContent = styled.div`
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
`;

interface VertexTooltipProps {
  position: [number, number, number];
  tooltipDescriptor: string | null;
  isVisible: boolean;
}

const formatCoordinate = (coord: number) => coord.toFixed(2);

export const VertexTooltip = ({
  position,
  tooltipDescriptor,
  isVisible,
}: VertexTooltipProps) => {
  const { camera } = useThree();

  const scale = useMemo(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      return 1 / camera.zoom;
    }
    return 1;
  }, [camera]);

  if (!isVisible || !tooltipDescriptor) {
    return null;
  }

  return (
    <Html position={position} scale={scale} pointerEvents="none">
      <TooltipContainer>
        <TooltipContent>
          <div>{tooltipDescriptor}</div>
          <div>
            ({formatCoordinate(position[0])}, {formatCoordinate(position[1])},{" "}
            {formatCoordinate(position[2])})
          </div>
        </TooltipContent>
      </TooltipContainer>
    </Html>
  );
};
