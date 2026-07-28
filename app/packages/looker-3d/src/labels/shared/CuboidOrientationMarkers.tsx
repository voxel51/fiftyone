import { Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FO_USER_DATA } from "../../constants";
import {
  ORIENTATION_AXES_COLORS,
  ORIENTATION_AXES_LENGTH_RATIO,
  ORIENTATION_AXES_MIN_LENGTH,
  getCuboidOrientationMarkerProps,
  getFiniteMagnitude,
} from "./cuboid-orientation-geometry";

export {
  ORIENTATION_AXES_COLORS,
  ORIENTATION_AXES_LENGTH_RATIO,
  ORIENTATION_AXES_MIN_LENGTH,
  getCuboidOrientationMarkerGeometry,
  getFiniteMagnitude,
  type CuboidOrientationMarkerGeometry,
} from "./cuboid-orientation-geometry";

const ORIENTATION_MARKER_LINE_WIDTH = 4;
const ORIENTATION_MARKER_OPACITY = 0.95;
const ORIENTATION_AXES_LINE_WIDTH = 3;
const ORIENTATION_AXES_OPACITY = 0.75;

export interface CuboidOrientationMarkerProps {
  dimensions: THREE.Vector3Tuple;
  color: string;
  orientation: THREE.Quaternion;
  upVector?: THREE.Vector3 | null;
}

export const CuboidOrientationMarker = ({
  dimensions,
  color,
  orientation,
  upVector,
}: CuboidOrientationMarkerProps) => {
  const markerProps = useMemo(
    () => getCuboidOrientationMarkerProps(dimensions, orientation, upVector),
    [dimensions, orientation, upVector],
  );

  const headGeometry = useMemo(() => {
    if (!markerProps) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(markerProps.headVertices.flat(), 3),
    );
    return geometry;
  }, [markerProps]);

  // This effect disposes the arrowhead geometry when it is replaced or unmounts.
  useEffect(() => {
    return () => {
      headGeometry?.dispose();
    };
  }, [headGeometry]);

  if (!markerProps || !headGeometry) {
    return null;
  }

  return (
    <group userData={{ [FO_USER_DATA.IS_HELPER]: true }} renderOrder={3}>
      <Line
        points={[markerProps.shaftStart, markerProps.shaftEnd]}
        color={color}
        lineWidth={ORIENTATION_MARKER_LINE_WIDTH}
        opacity={ORIENTATION_MARKER_OPACITY}
        transparent
        depthTest={false}
        raycast={() => null}
      />
      <mesh geometry={headGeometry} renderOrder={3} raycast={() => null}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={ORIENTATION_MARKER_OPACITY}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export interface CuboidAxesMarkerProps {
  dimensions: THREE.Vector3Tuple;
}

// Basic RGB axes drawn at the cuboid centroid. Rendered in the cuboid's local
// frame (the parent group already carries its orientation), so the axes track
// the box's heading: +X red, +Y green, +Z blue.
export const CuboidAxesMarker = ({ dimensions }: CuboidAxesMarkerProps) => {
  const axes = useMemo(() => {
    const half = (axis: 0 | 1 | 2) =>
      Math.max(
        (getFiniteMagnitude(dimensions[axis]) / 2) *
          ORIENTATION_AXES_LENGTH_RATIO,
        ORIENTATION_AXES_MIN_LENGTH,
      );

    return [
      { color: ORIENTATION_AXES_COLORS.x, end: [half(0), 0, 0] },
      { color: ORIENTATION_AXES_COLORS.y, end: [0, half(1), 0] },
      { color: ORIENTATION_AXES_COLORS.z, end: [0, 0, half(2)] },
    ] as { color: string; end: THREE.Vector3Tuple }[];
  }, [dimensions]);

  return (
    <group userData={{ [FO_USER_DATA.IS_HELPER]: true }} renderOrder={3}>
      {axes.map(({ color, end }) => (
        <Line
          key={color}
          points={[[0, 0, 0], end] as THREE.Vector3Tuple[]}
          color={color}
          lineWidth={ORIENTATION_AXES_LINE_WIDTH}
          opacity={ORIENTATION_AXES_OPACITY}
          transparent
          depthTest={false}
          raycast={() => null}
        />
      ))}
    </group>
  );
};
