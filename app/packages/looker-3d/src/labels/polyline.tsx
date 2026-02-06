import * as fos from "@fiftyone/state";
import { Line as LineDrei } from "@react-three/drei";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { usePolylineAnnotation } from "../annotation/usePolylineAnnotation";
import {
  current3dAnnotationModeAtom,
  hoveredLabelAtom,
  selectedLabelForAnnotationAtom,
} from "../state";
import {
  isValidPoint3d,
  validatePoints3d,
  validatePoints3dArray,
} from "../utils";
import { createFilledPolygonMeshes } from "./polygon-fill-utils";
import type { OverlayProps } from "./shared";
import { useEventHandlers, useHoverState, useLabelColor } from "./shared/hooks";
import { Transformable } from "./shared/TransformControls";

export interface PolyLineProps extends OverlayProps {
  // Array of line segments, where each segment is an array of 3D points
  points3d: THREE.Vector3Tuple[][];
  filled: boolean;
  lineWidth?: number;
  closed?: boolean;
}

export const Polyline = ({
  opacity,
  filled,
  rotation,
  points3d,
  color,
  selected,
  lineWidth,
  closed,
  onClick,
  tooltip,
  label,
}: PolyLineProps) => {
  const meshesRef = useRef<THREE.Mesh[]>([]);

  useHoverState();
  const hoveredLabel = useRecoilValue(hoveredLabelAtom);
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);
  const { onPointerOver, onPointerOut, ...restEventHandlers } =
    useEventHandlers(tooltip, label);

  const isHovered = hoveredLabel?.id === label._id;

  const isAnnotateMode = useAtomValue(fos.modalMode) === "annotate";
  const isSelectedForAnnotation =
    useRecoilValue(selectedLabelForAnnotationAtom)?._id === label._id;
  const setCurrent3dAnnotationMode = useSetRecoilState(
    current3dAnnotationModeAtom
  );

  useEffect(() => {
    if (isSelectedForAnnotation) {
      setCurrent3dAnnotationMode("polyline");
    }
  }, [isSelectedForAnnotation, setCurrent3dAnnotationMode]);

  const { strokeAndFillColor } = useLabelColor(
    { selected, color },
    isHovered,
    label,
    isSelectedForAnnotation
  );

  const {
    centroid,
    transformControlsRef,
    contentRef,
    effectivePoints3d,
    markers,
    previewLines,
    handleTransformStart,
    handleTransformChange,
    handleTransformEnd,
    handlePointerOver: handleAnnotationPointerOver,
    handlePointerOut: handleAnnotationPointerOut,
    handleSegmentPointerOver,
    handleSegmentPointerOut,
    handleSegmentClick,
  } = usePolylineAnnotation({
    label,
    points3d,
    strokeAndFillColor,
    isAnnotateMode,
    isSelectedForAnnotation,
  });

  const lines = useMemo(() => {
    const lineElements = effectivePoints3d
      .map((pts, i) => {
        if (!pts || !Array.isArray(pts) || pts.length === 0) {
          console.warn(`Invalid points array for polyline segment ${i}:`, pts);
          return null;
        }

        const validPts = validatePoints3d(pts);

        if (validPts.length === 0) {
          console.warn(`No valid points found for polyline segment ${i}`);
          return null;
        }

        return (
          <LineDrei
            key={`polyline-${label._id}-${i}`}
            lineWidth={lineWidth}
            points={validPts}
            color={strokeAndFillColor}
            rotation={rotation}
            transparent={opacity < 0.2}
            opacity={opacity}
            onPointerOver={() => handleSegmentPointerOver(i)}
            onPointerOut={handleSegmentPointerOut}
            onClick={handleSegmentClick}
          />
        );
      })
      .filter(Boolean);

    // If closed, add exactly one closing line per segment
    if (closed) {
      const closingLines = effectivePoints3d
        .map((pts, i) => {
          if (!pts || !Array.isArray(pts) || pts.length < 2) {
            return null;
          }

          const firstPoint = pts[0];
          const lastPoint = pts[pts.length - 1];

          if (!isValidPoint3d(firstPoint) || !isValidPoint3d(lastPoint)) {
            return null;
          }

          return (
            <LineDrei
              key={`polyline-closing-${label._id}-${i}`}
              lineWidth={lineWidth}
              points={[lastPoint, firstPoint]}
              color={strokeAndFillColor}
              rotation={rotation}
              transparent={opacity < 0.2}
              opacity={opacity}
              onPointerOver={() => handleSegmentPointerOver(i)}
              onPointerOut={handleSegmentPointerOut}
              onClick={handleSegmentClick}
            />
          );
        })
        .filter(Boolean);

      return [...lineElements, ...closingLines];
    }

    return lineElements;
  }, [
    effectivePoints3d,
    closed,
    strokeAndFillColor,
    lineWidth,
    rotation,
    opacity,
    label._id,
    handleSegmentPointerOver,
    handleSegmentPointerOut,
    handleSegmentClick,
  ]);

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

    const validPoints3d = validatePoints3dArray(effectivePoints3d);

    if (validPoints3d.length === 0) {
      console.warn("No valid points found for filled polygon meshes");
      return null;
    }

    const meshes = createFilledPolygonMeshes(validPoints3d, material);

    if (!meshes) return null;

    return meshes.map((mesh, idx) => (
      <primitive
        key={`filled-${label._id}-${idx}`}
        object={mesh}
        rotation={rotation as unknown as THREE.Euler}
      />
    ));
  }, [filled, effectivePoints3d, rotation, material, label._id]);

  useEffect(() => {
    const currentMeshes = meshesRef.current;

    if (filled && material) {
      const validPoints3d = validatePoints3dArray(effectivePoints3d);

      const meshes =
        validPoints3d.length > 0
          ? createFilledPolygonMeshes(validPoints3d, material)
          : null;
      meshesRef.current = meshes || [];
    } else {
      meshesRef.current = [];
    }

    // Cleanup old meshes (only geometries, NOT materials, those are cleaned up separately)
    return () => {
      currentMeshes.forEach((mesh) => {
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
      });
    };
  }, [filled, effectivePoints3d, material]);

  // Cleanup material when it changes or component unmounts
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
    </>
  );

  return (
    <Transformable
      archetype="polyline"
      isSelectedForTransform={isSelectedForAnnotation}
      transformControlsPosition={centroid as THREE.Vector3Tuple}
      transformControlsRef={transformControlsRef}
      onTransformStart={handleTransformStart}
      onTransformEnd={handleTransformEnd}
      onTransformChange={handleTransformChange}
      explicitObjectRef={contentRef}
    >
      <group ref={contentRef}>
        {markers}
        {previewLines}
        <group
          {...restEventHandlers}
          onPointerOver={() => {
            setHoveredLabel({ id: label._id });
            handleAnnotationPointerOver();
            onPointerOver();
          }}
          onPointerOut={() => {
            setHoveredLabel(null);
            handleAnnotationPointerOut();
            onPointerOut();
          }}
          onClick={onClick}
        >
          {content}
        </group>
      </group>
    </Transformable>
  );
};
