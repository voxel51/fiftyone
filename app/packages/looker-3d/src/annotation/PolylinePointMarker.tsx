import { TransformControls, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { Mesh, Vector3 } from "three";
import { LABEL_3D_ANNOTATION_POINT_SELECTED_FOR_TRANSFORMATION_COLOR } from "../constants";
import {
  currentPointPositionAtom,
  hoveredPolylineInfoAtom,
  isInEntireLabelTransformModeAtom,
  isPointTransformModeAtom,
  isPointTransformingAtom,
  selectedPointAtom,
  transformModeAtom,
  transformSpaceAtom,
  type SelectedPoint,
} from "../state";

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
  const meshRef = useRef<Mesh>(null);
  const transformControlsRef = useRef<any>(null);

  const [isHovered, setIsHovered] = useState(false);

  const setHoveredPolylineInfo = useSetRecoilState(hoveredPolylineInfoAtom);
  const setIsPointTransforming = useSetRecoilState(isPointTransformingAtom);
  const setTransformMode = useSetRecoilState(transformModeAtom);
  const setCurrentPointPosition = useSetRecoilState(currentPointPositionAtom);

  const [selectedPoint, setSelectedPoint] = useRecoilState(selectedPointAtom);
  const [isPointTransformMode, setIsPointTransformMode] = useRecoilState(
    isPointTransformModeAtom
  );
  const [transformMode] = useRecoilState(transformModeAtom);
  const [transformSpace] = useRecoilState(transformSpaceAtom);
  const setIsInEntireLabelTransformMode = useSetRecoilState(
    isInEntireLabelTransformModeAtom
  );

  const isSelected =
    selectedPoint?.labelId === labelId &&
    selectedPoint?.segmentIndex === segmentIndex &&
    selectedPoint?.pointIndex === pointIndex;

  useCursor(isHovered && isDraggable, "grab", "auto");

  const handlePointClick = useCallback(
    (event: any) => {
      if (!isDraggable) return;

      event.stopPropagation();

      setIsInEntireLabelTransformMode(false);

      const newSelectedPoint: SelectedPoint = {
        labelId,
        segmentIndex,
        pointIndex,
        position: [position.x, position.y, position.z],
      };

      setSelectedPoint(newSelectedPoint);
      setIsPointTransformMode(true);
      setTransformMode("translate");
    },
    [isDraggable, labelId, segmentIndex, pointIndex, position]
  );

  const handleTransformStart = useCallback(() => {
    setIsPointTransforming(true);
  }, [setIsPointTransforming]);

  const handleTransformChange = useCallback(() => {
    if (transformControlsRef.current) {
      const object = transformControlsRef.current.object;
      const currentPosition = object.position.clone();
      setCurrentPointPosition([
        currentPosition.x,
        currentPosition.y,
        currentPosition.z,
      ]);
    }
  }, [setCurrentPointPosition]);

  const handleTransformEnd = useCallback(() => {
    if (transformControlsRef.current && onPointMove) {
      const object = transformControlsRef.current.object;
      const newPosition = object.position.clone();

      onPointMove(newPosition);

      // Update the selectedPoint position in the atom to reflect current position in HUD
      if (isSelected) {
        setSelectedPoint((prev) =>
          prev
            ? {
                ...prev,
                position: [newPosition.x, newPosition.y, newPosition.z],
              }
            : null
        );
      }
    }
    setIsPointTransforming(false);
    setCurrentPointPosition(null);
  }, [onPointMove, isSelected, setSelectedPoint, setCurrentPointPosition]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPoint(null);
        setIsPointTransformMode(false);
        setIsPointTransforming(false);
        setCurrentPointPosition(null);
        event.stopPropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    setSelectedPoint,
    setIsPointTransformMode,
    setIsPointTransforming,
    setCurrentPointPosition,
  ]);

  // Apply distance-based scaling
  useFrame(({ clock, camera }) => {
    const distance = camera.position.distanceTo(position);

    // Base scale factor - far objects appear slightly bigger, close objects medium size
    const baseScale = Math.max(0.8, Math.min(2.0, 1.0 + distance * 0.05));

    let finalScale = baseScale;

    if (pulsate) {
      const t = clock.getElapsedTime();
      const pulse = 0.8 + 0.2 * Math.sin(t * 3);
      finalScale = baseScale * pulse;
    }

    if (meshRef.current) {
      meshRef.current.scale.set(finalScale, finalScale, finalScale);
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
