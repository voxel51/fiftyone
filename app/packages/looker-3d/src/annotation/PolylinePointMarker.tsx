import { useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { Mesh, Vector3 } from "three";
import { LABEL_3D_ANNOTATION_POINT_SELECTED_FOR_TRANSFORMATION_COLOR } from "../constants";
import { Transformable } from "../labels/shared/TransformControls";
import {
  currentArchetypeSelectedForTransformAtom,
  editSegmentsModeAtom,
  hoveredPolylineInfoAtom,
  segmentPolylineStateAtom,
  selectedPolylineVertexAtom,
  tempVertexTransformsAtom,
  transformModeAtom,
} from "../state";
import type { SelectedPoint } from "./types";

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
  const setEditSegmentsMode = useSetRecoilState(editSegmentsModeAtom);

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

      // Deactivate other modes when selecting a point
      setSegmentPolylineState((prev) => ({
        ...prev,
        isActive: false,
      }));
      setEditSegmentsMode(false);
    },
    [
      isDraggable,
      labelId,
      segmentIndex,
      pointIndex,
      setSelectedPoint,
      setCurrentArchetypeSelectedForTransform,
      setTransformMode,
      setSegmentPolylineState,
      setEditSegmentsMode,
    ]
  );

  const syncPointTransformationToTempStore = useCallback(() => {
    if (groupRef.current) {
      const worldPosition = groupRef.current.position.clone();
      setTempVertexTransforms({
        position: [worldPosition.x, worldPosition.y, worldPosition.z],
        quaternion: groupRef.current.quaternion.toArray(),
      });
    }
  }, []);

  const handleTransformEnd = useCallback(() => {
    setTempVertexTransforms(null);

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
      if (event.key === "Escape" && selectedPoint) {
        setSelectedPoint(null);
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [setSelectedPoint, selectedPoint]);

  // Apply distance-based scaling with min/max bounds
  useFrame(({ clock, camera }) => {
    const distance = camera.position.distanceTo(position);

    const rawScale = distance;
    const minScale = 2;
    const maxScale = 10.0;
    const screenSpaceScale = Math.max(minScale, Math.min(maxScale, rawScale));
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

  const [tempVertexTransforms, setTempVertexTransforms] = useRecoilState(
    tempVertexTransformsAtom(`${labelId}-${segmentIndex}-${pointIndex}`)
  );

  useEffect(() => {
    return () => {
      setTempVertexTransforms(null);
    };
  }, []);

  return (
    <Transformable
      archetype="point"
      isSelectedForTransform={isSelected}
      explicitObjectRef={groupRef}
      onTransformChange={syncPointTransformationToTempStore}
      onTransformEnd={handleTransformEnd}
      transformControlsRef={transformControlsRef}
      transformControlsPosition={position.toArray()}
    >
      <group
        ref={groupRef}
        position={tempVertexTransforms?.position}
        quaternion={tempVertexTransforms?.quaternion}
      >
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
