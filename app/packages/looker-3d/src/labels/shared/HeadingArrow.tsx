import { Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { CuboidResizeFace } from "../../annotation/cuboid-face-resize";
import { FO_USER_DATA } from "../../constants";
import { ORIENTATION_MARKER_HEAD_SEGMENTS } from "./cuboid-orientation-geometry";
import {
  FACE_DOT_HOVER_SCALE,
  HEADING_GHOST_COLOR,
  getHeadingFaceAnchor,
  getHeadingFaceDotRadius,
  getHeadingFaceDots,
  getHeadingGhostArrowGeometry,
} from "./heading-arrow-geometry";

export {
  HEADING_GHOST_COLOR,
  HEADING_GHOST_DRAG_OPACITY,
  HEADING_GHOST_HOVER_OPACITY,
  UP_GHOST_COLOR,
} from "./heading-arrow-geometry";

const GHOST_LINE_WIDTH = 5;
const FACE_DOT_SEGMENTS = 12;
// Dots idle faint and go solid once they're the snap target.
const FACE_DOT_IDLE_OPACITY = 0.45;
const FACE_DOT_ACTIVE_OPACITY = 1;
// The cone geometry points along its own local +Y by default.
const CONE_UP_AXIS = new THREE.Vector3(0, 1, 0);

export interface HeadingGhostArrowProps {
  dimensions: THREE.Vector3Tuple;
  /**
   * Face the ghost leaves from. It anchors to that face's center — on top of
   * the face's dot — and points straight out along the normal, so the ghost is
   * always perpendicular to a face rather than angled off at the raw pointer
   * direction.
   */
  anchorFace: CuboidResizeFace;
  opacity: number;
  color?: string;
}

/**
 * The heading arrow's drag preview: a second arrow standing on the face the
 * heading would move to, which hops from face to face as you drag. The
 * committed arrow stays put until the drop, so the two together read as
 * "here's where it is, here's where it's going".
 *
 * Non-pickable, so it can never intercept the drag it's previewing.
 */
export const HeadingGhostArrow = ({
  dimensions,
  anchorFace,
  opacity,
  color = HEADING_GHOST_COLOR,
}: HeadingGhostArrowProps) => {
  const geometry = useMemo(() => {
    const anchor = getHeadingFaceAnchor(dimensions, anchorFace);

    if (!anchor) {
      return null;
    }

    // Direction is the face normal, not the pointer direction, so the ghost
    // stays perpendicular to the face it's sitting on.
    return getHeadingGhostArrowGeometry(
      dimensions,
      anchor.normal,
      anchor.point,
    );
  }, [dimensions, anchorFace]);

  // The cone is centered on its own axis, so it sits at the midpoint between
  // the base (`shaftEnd`) and the tip, not at `shaftEnd` itself.
  const headCenter = useMemo(() => {
    if (!geometry) {
      return null;
    }
    return new THREE.Vector3(...geometry.shaftEnd).addScaledVector(
      geometry.direction,
      geometry.headLength / 2,
    );
  }, [geometry]);

  // `direction` can be any of the box's 6 face normals (unlike the committed
  // arrow, which is fixed to local +X), so the cone needs a per-face rotation
  // rather than one baked-in constant.
  const headQuaternion = useMemo(() => {
    if (!geometry) {
      return null;
    }
    return new THREE.Quaternion().setFromUnitVectors(
      CONE_UP_AXIS,
      geometry.direction,
    );
  }, [geometry]);

  if (!geometry || !headCenter || !headQuaternion) {
    return null;
  }

  return (
    <group userData={{ [FO_USER_DATA.IS_HELPER]: true }} renderOrder={4}>
      <Line
        points={[geometry.shaftStart, geometry.shaftEnd]}
        color={color}
        lineWidth={GHOST_LINE_WIDTH}
        opacity={opacity}
        transparent
        raycast={() => null}
      />
      {/* A cone, not a flat triangle — see `getHeadingGhostArrowGeometry`. */}
      <mesh
        position={headCenter}
        quaternion={headQuaternion}
        renderOrder={4}
        raycast={() => null}
      >
        <coneGeometry
          args={[
            geometry.headRadius,
            geometry.headLength,
            ORIENTATION_MARKER_HEAD_SEGMENTS,
          ]}
        />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export interface HeadingFaceDotsProps {
  dimensions: THREE.Vector3Tuple;
  /** Face the heading would snap to right now; that dot is emphasized. */
  activeFace?: CuboidResizeFace | null;
  color?: string;
}

/**
 * A dot at the center of each face, marking where the heading can be
 * reattached. Non-pickable: the target is resolved by screen-space proximity to
 * these positions rather than by raycasting the dots, so dots that overlap or
 * sit behind the box stay resolvable.
 *
 * These keep `depthTest={false}`, unlike the ghost arrow. They sit exactly on
 * the surface, so depth testing would z-fight with the box's own faces, and
 * hiding the far three would make those faces impossible to aim at.
 */
export const HeadingFaceDots = ({
  dimensions,
  activeFace = null,
  color = HEADING_GHOST_COLOR,
}: HeadingFaceDotsProps) => {
  const dots = useMemo(() => getHeadingFaceDots(dimensions), [dimensions]);
  const radius = useMemo(
    () => getHeadingFaceDotRadius(dimensions),
    [dimensions],
  );

  return (
    <group userData={{ [FO_USER_DATA.IS_HELPER]: true }} renderOrder={4}>
      {dots.map(({ face, position }) => {
        const isActive = face === activeFace;

        return (
          <mesh
            key={`heading-dot-${face}`}
            position={position}
            scale={isActive ? FACE_DOT_HOVER_SCALE : 1}
            renderOrder={4}
            raycast={() => null}
          >
            <sphereGeometry
              args={[radius, FACE_DOT_SEGMENTS, FACE_DOT_SEGMENTS]}
            />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={
                isActive ? FACE_DOT_ACTIVE_OPACITY : FACE_DOT_IDLE_OPACITY
              }
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
};
