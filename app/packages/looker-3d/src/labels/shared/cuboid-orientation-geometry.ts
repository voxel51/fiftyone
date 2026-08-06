import * as THREE from "three";

const DEFAULT_SCENE_UP_VECTOR = new THREE.Vector3(0, 0, 1);

// Flat triangular arrowhead, sized relative to the box's arrow scale below.
// Exported so the drag-preview ghost in `heading-arrow-geometry.ts` shares one
// set of proportions with the committed arrow rather than mirroring them.
export const ORIENTATION_MARKER_EXTENSION_RATIO = 0.3;
export const ORIENTATION_MARKER_HEAD_LENGTH_RATIO = 0.16;
export const ORIENTATION_MARKER_MIN_HEAD_LENGTH = 0.08;
const ORIENTATION_MARKER_MIN_CROSS_SECTION_RATIO = 0.1;
// Half-width of the arrowhead base, as a fraction of its length and capped
// against the cuboid's smaller cross-section so it never overhangs the box.
export const ORIENTATION_MARKER_HEAD_WIDTH_RATIO = 0.7;
const ORIENTATION_MARKER_HEAD_WIDTH_CROSS_CAP = 0.4;
export const ORIENTATION_MARKER_MIN_HEAD_WIDTH = 0.03;

// RGB orientation axes drawn at the cuboid centroid when orientation is shown.
// Each axis length is a fraction of its own half-extent so the tripod stays
// inside the box and reflects its proportions (red = +X heading, green = +Y,
// blue = +Z).
export const ORIENTATION_AXES_LENGTH_RATIO = 0.55;
export const ORIENTATION_AXES_MIN_LENGTH = 0.04;
export const ORIENTATION_AXES_COLORS = {
  x: "#ff4136",
  y: "#2ecc40",
  z: "#1e90ff",
} as const;

export const getFiniteMagnitude = (value: number) =>
  Number.isFinite(value) ? Math.abs(value) : 0;

/**
 * The scalar every arrow's length is derived from: the box's *smallest* extent.
 *
 * Deliberately independent of direction. Sizing off the extent the arrow points
 * along stretched it out whenever the heading ran down a long axis (a 4.5m car
 * grew a ~1.3m arrow), and made the drag-preview ghost change length as it
 * hopped between faces. One scalar per box keeps every arrow on it identical
 * and stops a long box from growing an outsized one.
 */
export const getHeadingArrowLengthScale = (
  dimensions: THREE.Vector3Tuple,
): number => {
  const extents = dimensions
    .map(getFiniteMagnitude)
    .filter((extent) => extent > 0);

  return extents.length > 0 ? Math.min(...extents) : 0;
};

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

  // Center of the forward (+X) face. An earlier version anchored to that face's
  // lowest edge, which read as the arrow belonging to the bottom of the box
  // rather than to the face as a whole.
  const basePoint = new THREE.Vector3(length / 2, 0, 0);

  const localYExtent = getFiniteMagnitude(dimensions[1]);
  const localZExtent = getFiniteMagnitude(dimensions[2]);
  // Length comes from the box-wide scale, not `length` (the heading extent), so
  // the arrow doesn't stretch along a long axis. `length` still positions the
  // anchor on the forward face.
  const arrowScale = getHeadingArrowLengthScale(dimensions);
  const extensionLength = arrowScale * ORIENTATION_MARKER_EXTENSION_RATIO;
  const headLength = Math.max(
    Math.min(
      arrowScale * ORIENTATION_MARKER_HEAD_LENGTH_RATIO,
      extensionLength,
    ),
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

  // Lay the flat arrowhead in the horizontal plane so it reads as a full
  // triangle from a top-down view: spread it across whichever of local Y/Z
  // points least along "up". (This used to be inferred from the base point's
  // offset axis, which no longer works now that it sits at the face center.)
  const effectiveUp =
    upVector && upVector.lengthSq() > 0
      ? upVector.clone().normalize()
      : DEFAULT_SCENE_UP_VECTOR;
  const localYAlongUp = Math.abs(
    new THREE.Vector3(0, 1, 0).applyQuaternion(orientation).dot(effectiveUp),
  );
  const localZAlongUp = Math.abs(
    new THREE.Vector3(0, 0, 1).applyQuaternion(orientation).dot(effectiveUp),
  );
  const spreadAlongZ = localZAlongUp <= localYAlongUp;

  return {
    anchor: new THREE.Vector3(shaftEndX, baseY, baseZ),
    shaftStart: basePoint.toArray() as THREE.Vector3Tuple,
    headLength,
    headHalfWidth,
    spreadAlongZ,
  };
};

/**
 * Composed (final) local-space points for the standalone `CuboidOrientationMarker`
 * component. Built on top of `getCuboidOrientationMarkerGeometry`.
 */
export const getCuboidOrientationMarkerProps = (
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
