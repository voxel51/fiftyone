import { ThreeEvent } from "@react-three/fiber";
import chroma from "chroma-js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import type { Vector3Tuple } from "three";
import * as THREE from "three";
import {
  editSegmentsModeAtom,
  hoveredLabelAtom,
  hoveredPolylineInfoAtom,
  polylineEffectivePointsAtom,
  polylinePointTransformsAtom,
  tempLabelTransformsAtom,
} from "../state";
import { PolylinePointMarker } from "./PolylinePointMarker";
import {
  applyDeltaToAllPoints,
  applyTransformsToPolyline,
  findClickedSegment,
  insertVertexInSegment,
  updateDuplicateVertices,
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
  const [polylinePointTransforms, setPolylinePointTransforms] = useRecoilState(
    polylinePointTransformsAtom
  );

  const editSegmentsMode = useRecoilValue(editSegmentsModeAtom);

  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);
  const setHoveredPolylineInfo = useSetRecoilState(hoveredPolylineInfoAtom);

  const [effectivePoints3d, setPolylineEffectivePoints] = useRecoilState(
    polylineEffectivePointsAtom(label._id)
  );

  const setTempPolylineTransforms = useSetRecoilState(
    tempLabelTransformsAtom(label._id)
  );

  const transformControlsRef = useRef(null);
  const contentRef = useRef<THREE.Group>(null);

  const updateEffectivePoints = useCallback(() => {
    const labelId = label._id;
    const transforms = polylinePointTransforms[labelId] || [];
    const result = applyTransformsToPolyline(points3d, transforms);
    setPolylineEffectivePoints(result);
  }, [
    polylinePointTransforms,
    label._id,
    points3d,
    setPolylineEffectivePoints,
  ]);

  useEffect(() => {
    updateEffectivePoints();
  }, [updateEffectivePoints]);

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
    ] as [number, number, number];
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
            labelId={label._id}
            segmentIndex={segmentIndex}
            pointIndex={pointIndex}
            onPointMove={(newPosition) => {
              setPolylinePointTransforms((prev) => {
                const labelId = label._id;
                const currentTransforms = prev[labelId] || [];

                const newTransforms = updateDuplicateVertices(
                  point,
                  [newPosition.x, newPosition.y, newPosition.z],
                  effectivePoints3d,
                  currentTransforms
                );

                return {
                  ...prev,
                  [labelId]: newTransforms,
                };
              });
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
    label._id,
    strokeAndFillColor,
    setPolylinePointTransforms,
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
        key={`centroid-${label._id}`}
        position={new THREE.Vector3(...centroid)}
        color={centroidColor}
        size={0.05}
        pulsate={true}
        labelId={label._id}
        segmentIndex={-1}
        pointIndex={-1}
      />
    );
  }, [
    isAnnotateMode,
    isSelectedForAnnotation,
    centroid,
    strokeAndFillColor,
    label._id,
  ]);

  const syncPolylineTransformationToTempStore = useCallback(() => {
    const controls = transformControlsRef.current;
    if (!controls) return;

    const grp = contentRef.current;
    if (!grp) return;

    const worldPosition = grp.position.clone();

    setTempPolylineTransforms({
      position: [worldPosition.x, worldPosition.y, worldPosition.z],
      quaternion: grp.quaternion.toArray(),
    });
  }, []);

  const handleTransformChange = useCallback(() => {
    syncPolylineTransformationToTempStore();
  }, [syncPolylineTransformationToTempStore]);

  useEffect(() => {
    return () => {
      setTempPolylineTransforms(null);
    };
  }, [label._id]);

  const handleTransformEnd = useCallback(() => {
    const controls = transformControlsRef.current;
    if (!controls) return;

    const grp = contentRef.current;
    if (!grp) return;

    setTempPolylineTransforms(null);

    const worldDelta = controls.offset.clone();

    setPolylinePointTransforms((prev) => {
      const labelId = label._id;
      const currentTransforms = prev[labelId] || [];

      const newTransforms = applyDeltaToAllPoints(
        effectivePoints3d,
        points3d,
        currentTransforms,
        [worldDelta.x, worldDelta.y, worldDelta.z]
      );

      return { ...prev, [labelId]: newTransforms };
    });

    // Reset group position to prevent double-application
    // This is important because transform controls are applied to the group
    // Whereas we create polylines from the effective points
    if (contentRef.current) {
      contentRef.current.position.set(0, 0, 0);
    }
  }, [label._id, points3d, effectivePoints3d, setPolylinePointTransforms]);

  const handlePointerOver = useCallback(() => {
    if (isAnnotateMode) {
      setHoveredLabel(label);
    }
  }, [isAnnotateMode, setHoveredLabel, label]);

  const handlePointerOut = useCallback(() => {
    if (isAnnotateMode) {
      setHoveredLabel(null);
    }
  }, [isAnnotateMode, setHoveredLabel]);

  const handleSegmentPointerOver = useCallback(
    (segmentIndex: number) => {
      if (isAnnotateMode) {
        setHoveredPolylineInfo({
          labelId: label._id,
          segmentIndex,
          // pointIndex is undefined when hovering over the segment
        });

        if (editSegmentsMode) {
          document.body.style.cursor = "crosshair";
        }
      }
    },
    [isAnnotateMode, setHoveredPolylineInfo, label._id, editSegmentsMode]
  );

  const handleSegmentPointerOut = useCallback(() => {
    if (isAnnotateMode) {
      setHoveredPolylineInfo(null);
    }

    if (!editSegmentsMode) {
      document.body.style.cursor = "default";
    }
  }, [isAnnotateMode, setHoveredPolylineInfo, editSegmentsMode]);

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

        // Insert the new vertex into the segment
        setPolylinePointTransforms((prev) => {
          const labelId = label._id;
          const currentTransforms = prev[labelId] || [];

          const newTransforms = insertVertexInSegment(
            points3d,
            currentTransforms,
            segmentIndex,
            newVertexPosition
          );

          // If newTransforms is null, it means the new vertex was too close to an existing vertex
          // In that case, we don't update the transforms
          if (newTransforms === null) {
            return prev;
          }

          return {
            ...prev,
            [labelId]: newTransforms,
          };
        });
      }
    },
    [
      editSegmentsMode,
      isSelectedForAnnotation,
      isAnnotateMode,
      effectivePoints3d,
      points3d,
      label._id,
      setPolylinePointTransforms,
    ]
  );

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
    effectivePoints3d,
    centroid,
    isAnnotateMode,
    isSelectedForAnnotation,

    // Refs
    transformControlsRef,
    contentRef,

    // Markers
    markers,

    // Handlers
    handleTransformChange,
    handleTransformEnd,
    handlePointerOver,
    handlePointerOut,
    handleSegmentPointerOver,
    handleSegmentPointerOut,
    handleSegmentClick,
  };
};
