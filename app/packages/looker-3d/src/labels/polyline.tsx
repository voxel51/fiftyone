import { useCursor } from "@react-three/drei";
import { useMemo, useState } from "react";
import * as THREE from "three";
import { use3dLabelColor } from "../hooks/use-3d-label-color";
import { useSimilarLabels3d } from "../hooks/use-similar-labels-3d";
import { Line } from "./line";
import { createFilledPolygonMeshes } from "./polygon-fill-utils";
import type { OverlayProps } from "./shared";

export interface PolyLineProps extends OverlayProps {
  points3d: THREE.Vector3Tuple[][];
  filled: boolean;
  // we ignore closed for now
  closed?: boolean;
}

export const Polyline = ({
  opacity,
  filled,
  rotation,
  points3d,
  color,
  selected,
  onClick,
  tooltip,
  label,
}: PolyLineProps) => {
  const { onPointerOver, onPointerOut, ...restEventHandlers } = useMemo(() => {
    return { ...tooltip.getMeshProps(label) };
  }, [tooltip, label]);

  const [isPolylineHovered, setIsPolylineHovered] = useState(false);
  const isSimilarLabelHovered = useSimilarLabels3d(label);
  useCursor(isPolylineHovered);

  const strokeAndFillColor = use3dLabelColor({
    isSelected: selected,
    isHovered: isPolylineHovered,
    isSimilarLabelHovered,
    defaultColor: color,
  });

  const lines = useMemo(
    () =>
      points3d.map((pts, i) => (
        <Line
          key={`polyline-${label._id}-${i}`}
          rotation={rotation}
          points={pts}
          opacity={opacity}
          color={strokeAndFillColor}
          label={label}
        />
      )),
    [points3d, rotation, opacity, strokeAndFillColor, label]
  );

  const filledMeshes = useMemo(() => {
    if (!filled) return null;

    const material = new THREE.MeshBasicMaterial({
      color: strokeAndFillColor,
      opacity,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const meshes = createFilledPolygonMeshes(points3d, material);

    if (!meshes) return null;

    return meshes.map((mesh, idx) => (
      <primitive
        key={`filled-${label._id}-${idx}`}
        object={mesh}
        rotation={rotation as unknown as THREE.Euler}
      />
    ));
  }, [filled, points3d, rotation, strokeAndFillColor, opacity, label._id]);

  if (filled && filledMeshes) {
    return (
      <group
        onPointerOver={() => {
          setIsPolylineHovered(true);
          onPointerOver();
        }}
        onPointerOut={() => {
          setIsPolylineHovered(false);
          onPointerOut();
        }}
        onClick={onClick}
        {...restEventHandlers}
      >
        {filledMeshes}
        {lines}
      </group>
    );
  }

  return (
    <group
      onPointerOver={() => {
        setIsPolylineHovered(true);
        onPointerOver();
      }}
      onPointerOut={() => {
        setIsPolylineHovered(false);
        onPointerOut();
      }}
      onClick={onClick}
      {...restEventHandlers}
    >
      {lines}
    </group>
  );
};
