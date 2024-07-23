import React, { useMemo, useState } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { OverlayProps } from "./shared";
import { useCursor } from "@react-three/drei";
import { useRecoilState } from "recoil";
import { cuboidLabelLineWidthAtom } from "../state";
import { extend, ReactThreeFiber } from "@react-three/fiber";

extend({ LineSegments2, LineMaterial, LineSegmentsGeometry });

declare global {
  namespace JSX {
    interface IntrinsicElements {
      lineSegments2: ReactThreeFiber.Node<LineSegments2, typeof LineSegments2>;
      lineSegmentsGeometry: ReactThreeFiber.Node<
        LineSegmentsGeometry,
        typeof LineSegmentsGeometry
      >;
    }
  }
}

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
  const [lineWidth] = useRecoilState(cuboidLabelLineWidthAtom);
  const geo = useMemo(
    () => dimensions && new THREE.BoxGeometry(...dimensions),
    [dimensions]
  );

  // @todo: add comment to add more context on what legacy coordinates means
  const loc = useMemo(() => {
    const [x, y, z] = location;
    return useLegacyCoordinates
      ? new THREE.Vector3(x, y - 0.5 * dimensions[1], z)
      : new THREE.Vector3(x, y, z);
  }, [location, dimensions, useLegacyCoordinates]);

  const itemRotationVec = useMemo(
    () => new THREE.Vector3(...itemRotation),
    [itemRotation]
  );
  const resolvedRotation = useMemo(
    () => new THREE.Vector3(...rotation),
    [rotation]
  );
  const actualRotation = useMemo(
    () => resolvedRotation.add(itemRotationVec).toArray(),
    [resolvedRotation, itemRotationVec]
  );

  const [isCuboidHovered, setIsCuboidHovered] = useState(false);
  useCursor(isCuboidHovered);

  const geometry = useMemo(() => {
    return new LineSegmentsGeometry().fromLineSegments(
      new THREE.LineSegments(new THREE.EdgesGeometry(geo))
    );
  }, [geo]);
  const material = useMemo(
    () =>
      new LineMaterial({
        opacity: opacity,
        transparent: false,
        color: selected ? "orange" : color,
        linewidth: lineWidth,
      }),
    [selected, lineWidth]
  );

  if (!location || !dimensions) return null;
  return (
    <group
      onPointerOver={() => setIsCuboidHovered(true)}
      onPointerOut={() => {
        setIsCuboidHovered(false);
      }}
    >
      <mesh position={loc} rotation={actualRotation}>
        <lineSegments2 geometry={geometry} material={material} />
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
    </group>
  );
};
