import { TransformControls, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { Vector3 } from "three";
import { LABEL_3D_ANNOTATION_POINT_SELECTED_FOR_TRANSFORMATION_COLOR } from "../../constants";
import {
  hoveredPolylineInfoAtom,
  isPointTransformModeAtom,
  isPointTransformingAtom,
  selectedPointAtom,
  transformModeAtom,
  transformSpaceAtom,
  type SelectedPoint,
} from "../../state";

interface PolylinePointMarkerProps {
  position: Vector3;
  color?: string;
  size?: number;
  pulsate?: boolean;
  isDraggable?: boolean;
  labelId: string;
  segmentIndex: number;
  pointIndex: number;
  onPointMove?: (newPosition: Vector3) => void;
}

export const PolylinePointMarker = ({
  position,
  color = "#ffffff",
  size = 0.05,
  pulsate = true,
  isDraggable = false,
  labelId,
  segmentIndex,
  pointIndex,
  onPointMove,
}: PolylinePointMarkerProps) => {
  const meshRef = useRef<any>(null);
  const transformControlsRef = useRef<any>(null);

  const [isHovered, setIsHovered] = useState(false);

  const setHoveredPolylineInfo = useSetRecoilState(hoveredPolylineInfoAtom);
  const setIsPointTransforming = useSetRecoilState(isPointTransformingAtom);

  const [selectedPoint, setSelectedPoint] = useRecoilState(selectedPointAtom);
  const [isPointTransformMode, setIsPointTransformMode] = useRecoilState(
    isPointTransformModeAtom
  );
  const [transformMode] = useRecoilState(transformModeAtom);
  const [transformSpace] = useRecoilState(transformSpaceAtom);

  const isSelected =
    selectedPoint?.labelId === labelId &&
    selectedPoint?.segmentIndex === segmentIndex &&
    selectedPoint?.pointIndex === pointIndex;

  useCursor(isHovered && isDraggable, "grab", "auto");

  const handlePointClick = useCallback(
    (event: any) => {
      if (!isDraggable) return;

      event.stopPropagation();

      const newSelectedPoint: SelectedPoint = {
        labelId,
        segmentIndex,
        pointIndex,
        position: [position.x, position.y, position.z],
      };

      setSelectedPoint(newSelectedPoint);
      setIsPointTransformMode(true);
    },
    [
      isDraggable,
      labelId,
      segmentIndex,
      pointIndex,
      position,
      setSelectedPoint,
      setIsPointTransformMode,
    ]
  );

  const handleTransformStart = useCallback(() => {
    setIsPointTransforming(true);
  }, [setIsPointTransforming]);

  const handleTransformEnd = useCallback(() => {
    setIsPointTransforming(false);
  }, [setIsPointTransforming]);

  const handleTransformChange = useCallback(() => {
    if (transformControlsRef.current && onPointMove) {
      const newPosition = transformControlsRef.current.position.clone();
      onPointMove(newPosition);
    }
  }, [onPointMove]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPoint(null);
        setIsPointTransformMode(false);
        setIsPointTransforming(false);
        event.stopPropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [setSelectedPoint, setIsPointTransformMode, setIsPointTransforming]);

  // Apply pulsating effect for visibility (if enabled)
  useFrame(({ clock, camera }) => {
    const distance = camera.position.distanceTo(position);

    if (pulsate) {
      const t = clock.getElapsedTime();
      const pulse = 0.8 + 0.2 * Math.sin(t * 3);
      const scale = pulse * (distance * 0.08);

      if (meshRef.current) {
        meshRef.current.scale.set(scale, scale, scale);
      }
    } else {
      // Static scale based on distance only
      const scale = distance * 0.12;

      if (meshRef.current) {
        meshRef.current.scale.set(scale, scale, scale);
      }
    }
  });

  return (
    <>
      <mesh
        ref={meshRef}
        position={position}
        onPointerOver={() => {
          setIsHovered(true);
          setHoveredPolylineInfo({
            labelId,
            segmentIndex,
            pointIndex,
          });
        }}
        onPointerOut={() => {
          setIsHovered(false);
          setHoveredPolylineInfo(null);
        }}
        onClick={handlePointClick}
      >
        <sphereGeometry args={[size, 10, 10]} />
        <meshStandardMaterial
          color={
            isSelected
              ? LABEL_3D_ANNOTATION_POINT_SELECTED_FOR_TRANSFORMATION_COLOR
              : color
          }
          emissive={
            isSelected
              ? LABEL_3D_ANNOTATION_POINT_SELECTED_FOR_TRANSFORMATION_COLOR
              : color
          }
          emissiveIntensity={isSelected ? 1 : 0.3}
        />
      </mesh>
      {isSelected && isPointTransformMode && (
        <TransformControls
          ref={transformControlsRef}
          object={meshRef}
          mode={transformMode}
          space={transformSpace}
          onMouseDown={handleTransformStart}
          onMouseUp={handleTransformEnd}
          onObjectChange={handleTransformChange}
        />
      )}
    </>
  );
};
