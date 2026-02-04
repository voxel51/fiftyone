import { POLYLINE } from "@fiftyone/utilities";
import { Line as LineDrei } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
import chroma from "chroma-js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import type { Vector3Tuple } from "three";
import * as THREE from "three";
import {
  useEndDrag,
  usePolylineOperations,
  useStartDrag,
  useTransientPolyline,
  useUpdateTransient,
  useWorkingLabel,
} from "../annotation/store";
import type { TransientPolylineState } from "../annotation/store/types";
import {
  editSegmentsModeAtom,
  hoveredLabelAtom,
  selectedPolylineVertexAtom,
  tempVertexTransformsAtom,
} from "../state";
import { PolylinePointMarker } from "./PolylinePointMarker";
import {
  findClickedSegment,
  insertVertexInSegment,
  updateVertexPosition,
} from "./utils/polyline-utils";

interface UsePolylineAnnotationProps {
  label: any;
  points3d: Vector3Tuple[][];
  strokeAndFillColor: string;
  isAnnotateMode: boolean;
  isSelectedForAnnotation: boolean;
}

export const usePolylineAnnotation = ({
  label,
  points3d,
  strokeAndFillColor,
  isAnnotateMode,
  isSelectedForAnnotation,
}: UsePolylineAnnotationProps) => {
  const labelId = label._id;

  const workingLabel = useWorkingLabel(labelId);
  const transientState = useTransientPolyline(labelId);
  const { updatePolyline } = useUpdateTransient();
  const startDrag = useStartDrag();
  const endDrag = useEndDrag();

  const { finalizePolylineDrag, updatePolylinePoints } =
    usePolylineOperations();

  const selectedPoint = useRecoilValue(selectedPolylineVertexAtom);
  const editSegmentsMode = useRecoilValue(editSegmentsModeAtom);
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);

  const transformControlsRef = useRef(null);
  const contentRef = useRef<THREE.Group>(null);

  // Compute effective points3d from working store (or fallback to props)
  const effectivePoints3d = useMemo(() => {
    if (workingLabel && workingLabel._cls === POLYLINE) {
      return workingLabel.points3d;
    }
    return points3d;
  }, [workingLabel, points3d]);

  const centroid = useMemo(() => {
    if (effectivePoints3d.length === 0) return [0, 0, 0];

    const allPoints = effectivePoints3d.flat();
    if (allPoints.length === 0) return [0, 0, 0];

    const sum = allPoints.reduce(
      (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]],
      [0, 0, 0]
    );

    return [
      sum[0] / allPoints.length,
      sum[1] / allPoints.length,
      sum[2] / allPoints.length,
    ];
  }, [effectivePoints3d]);

  const pointMarkers = useMemo(() => {
    if (!isAnnotateMode || !isSelectedForAnnotation) return null;

    if (!strokeAndFillColor) return null;

    // This is to have contrast for annotation,
    // Or else the point markers would be invisible with large line widths
    const complementaryColor = chroma(strokeAndFillColor)
      .set("hsl.h", "+180")
      .hex();

    // Global deduplication set to prevent multiple markers for the same physical vertex
    // This ensures that shared vertices between segments only get one draggable marker
    const visitedPoints = new Set<string>();

    return effectivePoints3d.flatMap((segment, segmentIndex) => {
      return segment.map((point, pointIndex) => {
        // Note: important to use a key based only on coordinates (not segment/point indices)
        // This allows proper deduplication of vertices that appear in multiple segments
        const key = `${point[0]}-${point[1]}-${point[2]}`;

        // Skip creating a marker if we've already seen this vertex position
        if (visitedPoints.has(key)) {
          return null;
        }

        // Mark this vertex position as visited to prevent duplicates
        visitedPoints.add(key);

        return (
          <PolylinePointMarker
            key={key}
            position={new THREE.Vector3(...point)}
            color={complementaryColor}
            isDraggable={true}
            labelId={labelId}
            segmentIndex={segmentIndex}
            pointIndex={pointIndex}
            tooltipDescriptor="Vertex"
            onPointMove={(newPosition) => {
              const newSegments = updateVertexPosition(
                effectivePoints3d,
                effectivePoints3d.map((seg) => ({ points: seg })),
                segmentIndex,
                pointIndex,
                [newPosition.x, newPosition.y, newPosition.z],
                // Update shared vertices
                true
              );

              const newPoints3d = newSegments.map((seg) => seg.points);
              updatePolylinePoints(labelId, newPoints3d);
            }}
            pulsate={false}
          />
        );
      });
    });
  }, [
    isAnnotateMode,
    isSelectedForAnnotation,
    effectivePoints3d,
    labelId,
    strokeAndFillColor,
    updatePolylinePoints,
  ]);

  const centroidMarker = useMemo(() => {
    if (!isAnnotateMode || !isSelectedForAnnotation) return null;

    if (!strokeAndFillColor) return null;

    const centroidColor = chroma(strokeAndFillColor)
      .set("hsl.h", "+180")
      .brighten(1.5)
      .hex();

    return (
      <PolylinePointMarker
        key={`centroid-${labelId}`}
        position={new THREE.Vector3(...centroid)}
        color={centroidColor}
        size={0.05}
        pulsate={true}
        labelId={labelId}
        segmentIndex={-1}
        pointIndex={-1}
        tooltipDescriptor="Centroid"
      />
    );
  }, [
    isAnnotateMode,
    isSelectedForAnnotation,
    centroid,
    strokeAndFillColor,
    labelId,
  ]);

  const handleTransformStart = useCallback(() => {
    startDrag(labelId);
  }, [startDrag, labelId]);

  const handleTransformChange = useCallback(() => {
    const grp = contentRef.current;
    if (!grp) return;

    // Capture the position delta for finalization
    // TransformControls handles the visual movement of the group directly
    const position = grp.position;

    const transientUpdate: TransientPolylineState = {
      positionDelta: [position.x, position.y, position.z],
    };

    updatePolyline(labelId, transientUpdate);
  }, [labelId, updatePolyline]);

  // This effect clears transient state and drag state on unmount
  useEffect(() => {
    return () => {
      updatePolyline(labelId, null);
      endDrag(labelId);
    };
  }, [labelId, updatePolyline, endDrag]);

  const handleTransformEnd = useCallback(() => {
    const grp = contentRef.current;

    if (!grp || !transientState) {
      endDrag(labelId);
      return;
    }

    finalizePolylineDrag(labelId, transientState);

    // Reset group position to prevent double-application
    grp.position.set(0, 0, 0);
  }, [labelId, transientState, finalizePolylineDrag, endDrag]);

  const handlePointerOver = useCallback(() => {
    if (isAnnotateMode) {
      setHoveredLabel({ id: labelId });
    }
  }, [isAnnotateMode, setHoveredLabel, labelId]);

  const handlePointerOut = useCallback(() => {
    if (isAnnotateMode) {
      setHoveredLabel(null);
    }
  }, [isAnnotateMode, setHoveredLabel]);

  const handleSegmentPointerOver = useCallback(
    (_segmentIndex: number) => {
      if (isAnnotateMode) {
        if (editSegmentsMode) {
          document.body.style.cursor = "crosshair";
        }
      }
    },
    [isAnnotateMode, editSegmentsMode]
  );

  const handleSegmentPointerOut = useCallback(() => {
    if (!editSegmentsMode) {
      document.body.style.cursor = "default";
    }
  }, [editSegmentsMode]);

  const handleSegmentClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!editSegmentsMode || !isSelectedForAnnotation || !isAnnotateMode) {
        return;
      }

      event.stopPropagation();

      // Get the click position from the event
      const clickPosition: Vector3Tuple = [
        event.point.x,
        event.point.y,
        event.point.z,
      ];

      // Find which segment was clicked
      const clickResult = findClickedSegment(
        effectivePoints3d,
        clickPosition,
        // Distance threshold
        0.2
      );

      if (clickResult) {
        const { segmentIndex, newVertexPosition } = clickResult;

        // Insert the new vertex into the segment via working store
        const currentSegments = effectivePoints3d.map((seg) => ({
          points: seg,
        }));

        const newSegments = insertVertexInSegment(
          effectivePoints3d,
          currentSegments,
          segmentIndex,
          newVertexPosition,
          clickPosition
        );

        // If newSegments is null, it means the new vertex was too close to an existing vertex
        if (newSegments !== null) {
          const newPoints3d = newSegments.map((seg) => seg.points);
          updatePolylinePoints(labelId, newPoints3d);
        }
      }
    },
    [
      editSegmentsMode,
      isSelectedForAnnotation,
      isAnnotateMode,
      effectivePoints3d,
      labelId,
      updatePolylinePoints,
    ]
  );

  // Get temp transforms for the selected vertex if it belongs to this label
  // Always call the hook, but use a dummy key if no vertex is selected
  const vertexKey =
    selectedPoint && selectedPoint.labelId === labelId
      ? `${labelId}-${selectedPoint.segmentIndex}-${selectedPoint.pointIndex}`
      : // Dummy key that won't match any real vertex
        `${labelId}--1--1`;

  const tempTransforms = useRecoilValue(tempVertexTransformsAtom(vertexKey));

  // Only use temp transforms if they actually belong to the selected vertex
  const relevantTempTransforms =
    selectedPoint && selectedPoint.labelId === labelId && tempTransforms
      ? tempTransforms
      : null;

  // Render preview lines when a vertex is being transformed
  const previewLines = useMemo(() => {
    if (!isAnnotateMode || !isSelectedForAnnotation) return null;
    if (!selectedPoint || selectedPoint.labelId !== labelId) return null;
    if (!relevantTempTransforms?.position) return null;

    const { segmentIndex, pointIndex } = selectedPoint;

    const segmentData = effectivePoints3d[segmentIndex];

    if (!segmentData) return null;

    const segmentPoints = segmentData;

    if (!segmentPoints || segmentPoints.length === 0) return null;

    // tempVertexTransforms.position is an offset from the original position
    // We need to add it to the original position to get the actual world position
    const originalPosition = effectivePoints3d[segmentIndex][pointIndex];
    const tempOffset = relevantTempTransforms.position;
    const tempPosition: Vector3Tuple = [
      originalPosition[0] + tempOffset[0],
      originalPosition[1] + tempOffset[1],
      originalPosition[2] + tempOffset[2],
    ];

    const previewLinesArray = [];

    // Line from previous vertex (old vertex) to temp position (currently-being-transformed vertex)
    if (pointIndex > 0) {
      const prevPoint = segmentPoints[pointIndex - 1];
      previewLinesArray.push(
        <LineDrei
          key={`preview-prev-${vertexKey}`}
          points={[prevPoint, tempPosition]}
          color="#ff0000"
          lineWidth={2}
          dashed
          dashSize={0.1}
          gapSize={0.1}
        />
      );
    }

    // Line from temp position (currently-being-transformed vertex) to next vertex
    if (pointIndex < segmentPoints.length - 1) {
      const nextPoint = segmentPoints[pointIndex + 1];
      previewLinesArray.push(
        <LineDrei
          key={`preview-next-${vertexKey}`}
          points={[tempPosition, nextPoint]}
          color="#ff0000"
          lineWidth={2}
          dashed
          dashSize={0.1}
          gapSize={0.1}
        />
      );
    }

    return previewLinesArray.length > 0 ? previewLinesArray : null;
  }, [
    isAnnotateMode,
    isSelectedForAnnotation,
    selectedPoint,
    labelId,
    effectivePoints3d,
    relevantTempTransforms,
    vertexKey,
  ]);

  const markers = useMemo(() => {
    if (!isAnnotateMode || !isSelectedForAnnotation) return null;

    return (
      <>
        {pointMarkers}
        {centroidMarker}
      </>
    );
  }, [isAnnotateMode, isSelectedForAnnotation, pointMarkers, centroidMarker]);

  return {
    // State
    centroid,
    isAnnotateMode,
    isSelectedForAnnotation,
    effectivePoints3d,

    // Refs
    transformControlsRef,
    contentRef,

    // Markers
    markers,

    // Preview lines
    previewLines,

    // Handlers
    handleTransformStart,
    handleTransformChange,
    handleTransformEnd,
    handlePointerOver,
    handlePointerOut,
    handleSegmentPointerOver,
    handleSegmentPointerOut,
    handleSegmentClick,
  };
};
