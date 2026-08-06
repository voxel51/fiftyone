import * as THREE from "three";
import {
  CUBOID_RESIZE_FACES,
  getCuboidResizeFaceAxis,
  type CuboidResizeFace,
} from "../../annotation/cuboid-face-resize";
import {
  ORIENTATION_MARKER_EXTENSION_RATIO,
  ORIENTATION_MARKER_HEAD_LENGTH_RATIO,
  ORIENTATION_MARKER_HEAD_WIDTH_RATIO,
  ORIENTATION_MARKER_MIN_HEAD_LENGTH,
  ORIENTATION_MARKER_MIN_HEAD_WIDTH,
  getHeadingArrowLengthScale,
} from "./cuboid-orientation-geometry";

/**
 * Geometry for the heading-drag affordances: a "ghost" arrow that tracks the
 * pointer continuously while dragging, and a dot on each face marking where the
 * heading can be reattached. Both live in the cuboid's local frame, so the
 * parent group's orientation carries them.
 *
 * The ghost is deliberately separate from `cuboid-orientation-geometry.ts`: the
 * committed arrow only ever leaves the +X face, whereas the ghost leaves
 * whichever face it is previewing. Both anchor at that face's center (see
 * {@link getHeadingFaceAnchor}) and share one set of proportions — imported from
 * that module rather than mirrored here — so the two are the same size.
 */

// Light orange, distinct from the committed arrow's complementary color.
export const HEADING_GHOST_COLOR = "#ffb266";
// Cyan, distinct from the heading ghost's orange — used for the "up" preview
// in the "Edit heading/up vector" popup/sidebar.
export const UP_GHOST_COLOR = "#5ce1e6";
export const HEADING_GHOST_HOVER_OPACITY = 0.6;
export const HEADING_GHOST_DRAG_OPACITY = 0.8;

// Face dots are sized off the box's smallest extent, floored so they stay
// visible on thin boxes and capped so they don't swallow small ones.
const FACE_DOT_RADIUS_RATIO = 0.06;
const FACE_DOT_MIN_RADIUS = 0.02;
const FACE_DOT_MAX_EXTENT_RATIO = 0.2;
export const FACE_DOT_HOVER_SCALE = 1.6;

const EPSILON = 1e-10;

const finiteMagnitude = (value: number) =>
  Number.isFinite(value) ? Math.abs(value) : 0;

const halfExtents = (dimensions: THREE.Vector3Tuple) =>
  dimensions.map((d) => finiteMagnitude(d) / 2) as THREE.Vector3Tuple;

/**
 * Distance from the box center to its surface along `direction` — the ray/box
 * exit distance, i.e. the smallest half-extent-to-component ratio. Used so the
 * ghost's shaft reaches the surface it's pointing at regardless of direction.
 */
export function getBoxSurfaceDistanceAlong(
  dimensions: THREE.Vector3Tuple,
  direction: THREE.Vector3,
): number {
  const half = halfExtents(dimensions);
  let distance = Number.POSITIVE_INFINITY;

  for (let axis = 0; axis < 3; axis++) {
    const component = Math.abs(direction.getComponent(axis));
    if (component > EPSILON) {
      distance = Math.min(distance, half[axis] / component);
    }
  }

  return Number.isFinite(distance) ? distance : 0;
}

export interface HeadingFaceAnchor {
  /** Center of the face, in the cuboid's local frame. */
  point: THREE.Vector3;
  /** The face's outward normal, also in the local frame. */
  normal: THREE.Vector3;
}

/**
 * Where an arrow leaving `face` attaches: the face's center, pointing straight
 * out along its normal. Anchoring at the center (rather than an edge) puts the
 * arrow's tail exactly on that face's dot, so the dots read as the connection
 * points they are.
 */
