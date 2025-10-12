import { Line as LineDrei } from "@react-three/drei";
import { useCallback, useEffect, useMemo } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { SNAP_TOLERANCE } from "../constants";
import { useFo3dContext } from "../fo3d/context";
import { useEmptyCanvasInteraction } from "../hooks/use-empty-canvas-interaction";
import {
  annotationPlaneAtom,
  isSegmentingPointerDownAtom,
  segmentPolylineStateAtom,
  sharedCursorPositionAtom,
  tempPolylinesAtom,
  type TempPolyline,
} from "../state";
import { getPlaneFromPositionAndQuaternion } from "../utils";

interface SegmentPolylineRendererProps {
  color?: string;
  lineWidth?: number;
  rubberBandColor?: string;
  rubberBandLineWidth?: number;
}

export const SegmentPolylineRenderer = ({
  color = "#00ff00",
  lineWidth = 3,
  rubberBandColor = "#ff0000",
  rubberBandLineWidth = 2,
}: SegmentPolylineRendererProps) => {
  const [segmentState, setSegmentState] = useRecoilState(
    segmentPolylineStateAtom
  );
  const [tempPolylines, setTempPolylines] = useRecoilState(tempPolylinesAtom);
  const setIsActivelySegmenting = useSetRecoilState(
    isSegmentingPointerDownAtom
  );
  const setSharedCursorPosition = useSetRecoilState(sharedCursorPositionAtom);
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const { upVector, sceneBoundingBox } = useFo3dContext();

  // Check if current position is close to first vertex for closing
  const shouldCloseLoop = useCallback(
    (currentPos: THREE.Vector3): boolean => {
      if (segmentState.vertices.length < 3) return false;

      const firstVertex = new THREE.Vector3(...segmentState.vertices[0]);
      return currentPos.distanceTo(firstVertex) < SNAP_TOLERANCE;
    },
    [segmentState.vertices, SNAP_TOLERANCE]
  );

  const handleClick = useCallback(
    (worldPos: THREE.Vector3) => {
      setIsActivelySegmenting(false);

      if (!segmentState.isActive) return;

      // Project vertex to annotation plane for z-drift prevention
      let finalPos = worldPos;
      if (annotationPlane.enabled) {
        const plane = getPlaneFromPositionAndQuaternion(
          annotationPlane.position,
          annotationPlane.quaternion
        );
        const projectedPos = new THREE.Vector3();
        plane.projectPoint(worldPos, projectedPos);
        finalPos = projectedPos;
      }

      if (shouldCloseLoop(finalPos)) {
        const tempPolyline: TempPolyline = {
          id: `temp-polyline-${Date.now()}`,
          vertices: segmentState.vertices,
          isClosed: true,
          color: "#00ff00",
          lineWidth: 3,
        };

        setTempPolylines((prev) => [...prev, tempPolyline]);

        setSegmentState({
          isActive: true,
          vertices: [],
          currentMousePosition: null,
          isClosed: false,
        });

        return;
      }

      // Add new vertex
      setSegmentState((prev) => ({
        ...prev,
        vertices: [...prev.vertices, [finalPos.x, finalPos.y, finalPos.z]],
      }));
    },
    [
      segmentState,
      shouldCloseLoop,
      setSegmentState,
      setTempPolylines,
      annotationPlane,
    ]
  );

  // Handle mouse move for rubber band effect
  const handleMouseMove = useCallback(
    (worldPos: THREE.Vector3) => {
      if (!segmentState.isActive) return;

      // Project cursor position to annotation plane if enabled
      let finalPos = worldPos;
      if (annotationPlane.enabled) {
        const plane = getPlaneFromPositionAndQuaternion(
          annotationPlane.position,
          annotationPlane.quaternion
        );
        const projectedPos = new THREE.Vector3();
        plane.projectPoint(worldPos, projectedPos);
        finalPos = projectedPos;
      }

      // Constrain position to scene bounds
      if (sceneBoundingBox && !sceneBoundingBox.isEmpty()) {
        finalPos.clamp(sceneBoundingBox.min, sceneBoundingBox.max);
      }

      setSegmentState((prev) => ({
        ...prev,
        currentMousePosition: [finalPos.x, finalPos.y, finalPos.z],
      }));

      setSharedCursorPosition([finalPos.x, finalPos.y, finalPos.z]);
    },
    [segmentState.isActive, annotationPlane, sceneBoundingBox]
  );

  useEmptyCanvasInteraction({
    onPointerUp: segmentState.isActive ? handleClick : undefined,
    onPointerDown: segmentState.isActive
      ? () => setIsActivelySegmenting(true)
      : undefined,
    onPointerMove: segmentState.isActive ? handleMouseMove : undefined,
    planeNormal: upVector || new THREE.Vector3(0, 0, 1),
    planeConstant: 0,
  });

  useEffect(() => {
    if (segmentState.isActive) {
      document.body.style.cursor = "crosshair";
      return () => {
        document.body.style.cursor = "default";
      };
    }
  }, [segmentState.isActive]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && segmentState.isActive) {
        setSegmentState({
          isActive: false,
          vertices: [],
          currentMousePosition: null,
          isClosed: false,
        });

        setIsActivelySegmenting(false);

        event.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [segmentState.isActive, setSegmentState]);

  // Render completed segments
  const completedSegments = useMemo(() => {
    if (segmentState.vertices.length < 2) return null;

    const segments = [];
    for (let i = 0; i < segmentState.vertices.length - 1; i++) {
      segments.push(
        <LineDrei
          key={`segment-${i}`}
          points={[segmentState.vertices[i], segmentState.vertices[i + 1]]}
          color={color}
          lineWidth={lineWidth}
        />
      );
    }

    // If closed, add line from last vertex to first
    if (segmentState.isClosed && segmentState.vertices.length > 2) {
      segments.push(
        <LineDrei
          key="closing-segment"
          points={[
            segmentState.vertices[segmentState.vertices.length - 1],
            segmentState.vertices[0],
          ]}
          color={color}
          lineWidth={lineWidth}
        />
      );
    }

    return segments;
  }, [segmentState.vertices, segmentState.isClosed, color, lineWidth]);

  // Render temporary polylines
  const tempPolylineElements = useMemo(() => {
    return tempPolylines.map((polyline) => {
      const segments = [];

      // Create line segments between consecutive vertices
      for (let i = 0; i < polyline.vertices.length - 1; i++) {
        segments.push(
          <LineDrei
            key={`${polyline.id}-segment-${i}`}
            points={[polyline.vertices[i], polyline.vertices[i + 1]]}
            color={polyline.color}
            lineWidth={polyline.lineWidth}
          />
        );
      }

      // If closed, add line from last vertex to first
      if (polyline.isClosed && polyline.vertices.length > 2) {
        segments.push(
          <LineDrei
            key={`${polyline.id}-closing-segment`}
            points={[
              polyline.vertices[polyline.vertices.length - 1],
              polyline.vertices[0],
            ]}
            color={polyline.color}
            lineWidth={polyline.lineWidth}
          />
        );
      }

      return segments;
    });
  }, [tempPolylines]);

  // Render rubber band from last vertex to current mouse position
  const rubberBand = useMemo(() => {
    if (
      !segmentState.isActive ||
      segmentState.vertices.length === 0 ||
      !segmentState.currentMousePosition
    ) {
      return null;
    }

    const lastVertex = segmentState.vertices[segmentState.vertices.length - 1];

    return (
      <LineDrei
        key="rubber-band"
        points={[lastVertex, segmentState.currentMousePosition]}
        color={rubberBandColor}
        lineWidth={rubberBandLineWidth}
        dashed
        dashSize={0.1}
        gapSize={0.1}
      />
    );
  }, [
    segmentState.isActive,
    segmentState.vertices,
    segmentState.currentMousePosition,
    rubberBandColor,
    rubberBandLineWidth,
  ]);

  // Render vertex markers
  const vertexMarkers = useMemo(() => {
    if (segmentState.vertices.length === 0) return null;

    return segmentState.vertices.map((vertex, index) => (
      <mesh key={`vertex-${index}`} position={new THREE.Vector3(...vertex)}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={index === 0 ? "#ff0000" : color} />
      </mesh>
    ));
  }, [segmentState.vertices, color]);

  if (
    !segmentState.isActive &&
    segmentState.vertices.length === 0 &&
    tempPolylines.length === 0
  ) {
    return null;
  }

  return (
    <group>
      {tempPolylineElements}
      {completedSegments}
      {rubberBand}
      {vertexMarkers}
    </group>
  );
};
