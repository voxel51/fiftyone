import { useCursor } from "@react-three/drei";
import { useMemo, useState } from "react";
import type * as THREE from "three";
import { useSimilarLabels3d } from "../hooks/use-similar-labels-3d";
import { Line } from "./line";
import type { OverlayProps } from "./shared";

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
  const { onPointerOver, onPointerOut, ...restEventHandlers } = useMemo(() => {
    return {
      ...tooltip.getMeshProps(label),
    };
  }, [tooltip, label]);

  const [isPolylineHovered, setIsPolylineHovered] = useState(false);
  const isSimilarLabelHovered = useSimilarLabels3d(label);

  useCursor(isPolylineHovered);

  const strokeColor = useMemo(() => {
    const isHovered = isPolylineHovered || isSimilarLabelHovered;

    // return "peach" color, a mix of orange and white
    if (isHovered && selected) return "#de7e5d";

    if (selected) return "orange";
    if (isHovered) return "white";
    return color;
  }, [selected, isPolylineHovered, isSimilarLabelHovered, color]);

  const lines = useMemo(
    () =>
      points3d.map((points) => (
        <Line
          key={`polyline-${label._id}-${points3d[0][0]}`}
          rotation={rotation}
          points={points}
          opacity={opacity}
          color={strokeColor}
          label={label}
        />
      )),
    [points3d, rotation, opacity, strokeColor, label]
  );

  if (filled) {
    // @todo: filled not yet supported
    // @todo: closed prop not used
    return null;
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
