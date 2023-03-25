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
  if (filled) {
    // @todo: filled not yet supported
    return null;
  }

  // @todo: closed prop isn't used

  const lines = points3d.map((points) => (
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
  ));

  return <group>{lines}</group>;
};