export function getHeadingFaceAnchor(
  dimensions: THREE.Vector3Tuple,
  face: CuboidResizeFace,
): HeadingFaceAnchor | null {
  const half = halfExtents(dimensions);
  const { axis, sign } = getCuboidResizeFaceAxis(face);

  if (!(half[axis] > 0)) {
    return null;
  }

  const point = new THREE.Vector3();
  point.setComponent(axis, sign * half[axis]);

  return {
    point,
    normal: new THREE.Vector3().setComponent(axis, sign),
  };
}

export interface ProjectedHeadingFaceDot {
  face: CuboidResizeFace;
  /** Dot position projected to normalized device coordinates. */
  x: number;
  y: number;
  /** Distance from the camera, used only to break screen-space ties. */
  cameraDistance: number;
}

// How close two dots must be, as a fraction of how far the dots spread across
// the screen, before they count as overlapping. Scaling with the box's apparent
// size keeps the rule meaningful whether it fills the viewport or is a speck.
const OVERLAP_SPREAD_FRACTION = 0.15;
const MIN_OVERLAP_EPSILON = 0.005;

/**
 * How far apart the projected dots sit on screen — the largest distance from
 * their centroid. Used to scale the overlap tolerance to the box's apparent
 * size rather than hard-coding an absolute NDC figure.
 */
function getProjectedSpread(projected: ProjectedHeadingFaceDot[]): number {
  const centroidX =
    projected.reduce((sum, dot) => sum + dot.x, 0) / projected.length;
  const centroidY =
    projected.reduce((sum, dot) => sum + dot.y, 0) / projected.length;

  return projected.reduce(
    (widest, dot) =>
      Math.max(widest, Math.hypot(dot.x - centroidX, dot.y - centroidY)),
    0,
  );
}

/**
 * Nearest face dot to the cursor in screen space.
 *
 * Screen-space picking is what makes the face pointing at the camera reachable
 * at all: resolving the target from a 3D drag direction on a view-perpendicular
 * plane can't express a direction along the view axis, so both camera-axis faces
 * were unreachable. Here you simply move toward the dot you want.
 *
 * Two points on the view axis project to the *same* screen point, so the near
 * and far faces along it are genuinely indistinguishable to a 2D cursor — no
 * amount of tie-breaking separates them. Ties within the overlap tolerance
 * therefore go to whichever face points at the camera, which is the one a user
 * aiming at the box's middle almost always means. Rotating the view even
 * slightly pulls the two dots apart and makes the far one directly selectable;
 * in an exactly axis-aligned view (the orthographic side panels) pick that face
 * from a panel where its normal runs across the screen instead.
 *
 * `overlapEpsilon` defaults to a fraction of the dots' on-screen spread.
 */
export function pickNearestHeadingFace(
  projected: ProjectedHeadingFaceDot[],
  cursor: { x: number; y: number },
  overlapEpsilon?: number,
): CuboidResizeFace | null {
  if (projected.length === 0) {
    return null;
  }

  const epsilon =
    overlapEpsilon ??
    Math.max(
      getProjectedSpread(projected) * OVERLAP_SPREAD_FRACTION,
      MIN_OVERLAP_EPSILON,
    );

  const withDistance = projected.map((dot) => ({
    dot,
    distance: Math.hypot(dot.x - cursor.x, dot.y - cursor.y),
  }));

  const nearest = withDistance.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  );

  // Among dots that are effectively on top of each other on screen, prefer the
  // one facing the camera.
  const contenders = withDistance.filter(
    ({ distance }) => distance - nearest.distance <= epsilon,
  );

  return contenders.reduce((best, candidate) =>
    candidate.dot.cameraDistance < best.dot.cameraDistance ? candidate : best,
  ).dot.face;
}

export interface HeadingGhostArrowGeometry {
  shaftStart: THREE.Vector3Tuple;
  shaftEnd: THREE.Vector3Tuple;
  headVertices: [THREE.Vector3Tuple, THREE.Vector3Tuple, THREE.Vector3Tuple];
}

