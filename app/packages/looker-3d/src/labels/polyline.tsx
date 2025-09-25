import chroma from "chroma-js";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PolylinePointMarker } from "../fo3d/components/PolylinePointMarker";
import { Line } from "./line";
import { createFilledPolygonMeshes } from "./polygon-fill-utils";
import type { OverlayProps } from "./shared";
import { TransformControlsWrapper } from "./shared/TransformControls";
import {
  useEventHandlers,
  useHoverState,
  useLabelColor,
  useTransformHandlers,
} from "./shared/hooks";

export interface PolyLineProps extends OverlayProps {
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

  const { isHovered, setIsHovered } = useHoverState();
  const { onPointerOver, onPointerOut, restEventHandlers } = useEventHandlers(
    tooltip,
    label
  );
  const { strokeAndFillColor, isSimilarLabelHovered } = useLabelColor(
    { selected, color },
    isHovered,
    label
  );
  const { handleTransformStart, handleTransformEnd } = useTransformHandlers(
    label,
    onTransformStart,
    onTransformEnd
  );

  const lines = useMemo(
    () =>
      points3d.map((pts, i) => (
        <Line
          key={`polyline-${label._id}-${i}`}
          width={lineWidth}
          points={pts}
          opacity={opacity}
          color={strokeAndFillColor}
          label={label}
          rotation={rotation}
          selected={selected}
        />
      )),
    [
      points3d,
      opacity,
      strokeAndFillColor,
      label,
      lineWidth,
      rotation,
      selected,
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

    const meshes = createFilledPolygonMeshes(points3d, material);
    meshesRef.current = meshes || [];

    if (!meshes) return null;

    return meshes.map((mesh, idx) => (
      <primitive
        key={`filled-${label._id}-${idx}`}
        object={mesh}
        rotation={rotation as unknown as THREE.Euler}
      />
    ));
  }, [filled, points3d, rotation, material, label._id]);

  const pointMarkers = useMemo(() => {
    if (!isAnnotateMode) return null;

    // this is to have contrast for annotation,
    // or else the point markers would be invisible with large line widths
    const complementaryColor = chroma(strokeAndFillColor)
      .set("hsl.h", "+180")
      .hex();

    return points3d.flatMap((pts, polylineIndex) =>
      pts.map((point) => {
        return (
          <PolylinePointMarker
            key={`point-${label._id}-${polylineIndex}`}
            position={new THREE.Vector3(...point)}
            color={complementaryColor}
          />
        );
      })
    );
  }, [isAnnotateMode, points3d, label._id, strokeAndFillColor]);

  // Cleanup meshes on unmount
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
      {pointMarkers}
    </>
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
    >
      <group
        onPointerOver={() => {
          setIsHovered(true);
          onPointerOver();
        }}
        onPointerOut={() => {
          setIsHovered(false);
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
