import { useCursor } from "@react-three/drei";
import { useMemo, useState } from "react";
import * as THREE from "three";
import { Line } from "./line";
import { OverlayProps } from "./shared";

export interface PolyLineProps extends OverlayProps {
  points3d: THREE.Vector3Tuple[][];
  filled: boolean;
  closed: boolean;
}

export const Polyline = ({
  opacity,
  filled,
  closed,
  rotation,
  points3d,
  color,
  selected,
  onClick,
  tooltip,
  label,
}: PolyLineProps) => {
  const lines = useMemo(
    () =>
      points3d.map((points) => (
        <Line
          key={`polyline-${label}-${points3d[0][0]}`}
          rotation={rotation}
          points={points}
          opacity={opacity}
          color={selected ? "orange" : color}
          onClick={onClick}
          tooltip={tooltip}
          label={label}
        />
      )),
    [points3d, rotation, opacity, color, selected, onClick, tooltip, label]
  );

  const [isPolylineHovered, setIsPolylineHovered] = useState(false);

  useCursor(isPolylineHovered);

  if (filled) {
    // @todo: filled not yet supported
    // @todo: closed prop not used
    return null;
  }

  return (
    <group
      onPointerOver={() => setIsPolylineHovered(true)}
      onPointerOut={() => setIsPolylineHovered(false)}
    >
      {lines}
    </group>
  );
};
