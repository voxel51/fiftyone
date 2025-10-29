import * as fos from "@fiftyone/state";
import { objectId } from "@fiftyone/utilities";
import { Line as LineDrei } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import * as THREE from "three";
import { SNAP_TOLERANCE } from "../constants";
import { useFo3dContext } from "../fo3d/context";
import { useEmptyCanvasInteraction } from "../hooks/use-empty-canvas-interaction";
import {
  activeSegmentationStateAtom,
  annotationPlaneAtom,
  currentActiveAnnotationField3dAtom,
  isSegmentingPointerDownAtom,
  polylinePointTransformsAtom,
  selectedLabelForAnnotationAtom,
  sharedCursorPositionAtom,
  snapCloseAutomaticallyAtom,
} from "../state";
import { getPlaneFromPositionAndQuaternion } from "../utils";
import { PolylinePointMarker } from "./PolylinePointMarker";
import { PolylinePointTransformData } from "./types";
import { useReverseSyncPolylinePointTransforms } from "./useReverseSyncPolylinePointTransforms";
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
  const [selectedLabelForAnnotation, setSelectedLabelForAnnotation] =
    useRecoilState(selectedLabelForAnnotationAtom);
  const [segmentState, setSegmentState] = useRecoilState(
    activeSegmentationStateAtom
  );
  const setTooltipDetail = useSetRecoilState(fos.tooltipDetail);
  const setPolylinePointTransforms = useSetRecoilState(
    polylinePointTransformsAtom
  );

  const setEditingToNewPolyline = useSetEditingToNewPolyline();

  const setIsActivelySegmenting = useSetRecoilState(
    isSegmentingPointerDownAtom
  );
  useReverseSyncPolylinePointTransforms();
  const setSharedCursorPosition = useSetRecoilState(sharedCursorPositionAtom);
  const annotationPlane = useRecoilValue(annotationPlaneAtom);
  const { upVector, sceneBoundingBox } = useFo3dContext();

  // Track last click time for double-click detection
  const lastClickTimeRef = useRef<number>(0);
  const DOUBLE_CLICK_THRESHOLD_MS = 200;
  const lastAddedVertexRef = useRef<[number, number, number] | null>(null);

  const commitSegment = useRecoilCallback(
    ({ snapshot }) =>
      (
        vertices: [number, number, number][],
        overrideShouldClose: boolean = false
      ) => {
        if (vertices.length < 2) return;

        const shouldClose =
          overrideShouldClose ||
          Boolean(snapshot.getLoadable(snapCloseAutomaticallyAtom).getValue());

        const labelId = selectedLabelForAnnotation?._id || objectId();

        const newSegment = {
          points: vertices.map(
            (pt) =>
              pt.map((p) => Number(p.toFixed(7))) as [number, number, number]
          ),
        };

        setPolylinePointTransforms((prev) => {
          let transformData: PolylinePointTransformData;
          if (!prev || Object.keys(prev).length === 0 || !prev[labelId]) {
            transformData = {
              segments: [newSegment],
              path: currentActiveField,
              sampleId: currentSampleId,
              misc: {
                closed: shouldClose,
              },
            };
          } else {
            const currentData = prev[labelId];
            const existingSegments = currentData?.segments || [];
            const newSegments = [...existingSegments, newSegment];
            transformData = {
              segments: newSegments,
              path: currentActiveField || "",
              sampleId: currentSampleId,
              misc: {
                ...(currentData?.misc ?? {}),
                closed: shouldClose,
              },
            };
          }
          setEditingToNewPolyline(labelId, transformData);
          return { ...(prev ?? {}), [labelId]: transformData };
        });

        if (selectedLabelForAnnotation) {
          setSelectedLabelForAnnotation({
            ...selectedLabelForAnnotation,
            _id: labelId,
          });
        } else {
          setSelectedLabelForAnnotation({
            _id: labelId,
            path: currentActiveField || "",
            sampleId: currentSampleId,
            _cls: "Polyline" as const,
            selected: false,
            label: "",
          });
        }

        setSegmentState({
          isActive: false,
          vertices: [],
          currentMousePosition: null,
          isClosed: false,
        });
      },
    [selectedLabelForAnnotation, currentActiveField, currentSampleId]
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
        commitSegment(verticesWithoutDuplicate);

        lastAddedVertexRef.current = null;
        return;
      }

      // Check if we should close the loop by clicking near the first vertex
      if (shouldCloseLoop(finalPos)) {
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
    [segmentState, shouldCloseLoop, commitSegment]
  );

  // Handle mouse move for rubber band effect
  const handleMouseMove = useCallback(
    (worldPos: THREE.Vector3, worldPosPerpendicular: THREE.Vector3 | null) => {
      if (!worldPos || ignoreEffects) return;

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
    [sceneBoundingBox, annotationPlane.enabled, ignoreEffects]
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
      setTooltipDetail(null);
      document.body.style.cursor = "crosshair";
      return () => {
        document.body.style.cursor = "default";
      };
    }
  }, [segmentState.isActive]);

  useEffect(() => {
    if (ignoreEffects) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!segmentState.isActive) return;

      // Handle Escape key - cancel segmentation
      if (event.key === "Escape") {
        setSegmentState({
          isActive: false,
          vertices: [],
          currentMousePosition: null,
          isClosed: false,
        });

        setIsActivelySegmenting(false);

        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }

      // Handle Delete/Backspace - remove last vertex
      if (event.key === "Delete" || event.key === "Backspace") {
        // Only handle if we have vertices to remove
        if (segmentState.vertices.length > 0) {
          setSegmentState((prev) => ({
            ...prev,
            vertices: prev.vertices.slice(0, -1),
          }));

          // Clear the last added vertex reference since we removed it
          lastAddedVertexRef.current = null;

          event.stopImmediatePropagation();
          event.preventDefault();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    segmentState.isActive,
    segmentState.vertices,
    setSegmentState,
    setIsActivelySegmenting,
  ]);

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
