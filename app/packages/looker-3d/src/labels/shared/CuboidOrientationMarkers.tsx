import { Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { FO_USER_DATA } from "../../constants";
import {
  ORIENTATION_AXES_COLORS,
  ORIENTATION_AXES_LENGTH_RATIO,
  ORIENTATION_AXES_MIN_LENGTH,
  ORIENTATION_MARKER_HEAD_SEGMENTS,
  getCuboidOrientationMarkerGeometry,
  getCuboidOrientationMarkerPropsFromGeometry,
  getFiniteMagnitude,
} from "./cuboid-orientation-geometry";

export {
  HEADING_FORWARD_FACE,
  ORIENTATION_AXES_COLORS,
  ORIENTATION_AXES_LENGTH_RATIO,
  ORIENTATION_AXES_MIN_LENGTH,
  getCuboidOrientationMarkerGeometry,
  getFiniteMagnitude,
  type CuboidOrientationMarkerGeometry,
} from "./cuboid-orientation-geometry";

const ORIENTATION_MARKER_LINE_WIDTH = 4;
const ORIENTATION_MARKER_OPACITY = 0.95;
const ORIENTATION_MARKER_HIGHLIGHT_LINE_WIDTH = 6;
const ORIENTATION_AXES_LINE_WIDTH = 3;
const ORIENTATION_AXES_OPACITY = 0.75;

// The arrow itself is a thin line plus a small cone — far too small to grab
// reliably — so when it's interactive we wrap it in an invisible box hit volume
// spanning shaft-start to tip, inflated past the arrowhead's own width.
const ORIENTATION_MARKER_HIT_PADDING = 2;

// The cone geometry points along local +Y by default; this rotates it -90°
// about Z so it points along local +X instead, the arrow's fixed axis (see
// `HEADING_FORWARD_FACE`).
const ARROWHEAD_ROTATION: THREE.EulerTuple = [0, 0, -Math.PI / 2];

export interface CuboidOrientationMarkerProps {
  dimensions: THREE.Vector3Tuple;
  color: string;
  /**
   * Pointer handlers for the heading-drag interaction. When any is supplied an
   * invisible hit volume is added around the arrow; the visible shaft and head
   * stay non-pickable either way, so purely decorative usages are unaffected.
   */
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  /** Emphasizes the arrow while it's hovered or being dragged. */
  highlighted?: boolean;
}

export const CuboidOrientationMarker = ({
  dimensions,
  color,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  onPointerMove,
  highlighted = false,
}: CuboidOrientationMarkerProps) => {
  // Computed once and shared below: `markerProps` (the drawn shaft/head) and
  // `hitVolume` (its pick box) must agree, since the hit volume has to cover
  // the drawn arrow.
  const geometry = useMemo(
    () => getCuboidOrientationMarkerGeometry(dimensions),
    [dimensions],
  );

  const markerProps = useMemo(
    () =>
      geometry ? getCuboidOrientationMarkerPropsFromGeometry(geometry) : null,
    [geometry],
  );

  const isInteractive = Boolean(
    onPointerDown || onPointerOver || onPointerOut || onPointerMove,
  );

  // Box spanning the whole arrow (shaft start → tip), sized off the arrowhead
  // so it scales with the marker instead of the box.
  const hitVolume = useMemo(() => {
    if (!isInteractive || !geometry) {
      return null;
    }

    const { anchor, shaftStart, headLength, headRadius } = geometry;
    const tipX = anchor.x + headLength;
    const length = tipX - shaftStart[0];

    if (!(length > 0)) {
      return null;
    }

    const thickness = headRadius * 2 * ORIENTATION_MARKER_HIT_PADDING;

    return {
      args: [length, thickness, thickness] as THREE.Vector3Tuple,
      position: [
        (shaftStart[0] + tipX) / 2,
        anchor.y,
        anchor.z,
      ] as THREE.Vector3Tuple,
    };
  }, [geometry, isInteractive]);

  if (!markerProps) {
    return null;
  }

  // The cone is centered on its own axis, so it sits at the midpoint between
  // the base (`shaftEnd`) and the tip, not at `shaftEnd` itself.
  const headCenter: THREE.Vector3Tuple = [
    markerProps.shaftEnd[0] + markerProps.headLength / 2,
    markerProps.shaftEnd[1],
    markerProps.shaftEnd[2],
  ];

  return (
    <group userData={{ [FO_USER_DATA.IS_HELPER]: true }} renderOrder={3}>
      {/* Depth-tested, unlike the axes tripod below: the arrow starts at the
          forward face and extends *outside* the box, so normal depth testing
          reads correctly and occludes it when it points away from the camera.
          Forcing it on top made the heading look the same from every angle. */}
      <Line
        points={[markerProps.shaftStart, markerProps.shaftEnd]}
        color={color}
        lineWidth={
          highlighted
            ? ORIENTATION_MARKER_HIGHLIGHT_LINE_WIDTH
            : ORIENTATION_MARKER_LINE_WIDTH
        }
        opacity={highlighted ? 1 : ORIENTATION_MARKER_OPACITY}
        transparent
        raycast={() => null}
      />
      {/* A cone, not a flat triangle: unlike a flat shape, it has no edge-on
          viewing angle that collapses it to an invisible sliver — the
          orthographic side-panel cameras lock onto the box's own axes and
          would otherwise view a flat head exactly edge-on from some panels. */}
      <mesh
        position={headCenter}
        rotation={ARROWHEAD_ROTATION}
        renderOrder={3}
        raycast={() => null}
      >
        <coneGeometry
          args={[
            markerProps.headRadius,
            markerProps.headLength,
            ORIENTATION_MARKER_HEAD_SEGMENTS,
          ]}
        />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={highlighted ? 1 : ORIENTATION_MARKER_OPACITY}
          depthWrite={false}
        />
      </mesh>

      {hitVolume && (
        <mesh
          position={hitVolume.position}
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onPointerMove={onPointerMove}
        >
          <boxGeometry args={hitVolume.args} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
};

export interface CuboidAxesMarkerProps {
  dimensions: THREE.Vector3Tuple;
}

// Basic RGB axes drawn at the cuboid centroid. Rendered in the cuboid's local
// frame (the parent group already carries its orientation), so the axes track
// the box's heading: +X red, +Y green, +Z blue.
//
// These keep `depthTest={false}`: they live entirely *inside* the box and would
// otherwise always be buried behind its front face. That's the opposite of the
// heading arrow above, which extends past the surface and so is depth-tested.
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
