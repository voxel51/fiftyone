import React from "react";
import * as THREE from "three";
import { OverlayProps } from "./shared";

interface LineProps extends OverlayProps {
  points: THREE.Vector3Tuple[];
}

export const Line = ({
  rotation,
  points,
  color,
  opacity,
  onClick,
  tooltip,
  label,
}: LineProps) => {
  const geo = React.useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...p))
    );
    g.rotateX(rotation[0]);
    g.rotateY(rotation[1]);
    g.rotateZ(rotation[2]);
    return g;
  }, [points, rotation]);

  const tooltipProps = React.useMemo(() => {
    return tooltip.getMeshProps(label);
  }, [tooltip, label]);

  return (
    <line onClick={onClick} {...tooltipProps} opacity={opacity}>
      <primitive object={geo} attach="geometry" rotation={rotation} />
      <lineBasicMaterial attach="material" color={color} />
    </line>
  );
};
