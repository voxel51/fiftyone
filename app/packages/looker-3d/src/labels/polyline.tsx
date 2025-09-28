import { Line as LineDrei } from "@react-three/drei";
import chroma from "chroma-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSetRecoilState } from "recoil";
import * as THREE from "three";
import { PolylinePointMarker } from "../fo3d/components/PolylinePointMarker";
import { usePointUpdateRegistry } from "../hooks/usePointUpdateRegistry";
import { hoveredLabelAtom, hoveredPolylineInfoAtom } from "../state";
import { createFilledPolygonMeshes } from "./polygon-fill-utils";
import type { OverlayProps } from "./shared";
import {
  useEventHandlers,
  useHoverState,
  useLabelColor,
  useTransformHandlers,
} from "./shared/hooks";
import { TransformControlsWrapper } from "./shared/TransformControls";

export interface PolyLineProps extends OverlayProps {
  // Array of line segments, where each segment is an array of 3D points
  points3d: THREE.Vector3Tuple[][];
  filled: boolean;
  lineWidth?: number;
  // We ignore closed for now
  closed?: boolean;
  isSelectedForAnnotation?: boolean;
  isSelectedForTransform?: boolean;
}

export const Polyline = ({
  opacity,
  filled,
  rotation,
  points3d,
  color,
  selected,
  lineWidth,
  onClick,
  tooltip,
  label,
  isSelectedForAnnotation,
  isSelectedForTransform,
  isAnnotateMode,
  transformMode = "translate",
  transformSpace = "world",
  onTransformStart,
  onTransformEnd,
  onTransformChange,
  transformControlsRef,
}: PolyLineProps) => {
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const [localPoints3d, setLocalPoints3d] =
    useState<THREE.Vector3Tuple[][]>(points3d);

  const { isHovered, setIsHovered } = useHoverState();
  const { onPointerOver, onPointerOut, restEventHandlers } = useEventHandlers(
    tooltip,
    label
  );
  const { strokeAndFillColor } = useLabelColor(
    { selected, color },
    isHovered,
    label,
    isSelectedForAnnotation
  );
  const { handleTransformStart, handleTransformEnd } = useTransformHandlers(
    label,
    onTransformStart,
    onTransformEnd
  );
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);
  const setHoveredPolylineInfo = useSetRecoilState(hoveredPolylineInfoAtom);
  const { registerPointUpdateCallback, unregisterPointUpdateCallback } =
    usePointUpdateRegistry();

  const handlePointMove = useCallback(
    (segmentIndex: number, pointIndex: number, newPosition: THREE.Vector3) => {
      setLocalPoints3d((prev) => {
        const newPoints = [...prev];
        if (newPoints[segmentIndex] && newPoints[segmentIndex][pointIndex]) {
          newPoints[segmentIndex] = [...newPoints[segmentIndex]];
          newPoints[segmentIndex][pointIndex] = [
            newPosition.x,
            newPosition.y,
            newPosition.z,
          ];
        }
        return newPoints;
      });
    },
    []
  );

  useEffect(() => {
    if (!isSelectedForAnnotation) return;

    registerPointUpdateCallback(handlePointMove);

    return () => {
      unregisterPointUpdateCallback();
    };
  }, [
    isSelectedForAnnotation,
    handlePointMove,
    registerPointUpdateCallback,
    unregisterPointUpdateCallback,
  ]);

  // Update local points when props change
  useEffect(() => {
    setLocalPoints3d(points3d);
  }, [points3d]);

  const lines = useMemo(
    () =>
      localPoints3d.map((pts, i) => (
        <LineDrei
          key={`polyline-${label._id}-${i}`}
          lineWidth={lineWidth}
          segments
          points={pts}
          color={strokeAndFillColor}
          rotation={rotation}
          onPointerOver={() => {
            if (isAnnotateMode) {
              setHoveredPolylineInfo({
                labelId: label._id,
                segmentIndex: i,
                // pointIndex is undefined when hovering over the segment
              });
            }
          }}
          onPointerOut={() => {
            if (isAnnotateMode) {
              setHoveredPolylineInfo(null);
            }
          }}
        />
      )),
    [
      localPoints3d,
      strokeAndFillColor,
      lineWidth,
      rotation,
      label._id,
      isAnnotateMode,
      setHoveredPolylineInfo,
    ]
  );

  const material = useMemo(() => {
    if (!filled) return null;

    return new THREE.MeshBasicMaterial({
      color: strokeAndFillColor,
      opacity,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, [filled, strokeAndFillColor, opacity]);

  const filledMeshes = useMemo(() => {
    if (!filled || !material) return null;

    // dispose previous meshes
    meshesRef.current.forEach((mesh) => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });

    const meshes = createFilledPolygonMeshes(localPoints3d, material);
    meshesRef.current = meshes || [];

    if (!meshes) return null;

    return meshes.map((mesh, idx) => (
      <primitive
        key={`filled-${label._id}-${idx}`}
        object={mesh}
        rotation={rotation as unknown as THREE.Euler}
      />
    ));
  }, [filled, localPoints3d, rotation, material, label._id]);

  // Calculate centroid of polylines for transform controls
  const centroid = useMemo(() => {
    if (localPoints3d.length === 0) return [0, 0, 0];

    const allPoints = localPoints3d.flat();
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
  }, [localPoints3d]);

  const pointMarkers = useMemo(() => {
    if (!isAnnotateMode || !isSelectedForAnnotation) return null;

    // this is to have contrast for annotation,
    // or else the point markers would be invisible with large line widths
    const complementaryColor = chroma(strokeAndFillColor)
      .set("hsl.h", "+180")
      .hex();

    return localPoints3d.flatMap((segment, segmentIndex) => {
      let visitedPoints = new Set();

      return segment.map((point, pointIndex) => {
        const key = `${point[0]}-${point[1]}-${point[2]}-${segmentIndex}-${pointIndex}`;

        if (visitedPoints.has(key)) return null;

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
            onPointMove={(newPosition) =>
              handlePointMove(segmentIndex, pointIndex, newPosition)
            }
            pulsate={false}
          />
        );
      });
    });
  }, [
    isAnnotateMode,
    isSelectedForAnnotation,
    localPoints3d,
    label._id,
    strokeAndFillColor,
    handlePointMove,
  ]);

  const centroidMarker = useMemo(() => {
    if (!isAnnotateMode || !isSelectedForAnnotation) return null;

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
        pulsate={false}
        isDraggable={false}
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

  useEffect(() => {
    return () => {
      meshesRef.current.forEach((mesh) => {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => mat.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    };
  }, []);

  // Dispose material when it changes
  useEffect(() => {
    return () => {
      if (material) {
        material.dispose();
      }
    };
  }, [material]);

  const content = (
    <>
      {filled && filledMeshes}
      {lines}
      {centroidMarker}
    </>
  );

  const markers = (
    <group>
      {pointMarkers}
      {centroidMarker}
    </group>
  );

  return (
    <TransformControlsWrapper
      isSelectedForTransform={isSelectedForTransform}
      isAnnotateMode={isAnnotateMode}
      transformMode={transformMode}
      transformSpace={transformSpace}
      onTransformStart={handleTransformStart}
      onTransformEnd={handleTransformEnd}
      onTransformChange={onTransformChange}
      transformControlsRef={transformControlsRef}
      transformControlsPosition={centroid as THREE.Vector3Tuple}
    >
      {markers}
      <group
        onPointerOver={() => {
          setIsHovered(true);
          if (isAnnotateMode) {
            setHoveredLabel(label);
          }
          onPointerOver();
        }}
        onPointerOut={() => {
          setIsHovered(false);
          if (isAnnotateMode) {
            setHoveredLabel(null);
          }
          onPointerOut();
        }}
        onClick={onClick}
        {...restEventHandlers}
      >
        {content}
      </group>
    </TransformControlsWrapper>
  );
};