/**
 * Flat triangular arrow pointing along `direction`, starting from `origin` (a
 * point on the box surface, via {@link getHeadingFaceAnchor}) and extending
 * outward — mirroring how the committed arrow leaves its face. Falls back to the
 * box center when no origin is given.
 */
export function getHeadingGhostArrowGeometry(
  dimensions: THREE.Vector3Tuple,
  direction: THREE.Vector3,
  origin?: THREE.Vector3 | null,
): HeadingGhostArrowGeometry | null {
  if (direction.lengthSq() <= EPSILON) {
    return null;
  }

  const dir = direction.clone().normalize();
  const surfaceDistance = getBoxSurfaceDistanceAlong(dimensions, dir);

  if (!(surfaceDistance > 0)) {
    return null;
  }

  // Sized off the box-wide arrow scale, exactly as the committed arrow is, so
  // the ghost is the same length whichever face it stands on and the two read
  // as one object mid-gesture.
  const arrowScale = getHeadingArrowLengthScale(dimensions);
  const extension = arrowScale * ORIENTATION_MARKER_EXTENSION_RATIO;
  const headLength = Math.max(
    Math.min(arrowScale * ORIENTATION_MARKER_HEAD_LENGTH_RATIO, extension),
    ORIENTATION_MARKER_MIN_HEAD_LENGTH,
  );
  const headHalfWidth = Math.max(
    headLength * ORIENTATION_MARKER_HEAD_WIDTH_RATIO,
    ORIENTATION_MARKER_MIN_HEAD_WIDTH,
  );

  // Anchored on the surface, the shaft only spans the overhang; anchored at the
  // center it has to cross the box first.
  const start = origin ? origin.clone() : new THREE.Vector3();
  const shaftLength = origin ? extension : surfaceDistance + extension;
  const baseCenter = start.clone().add(dir.clone().multiplyScalar(shaftLength));
  const tip = start
    .clone()
    .add(dir.clone().multiplyScalar(shaftLength + headLength));

  // Spread the flat head across whichever axis the direction leans on least,
  // so the triangle never collapses to a line.
  const leastAlignedAxis = ([0, 1, 2] as const).reduce((best, axis) =>
    Math.abs(dir.getComponent(axis)) < Math.abs(dir.getComponent(best))
      ? axis
      : best,
  );
  const spread = new THREE.Vector3()
    .crossVectors(dir, new THREE.Vector3().setComponent(leastAlignedAxis, 1))
    .normalize()
    .multiplyScalar(headHalfWidth);

  return {
    shaftStart: start.toArray() as THREE.Vector3Tuple,
    shaftEnd: baseCenter.toArray() as THREE.Vector3Tuple,
    headVertices: [
      tip.toArray() as THREE.Vector3Tuple,
      baseCenter.clone().add(spread).toArray() as THREE.Vector3Tuple,
      baseCenter.clone().sub(spread).toArray() as THREE.Vector3Tuple,
    ],
  };
}

export interface HeadingFaceDot {
  face: CuboidResizeFace;
  position: THREE.Vector3Tuple;
}

/** One dot per face, at that face's center in the cuboid's local frame. */
export function getHeadingFaceDots(
  dimensions: THREE.Vector3Tuple,
): HeadingFaceDot[] {
  const half = halfExtents(dimensions);

  return CUBOID_RESIZE_FACES.map((face) => {
    const { axis, sign } = getCuboidResizeFaceAxis(face);
    const position: THREE.Vector3Tuple = [0, 0, 0];
    position[axis] = sign * half[axis];
    return { face, position };
  });
}

export function getHeadingFaceDotRadius(
  dimensions: THREE.Vector3Tuple,
): number {
  const extents = dimensions.map(finiteMagnitude);
  const smallest = Math.min(...extents);

  return Math.max(
    Math.min(
      smallest * FACE_DOT_RADIUS_RATIO,
      smallest * FACE_DOT_MAX_EXTENT_RATIO,
    ),
    FACE_DOT_MIN_RADIUS,
  );
}
