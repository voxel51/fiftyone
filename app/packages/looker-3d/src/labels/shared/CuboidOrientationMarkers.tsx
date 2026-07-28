import { Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FO_USER_DATA } from "../../constants";
import { getCuboidForwardFaceBasePoint } from "../../utils";

const ORIENTATION_MARKER_LINE_WIDTH = 4;
const ORIENTATION_MARKER_OPACITY = 0.95;
// Flat triangular arrowhead, sized relative to the cuboid's heading length.
const ORIENTATION_MARKER_EXTENSION_RATIO = 0.3;
const ORIENTATION_MARKER_HEAD_LENGTH_RATIO = 0.16;
const ORIENTATION_MARKER_MIN_HEAD_LENGTH = 0.08;
const ORIENTATION_MARKER_MIN_CROSS_SECTION_RATIO = 0.1;
// Half-width of the arrowhead base, as a fraction of its length and capped
// against the cuboid's smaller cross-section so it never overhangs the box.
const ORIENTATION_MARKER_HEAD_WIDTH_RATIO = 0.7;
const ORIENTATION_MARKER_HEAD_WIDTH_CROSS_CAP = 0.4;
const ORIENTATION_MARKER_MIN_HEAD_WIDTH = 0.03;

// RGB orientation axes drawn at the cuboid centroid when orientation is shown.
// Each axis length is a fraction of its own half-extent so the tripod stays
// inside the box and reflects its proportions (red = +X heading, green = +Y,
// blue = +Z).
export const ORIENTATION_AXES_LENGTH_RATIO = 0.55;
export const ORIENTATION_AXES_MIN_LENGTH = 0.04;
const ORIENTATION_AXES_LINE_WIDTH = 3;
const ORIENTATION_AXES_OPACITY = 0.75;
export const ORIENTATION_AXES_COLORS = {
  x: "#ff4136",
  y: "#2ecc40",
  z: "#1e90ff",
} as const;

export const getFiniteMagnitude = (value: number) =>
  Number.isFinite(value) ? Math.abs(value) : 0;

/**
 * Decomposed (pre-composition) form of the orientation arrow's geometry, in
 * the cuboid's local frame. `CuboidInstances` uses this directly to build a
 * per-instance affine matrix (translate to `anchor`, optionally rotate 90°
 * about local X when `spreadAlongZ`, then scale a canonical unit triangle by
 * `(headLength, headHalfWidth, headHalfWidth)`) instead of computing final
 * world-space triangle vertices per box.
 */
export interface CuboidOrientationMarkerGeometry {
  /** Local-space anchor at the shaft's end / arrowhead base center. */
  anchor: THREE.Vector3;
  /** Local-space point where the shaft begins (on the cuboid's forward face). */
  shaftStart: THREE.Vector3Tuple;
  headLength: number;
  headHalfWidth: number;
  /** True when the arrowhead's base spreads along local Z rather than local Y. */
  spreadAlongZ: boolean;
}

export const getCuboidOrientationMarkerGeometry = (
  dimensions: THREE.Vector3Tuple,
  orientation: THREE.Quaternion,
  upVector?: THREE.Vector3 | null,
): CuboidOrientationMarkerGeometry | null => {
  const length = getFiniteMagnitude(dimensions[0]);

  if (length <= 0) {
    return null;
  }

  const basePoint = getCuboidForwardFaceBasePoint({
    dimensions,
    orientation,
    upVector,
  });

  if (!basePoint) {
    return null;
  }

  const localYExtent = getFiniteMagnitude(dimensions[1]);
  const localZExtent = getFiniteMagnitude(dimensions[2]);
  const extensionLength = length * ORIENTATION_MARKER_EXTENSION_RATIO;
  const headLength = Math.max(
    Math.min(length * ORIENTATION_MARKER_HEAD_LENGTH_RATIO, extensionLength),
    ORIENTATION_MARKER_MIN_HEAD_LENGTH,
  );
  const crossSection = Math.max(
    Math.min(localYExtent, localZExtent),
    length * ORIENTATION_MARKER_MIN_CROSS_SECTION_RATIO,
  );
  const headHalfWidth = Math.max(
    Math.min(
      headLength * ORIENTATION_MARKER_HEAD_WIDTH_RATIO,
      crossSection * ORIENTATION_MARKER_HEAD_WIDTH_CROSS_CAP,
    ),
    ORIENTATION_MARKER_MIN_HEAD_WIDTH,
  );

  const shaftEndX = basePoint.x + extensionLength;
  const { y: baseY, z: baseZ } = basePoint;

  // The base point sits on the cuboid's lowest face, so its non-zero offset
  // axis is the "up" axis. Lay the flat arrowhead in the perpendicular
  // (horizontal) plane so it reads as a full triangle from a top-down view.
  const spreadAlongZ = Math.abs(baseY) >= Math.abs(baseZ);

  return {
    anchor: new THREE.Vector3(shaftEndX, baseY, baseZ),
    shaftStart: basePoint.toArray() as THREE.Vector3Tuple,
    headLength,
    headHalfWidth,
    spreadAlongZ,
  };
};

const getCuboidOrientationMarkerProps = (
  dimensions: THREE.Vector3Tuple,
  orientation: THREE.Quaternion,
  upVector?: THREE.Vector3 | null,
): {
  shaftStart: THREE.Vector3Tuple;
  shaftEnd: THREE.Vector3Tuple;
  headVertices: [THREE.Vector3Tuple, THREE.Vector3Tuple, THREE.Vector3Tuple];
} | null => {
  const geometry = getCuboidOrientationMarkerGeometry(
    dimensions,
    orientation,
    upVector,
  );

  if (!geometry) {
    return null;
  }

  const { anchor, shaftStart, headLength, headHalfWidth, spreadAlongZ } =
    geometry;
  const shaftEndX = anchor.x;
  const tipX = shaftEndX + headLength;
  const { y: baseY, z: baseZ } = anchor;

  const apex: THREE.Vector3Tuple = [tipX, baseY, baseZ];
  const base1: THREE.Vector3Tuple = spreadAlongZ
    ? [shaftEndX, baseY, baseZ + headHalfWidth]
    : [shaftEndX, baseY + headHalfWidth, baseZ];
  const base2: THREE.Vector3Tuple = spreadAlongZ
    ? [shaftEndX, baseY, baseZ - headHalfWidth]
    : [shaftEndX, baseY - headHalfWidth, baseZ];

  return {
    shaftStart,
    shaftEnd: [shaftEndX, baseY, baseZ],
    headVertices: [apex, base1, base2],
  };
};

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
