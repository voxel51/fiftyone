import * as fos from "@fiftyone/state";
import { objectId } from "@fiftyone/utilities";
import { Line as LineDrei } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { SNAP_TOLERANCE } from "../constants";
import { useFo3dContext } from "../fo3d/context";
import { useEmptyCanvasInteraction } from "../hooks/use-empty-canvas-interaction";
import {
  annotationPlaneAtom,
  currentActiveAnnotationField3dAtom,
  isSegmentingPointerDownAtom,
  polylinePointTransformsAtom,
  segmentStateAtom,
  selectedLabelForAnnotationAtom,
  sharedCursorPositionAtom,
  snapCloseAutomaticallyAtom,
} from "../state";
import { getPlaneFromPositionAndQuaternion } from "../utils";
import { PolylinePointMarker } from "./PolylinePointMarker";
import type { PolylinePointTransformData } from "./types";
import { useSetEditingToNewPolyline } from "./useSetEditingToNewPolyline";
import { shouldClosePolylineLoop } from "./utils/polyline-utils";

interface SegmentPolylineRendererProps {
  ignoreEffects?: boolean;
  color?: string;
  lineWidth?: number;
  rubberBandColor?: string;
  rubberBandLineWidth?: number;
}

export const SegmentPolylineRenderer = ({
  ignoreEffects = false,
  color = "#00ff00",
  lineWidth = 3,
  rubberBandColor = "#ff0000",
  rubberBandLineWidth = 2,
}: SegmentPolylineRendererProps) => {
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const selectedLabelForAnnotation = useRecoilValue(
    selectedLabelForAnnotationAtom
  );
  const [segmentState, setSegmentState] = useRecoilState(segmentStateAtom);
  const [polylinePointTransforms, setPolylinePointTransforms] = useRecoilState(
    polylinePointTransformsAtom
  );
  const setEditingToNewPolyline = useSetEditingToNewPolyline();
  const [tempLabelId, setTempLabelId] = useState<string | null>(objectId());

  useEffect(() => {
    if (ignoreEffects) return;

    const newObjectId = objectId();
    setTempLabelId(newObjectId);
  }, [segmentState.isActive]);

  const setIsActivelySegmenting = useSetRecoilState(
    isSegmentingPointerDownAtom
  );
  const setSharedCursorPosition = useSetRecoilState(sharedCursorPositionAtom);
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const snapCloseAutomatically = useRecoilValue(snapCloseAutomaticallyAtom);
  const { upVector, sceneBoundingBox } = useFo3dContext();

  // Track last click time for double-click detection
  const lastClickTimeRef = useRef<number>(0);
  const DOUBLE_CLICK_THRESHOLD_MS = 200;
  const lastAddedVertexRef = useRef<[number, number, number] | null>(null);

  // Helper to commit completed segment immediately to transforms
  const commitSegment = useCallback(
    (vertices: [number, number, number][], isClosed: boolean) => {
      const labelId = selectedLabelForAnnotation?._id || tempLabelId;

      // Get existing segments from transforms
      const currentData = polylinePointTransforms[labelId];
      const existingSegments = currentData?.segments || [];

      // Create new segment
      const newSegment: { points: [number, number, number][] } = {
        points:
          isClosed && vertices.length > 2
            ? [...vertices, vertices[0]] // Close the loop
            : vertices,
      };

      // Add to existing segments
      const newSegments = [...existingSegments, newSegment];

      const transformData: PolylinePointTransformData = {
        segments: newSegments,
        path: currentActiveField || "",
        sampleId: currentSampleId,
      };

      setPolylinePointTransforms((prev) => ({
        ...prev,
        [labelId]: transformData,
      }));

      setEditingToNewPolyline(labelId, transformData);

      // Reset segment state
      setSegmentState({
        isActive: false,
        vertices: [],
        currentMousePosition: null,
        isClosed: false,
      });
    },
    [
      selectedLabelForAnnotation,
      tempLabelId,
      polylinePointTransforms,
      currentActiveField,
      currentSampleId,
      setPolylinePointTransforms,
      setEditingToNewPolyline,
      setSegmentState,
    ]
  );

  // Check if current position is close to first vertex for closing
  const shouldCloseLoop = useCallback(
    (currentPos: THREE.Vector3): boolean => {
      return shouldClosePolylineLoop(
        segmentState.vertices,
        [currentPos.x, currentPos.y, currentPos.z],
        SNAP_TOLERANCE
      );
    },
    [segmentState.vertices]
  );

  const handleClick = useCallback(
    (worldPos: THREE.Vector3) => {
      setIsActivelySegmenting(false);

      if (!segmentState.isActive) return;

      const finalPos = worldPos;

      const currentTime = Date.now();
      const isDoubleClick =
        currentTime - lastClickTimeRef.current < DOUBLE_CLICK_THRESHOLD_MS;

      lastClickTimeRef.current = currentTime;

      // Check for double-click behavior
      if (isDoubleClick && lastAddedVertexRef.current) {
        // Remove the last added vertex from the previous click
        setSegmentState((prev) => ({
          ...prev,
          vertices: prev.vertices.slice(0, -1),
        }));

        // Get the vertices without the duplicate
        const verticesWithoutDuplicate = segmentState.vertices.slice(0, -1);

        // Commit the segment immediately
        commitSegment(verticesWithoutDuplicate, snapCloseAutomatically);

        lastAddedVertexRef.current = null;
        return;
      }

      // Check if we should close the loop by clicking near the first vertex
      if (shouldCloseLoop(finalPos)) {
        // Commit the closed segment immediately
        commitSegment(segmentState.vertices, true);

        lastAddedVertexRef.current = null;
        return;
      }

      // Add new vertex for single click
      const newVertex: [number, number, number] = [
        finalPos.x,
        finalPos.y,
        finalPos.z,
      ];
      setSegmentState((prev) => ({
        ...prev,
        vertices: [...prev.vertices, newVertex],
      }));

      lastAddedVertexRef.current = newVertex;
    },
    [segmentState, shouldCloseLoop, snapCloseAutomatically, commitSegment]
  );

  // Handle mouse move for rubber band effect
  const handleMouseMove = useCallback(
    (worldPos: THREE.Vector3, worldPosPerpendicular: THREE.Vector3 | null) => {
      if (!worldPos) return;

      const segmentPos = worldPos.clone();
      setSegmentState((prev) => ({
        ...prev,
        currentMousePosition: [segmentPos.x, segmentPos.y, segmentPos.z],
      }));

      const cursorPos =
        !annotationPlane.enabled && worldPosPerpendicular
          ? worldPosPerpendicular.clone()
          : worldPos.clone();

      setSharedCursorPosition([cursorPos.x, cursorPos.y, cursorPos.z]);
    },
    [sceneBoundingBox, annotationPlane.enabled]
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
  }, [annotationPlane, upVector]);

  useEmptyCanvasInteraction({
    onPointerUp: segmentState.isActive ? handleClick : undefined,
    onPointerDown: segmentState.isActive
      ? () => setIsActivelySegmenting(true)
      : undefined,
    onPointerMove: handleMouseMove,
    planeNormal: raycastPlane.normal,
    planeConstant: raycastPlane.constant,
    doubleRaycast: !ignoreEffects,
  });

  useEffect(() => {
    if (ignoreEffects) return;
    if (segmentState.isActive) {
      document.body.style.cursor = "crosshair";
      return () => {
        document.body.style.cursor = "default";
      };
    }
  }, [segmentState.isActive]);

  useEffect(() => {
    if (ignoreEffects) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && segmentState.isActive) {
        setSegmentState({
          isActive: false,
          vertices: [],
          currentMousePosition: null,
          isClosed: false,
        });

        setIsActivelySegmenting(false);

        event.stopImmediatePropagation();
        event.preventDefault();
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

  // Rubber band from last vertex to current mouse position
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

  const vertexMarkers = useMemo(() => {
    const markers = [];

    // Current segment vertices (while actively segmenting)
    if (segmentState.vertices.length > 0) {
      segmentState.vertices.forEach((vertex, index) => {
        markers.push(
          <PolylinePointMarker
            key={`current-vertex-${index}`}
            position={new THREE.Vector3(...vertex)}
            color={
              index === 0 || index === segmentState.vertices.length - 1
                ? "#ff0000"
                : color
            }
            size={0.05}
            pulsate={false}
            isDraggable={false}
            labelId="segmenting"
            segmentIndex={0}
            pointIndex={index}
          />
        );
      });
    }

    return markers.length > 0 ? markers : null;
  }, [segmentState.vertices, color]);

  if (!segmentState.isActive && segmentState.vertices.length === 0) {
    return null;
  }

  return (
    <group>
      {completedSegments}
      {rubberBand}
      {vertexMarkers}
    </group>
  );
};
