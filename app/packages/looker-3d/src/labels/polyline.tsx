import * as fos from "@fiftyone/state";
import { Line as LineDrei } from "@react-three/drei";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import * as THREE from "three";
import { usePolylineAnnotation } from "../annotation/usePolylineAnnotation";
import { selectedLabelForAnnotationAtom } from "../state";
import { createFilledPolygonMeshes } from "./polygon-fill-utils";
import type { OverlayProps } from "./shared";
import { useEventHandlers, useHoverState, useLabelColor } from "./shared/hooks";
import { Transformable } from "./shared/TransformControls";

export interface PolyLineProps extends OverlayProps {
  // Array of line segments, where each segment is an array of 3D points
  points3d: THREE.Vector3Tuple[][];
  filled: boolean;
  lineWidth?: number;
  // We ignore closed for now
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

  const { strokeAndFillColor } = useLabelColor(
    { selected, color },
    isHovered,
    label,
    isSelectedForAnnotation
  );

  const {
    effectivePoints3d,
    centroid,
    transformControlsRef,
    contentRef,
    markers,
    handleTransformEnd,
    handlePointerOver: handleAnnotationPointerOver,
    handlePointerOut: handleAnnotationPointerOut,
    handleSegmentPointerOver,
    handleSegmentPointerOut,
  } = usePolylineAnnotation({
    label,
    points3d,
    strokeAndFillColor,
    isAnnotateMode,
    isSelectedForAnnotation,
  });

  const lines = useMemo(
    () =>
      effectivePoints3d.map((pts, i) => (
        <LineDrei
          key={`polyline-${label._id}-${i}`}
          lineWidth={lineWidth}
          segments
          points={pts}
          color={strokeAndFillColor}
          rotation={rotation}
          onPointerOver={() => handleSegmentPointerOver(i)}
          onPointerOut={handleSegmentPointerOut}
        />
      )),
    [
      effectivePoints3d,
      strokeAndFillColor,
      lineWidth,
      rotation,
      label._id,
      handleSegmentPointerOver,
      handleSegmentPointerOut,
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

    // Dispose previous meshes
    meshesRef.current.forEach((mesh) => {
      if (mesh.geometry) mesh.geometry.dispose();
    });

    const meshes = createFilledPolygonMeshes(effectivePoints3d, material);
    meshesRef.current = meshes || [];

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
    return () => {
      meshesRef.current.forEach((mesh) => {
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
      });
    };
  }, []);

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
      onTransformEnd={handleTransformEnd}
      explicitObjectRef={contentRef}
    >
      <group ref={contentRef}>
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
