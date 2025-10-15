import { useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { Mesh, Vector3 } from "three";
import { LABEL_3D_ANNOTATION_POINT_SELECTED_FOR_TRANSFORMATION_COLOR } from "../constants";
import { Transformable } from "../labels/shared/TransformControls";
import {
  currentArchetypeSelectedForTransformAtom,
  hoveredPolylineInfoAtom,
  segmentPolylineStateAtom,
  selectedPolylineVertexAtom,
  transformModeAtom,
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
  const setTransformMode = useSetRecoilState(transformModeAtom);

  const [selectedPoint, setSelectedPoint] = useRecoilState(
    selectedPolylineVertexAtom
  );
  const setCurrentArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom
  );

  const setSegmentPolylineState = useSetRecoilState(segmentPolylineStateAtom);

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
      };

      setSelectedPoint(newSelectedPoint);
      setCurrentArchetypeSelectedForTransform("point");
      setTransformMode("translate");

      setSegmentPolylineState((prev) => ({
        ...prev,
        isActive: false,
      }));
    },
    [isDraggable, labelId, segmentIndex, pointIndex]
  );

  const handleTransformEnd = useCallback(() => {
    if (transformControlsRef.current && onPointMove) {
      const delta = transformControlsRef.current.offset.clone();

      const newPosition = position.clone().add(delta);

      groupRef.current.position.set(0, 0, 0);

      onPointMove(newPosition);

      // note: this is a hack:
      // transformControls is updating in a buggy way when the point is moved
      const prevSelectedPoint = selectedPoint;
      setSelectedPoint(null);
      setTimeout(() => {
        setSelectedPoint(prevSelectedPoint);
      }, 0);
    }
  }, [onPointMove, selectedPoint, position]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPoint(null);
        event.stopPropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [setSelectedPoint]);

  // Apply distance-based scaling
  useFrame(({ clock, camera }) => {
    const distance = camera.position.distanceTo(position);

    // Scale proportionally with distance to compensate for perspective
    const screenSpaceScale = distance * 0.1;
    let finalScale = screenSpaceScale;

    if (pulsate) {
      const t = clock.getElapsedTime();
      const pulse = 0.8 + 0.2 * Math.sin(t * 3);
      finalScale = screenSpaceScale * pulse;
    }

    if (meshRef.current) {
      meshRef.current.scale.set(finalScale, finalScale, finalScale);
    }

    if (transformControlsRef.current) {
      transformControlsRef.current.position.set(0, 0, 0);
      groupRef.current.updateMatrixWorld();
      transformControlsRef.current.updateMatrixWorld();
    }
  });

  const groupRef = useRef(null);

  return (
    <Transformable
      archetype="point"
      isSelectedForTransform={isSelected}
      explicitObjectRef={groupRef}
      onTransformEnd={handleTransformEnd}
      transformControlsRef={transformControlsRef}
      transformControlsPosition={position.toArray()}
    >
      <group ref={groupRef}>
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
      </group>
    </Transformable>
  );
};
