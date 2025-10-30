import * as fos from "@fiftyone/state";
import { Line as LineDrei } from "@react-three/drei";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as THREE from "three";
import { usePolylineAnnotation } from "../annotation/usePolylineAnnotation";
import {
  isPolylineAnnotateActiveAtom,
  selectedLabelForAnnotationAtom,
  tempLabelTransformsAtom,
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

  const { isHovered, setIsHovered } = useHoverState();
  const { onPointerOver, onPointerOut, restEventHandlers } = useEventHandlers(
    tooltip,
    label
  );

  const isAnnotateMode = useAtomValue(fos.modalMode) === "annotate";
  const isSelectedForAnnotation =
    useRecoilValue(selectedLabelForAnnotationAtom)?._id === label._id;
  const setIsPolylineAnnotateActive = useSetRecoilState(
    isPolylineAnnotateActiveAtom
  );

  useEffect(() => {
    if (isSelectedForAnnotation) {
      setIsPolylineAnnotateActive(true);
    }
  }, [isSelectedForAnnotation]);

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
    markers,
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
    const lineElements = points3d
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
      const closingLines = points3d
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
    points3d,
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

    const validPoints3d = validatePoints3dArray(points3d);

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
  }, [filled, points3d, rotation, material, label._id]);

  useEffect(() => {
    const currentMeshes = meshesRef.current;

    if (filled && material) {
      const validPoints3d = validatePoints3dArray(points3d);

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
  }, [filled, points3d, material]);

  // Cleanup material when it changes or component unmounts
  useEffect(() => {
    return () => {
      if (material) {
        material.dispose();
      }
    };
  }, [material]);

  const tempTransforms = useRecoilValue(tempLabelTransformsAtom(label._id));

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
      <group
        ref={contentRef}
        position={tempTransforms?.position ?? [0, 0, 0]}
        quaternion={tempTransforms?.quaternion ?? [0, 0, 0, 1]}
      >
        {markers}
        <group
          onPointerOver={() => {
            setIsHovered(true);
            handleAnnotationPointerOver();
            onPointerOver();
          }}
          onPointerOut={() => {
            setIsHovered(false);
            handleAnnotationPointerOut();
            onPointerOut();
          }}
          onClick={onClick}
          {...restEventHandlers}
        >
          {content}
        </group>
      </group>
    </Transformable>
  );
};
