import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { Matrix4, Mesh, Vector3 } from "three";
import { Transformable } from "../labels/shared/TransformControls";
import {
  activeSegmentationStateAtom,
  currentArchetypeSelectedForTransformAtom,
  editSegmentsModeAtom,
  hoveredVertexAtom,
  selectedPolylineVertexAtom,
  transformModeAtom,
} from "../state";
import { SphericalMarker } from "./SphericalMarker";
import { VertexTooltip } from "./VertexTooltip";
import {
  useEndDrag,
  useStartDrag,
  useTransientPolyline,
  useUpdateTransient,
} from "./store";
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
  tooltipDescriptor?: string | null;
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
  tooltipDescriptor = null,
}: PolylinePointMarkerProps) => {
  const meshRef = useRef<Mesh>(null);
  const transformControlsRef = useRef<any>(null);
  const [startMatrix, setStartMatrix] = useState<Matrix4 | null>(null);

  const [hoveredVertex, setHoveredVertex] = useRecoilState(hoveredVertexAtom);

  const setTransformMode = useSetRecoilState(transformModeAtom);

  const [selectedPoint, setSelectedPoint] = useRecoilState(
    selectedPolylineVertexAtom
  );
  const setCurrentArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom
  );

  const setSegmentState = useSetRecoilState(activeSegmentationStateAtom);
  const setEditSegmentsMode = useSetRecoilState(editSegmentsModeAtom);

  const isSelected =
    selectedPoint?.labelId === labelId &&
    selectedPoint?.segmentIndex === segmentIndex &&
    selectedPoint?.pointIndex === pointIndex;

  const isThisVertexHovered =
    hoveredVertex?.labelId === labelId &&
    hoveredVertex?.segmentIndex === segmentIndex &&
    hoveredVertex?.pointIndex === pointIndex;

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
      setSegmentState((prev) => ({
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
      setSegmentState,
      setEditSegmentsMode,
    ]
  );

  const { updatePolyline } = useUpdateTransient();

  const startDrag = useStartDrag();
  const endDragFn = useEndDrag();

  const transientPolyline = useTransientPolyline(labelId);

  const vertexKey = `${segmentIndex}-${pointIndex}`;

  const syncPointTransformationToTransientStore = useCallback(() => {
    if (groupRef.current) {
      const worldPosition = groupRef.current.position.clone();
      updatePolyline(labelId, {
        vertexDeltas: {
          [vertexKey]: [worldPosition.x, worldPosition.y, worldPosition.z],
        },
      });
    }
  }, [labelId, vertexKey, updatePolyline]);

  const handleTransformStart = useCallback(() => {
    startDrag(labelId);
    if (groupRef.current) {
      // Store the start matrix for computing delta later
      setStartMatrix(groupRef.current.matrixWorld.clone());
    }
  }, [startDrag, labelId]);

  const handleTransformEnd = useCallback(() => {
    if (groupRef.current && onPointMove && startMatrix) {
      // Compute world-space delta from start and end matrices
      const endMatrix = groupRef.current.matrixWorld.clone();
      const deltaMatrix = endMatrix
        .clone()
        .multiply(startMatrix.clone().invert());

      // Extract position delta from the delta matrix
      const deltaPosition = new Vector3();
      deltaPosition.setFromMatrixPosition(deltaMatrix);

      const newPosition = position.clone().add(deltaPosition);

      groupRef.current.position.set(0, 0, 0);

      onPointMove(newPosition);

      // note: this is a hack:
      // transformControls is updating in a buggy way when the point is moved
      const prevSelectedPoint = selectedPoint;
      setSelectedPoint(null);
      setTimeout(() => {
        setSelectedPoint(prevSelectedPoint);
      }, 0);

      // Clear the start matrix
      setStartMatrix(null);
    }

    endDragFn(labelId);
  }, [onPointMove, selectedPoint, position, startMatrix, endDragFn, labelId]);

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

  return (
    <Transformable
      archetype="point"
      isSelectedForTransform={isSelected}
      explicitObjectRef={groupRef}
      onTransformStart={handleTransformStart}
      onTransformChange={syncPointTransformationToTransientStore}
      onTransformEnd={handleTransformEnd}
      transformControlsRef={transformControlsRef}
      transformControlsPosition={position.toArray()}
    >
      <group
        ref={groupRef}
        position={transientPolyline?.vertexDeltas?.[vertexKey] ?? [0, 0, 0]}
        onPointerOver={() => {
          setHoveredVertex({ labelId, segmentIndex, pointIndex });
          document.body.style.cursor = "grab";
        }}
        onPointerOut={() => {
          setHoveredVertex(null);
          document.body.style.cursor = "default";
        }}
        onClick={handlePointClick}
      >
        <SphericalMarker
          ref={meshRef}
          position={position}
          color={color}
          size={size}
          isSelected={isSelected}
        />
        {tooltipDescriptor && (
          <VertexTooltip
            position={position.toArray()}
            tooltipDescriptor={tooltipDescriptor}
            isVisible={isThisVertexHovered}
          />
        )}
      </group>
    </Transformable>
  );
};
