import * as THREE from "three";
import type { CuboidResizeFace } from "../../annotation/cuboid-face-resize";

// The shaft and arrowhead built below always run along local +x — this names
// that assumption for consumers that need to anchor UI (ghost previews,
// default editor selection) to "the face the heading arrow points at".
export const HEADING_FORWARD_FACE: CuboidResizeFace = "+x";

// Conical arrowhead, sized relative to the box's arrow scale below. Exported
// so the drag-preview ghost in `heading-arrow-geometry.ts` shares one set of
// proportions with the committed arrow rather than mirroring them. A cone
// (rather than a flat triangle) has no edge-on viewing angle that collapses
// it to an invisible sliver — the orthographic side-panel cameras lock onto
// the box's own axes and would otherwise view a flat head exactly edge-on
// for some combinations of heading/up.
export const ORIENTATION_MARKER_EXTENSION_RATIO = 0.3;
export const ORIENTATION_MARKER_HEAD_LENGTH_RATIO = 0.16;
export const ORIENTATION_MARKER_MIN_HEAD_LENGTH = 0.08;
const ORIENTATION_MARKER_MIN_CROSS_SECTION_RATIO = 0.1;
// Radius of the arrowhead's base circle, as a fraction of its length and
// capped against the cuboid's smaller cross-section so it never overhangs
// the box.
export const ORIENTATION_MARKER_HEAD_WIDTH_RATIO = 0.7;
const ORIENTATION_MARKER_HEAD_WIDTH_CROSS_CAP = 0.4;
export const ORIENTATION_MARKER_MIN_HEAD_WIDTH = 0.03;
// Radial resolution shared by every arrowhead cone (committed, ghost, and the
// GPU-instanced unit geometry) so they all read as the same shape.
export const ORIENTATION_MARKER_HEAD_SEGMENTS = 8;

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
 * per-instance affine matrix (translate to `anchor`, then scale a canonical
 * unit cone by `(headLength, headRadius, headRadius)`) instead of computing
 * final world-space geometry per box.
 *
 * A function of `dimensions` alone: the arrow always runs along local +X
 * (see `HEADING_FORWARD_FACE`) and a cone's cross-section is the same from
 * every angle around that axis, so — unlike the flat triangle this replaced —
 * nothing here depends on the box's orientation or which way is "up".
 */
export interface CuboidOrientationMarkerGeometry {
  /** Local-space anchor at the shaft's end / arrowhead base center. */
  anchor: THREE.Vector3;
  /** Local-space point where the shaft begins (on the cuboid's forward face). */
  shaftStart: THREE.Vector3Tuple;
  headLength: number;
  /** Radius of the arrowhead's (conical) base circle. */
  headRadius: number;
}

export const getCuboidOrientationMarkerGeometry = (
  dimensions: THREE.Vector3Tuple,
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
  const headRadius = Math.max(
    Math.min(
      headLength * ORIENTATION_MARKER_HEAD_WIDTH_RATIO,
      crossSection * ORIENTATION_MARKER_HEAD_WIDTH_CROSS_CAP,
    ),
    ORIENTATION_MARKER_MIN_HEAD_WIDTH,
  );

  const shaftEndX = basePoint.x + extensionLength;
  const { y: baseY, z: baseZ } = basePoint;

  return {
    anchor: new THREE.Vector3(shaftEndX, baseY, baseZ),
    shaftStart: basePoint.toArray() as THREE.Vector3Tuple,
    headLength,
    headRadius,
  };
};

/**
 * Composed (final) local-space points derived from a `CuboidOrientationMarkerGeometry`
 * — mainly `shaftEnd` as a plain tuple (matching `shaftStart`'s shape) instead
 * of the raw `anchor` vector, for callers building a `Line` between the two.
 */
export const getCuboidOrientationMarkerPropsFromGeometry = (
  geometry: CuboidOrientationMarkerGeometry,
): {
  shaftStart: THREE.Vector3Tuple;
  shaftEnd: THREE.Vector3Tuple;
  headLength: number;
  headRadius: number;
} => {
  const { anchor, shaftStart, headLength, headRadius } = geometry;

  return {
    shaftStart,
    shaftEnd: [anchor.x, anchor.y, anchor.z],
    headLength,
    headRadius,
  };
};
