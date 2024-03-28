import React from "react";
import * as THREE from "three";
import { OverlayProps } from "./shared";

export interface CuboidProps extends OverlayProps {
  location: THREE.Vector3Tuple;
  dimensions: THREE.Vector3Tuple;
  itemRotation: THREE.Vector3Tuple;
}

export const Cuboid = ({
  itemRotation,
  dimensions,
  opacity,
  rotation,
  location,
  selected,
  onClick,
  tooltip,
  label,
  color,
  useLegacyCoordinates,
}: CuboidProps) => {
  const geo = React.useMemo(
    () => dimensions && new THREE.BoxGeometry(...dimensions),
    [dimensions]
  );

  if (!location || !dimensions) return null;

  const [x, y, z] = location;

  // @todo: add comment to add more context on what legacy coordinates means
  const loc = useLegacyCoordinates
    ? new THREE.Vector3(x, y - 0.5 * dimensions[1], z)
    : new THREE.Vector3(x, y, z);

  const itemRotationVec = new THREE.Vector3(...itemRotation);
  const resolvedRotation = new THREE.Vector3(...rotation);
  const actualRotation = resolvedRotation.add(itemRotationVec).toArray();

  return (
    <>
      <mesh position={loc} rotation={actualRotation}>
        <lineSegments>
          <edgesGeometry args={[geo]} attach="geometry" />
          <lineBasicMaterial
            attach="material"
            linewidth={8}
            color={selected ? "orange" : color}
          />
        </lineSegments>
      </mesh>
      <mesh
        onClick={onClick}
        {...tooltip.getMeshProps(label)}
        position={loc}
        rotation={actualRotation}
      >
        <boxGeometry args={dimensions} />
        <meshBasicMaterial
          transparent={true}
          opacity={opacity * 0.5}
          color={selected ? "orange" : color}
        />
      </mesh>
    </>
  );
};
