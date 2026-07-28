/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import * as THREE from "three";
import type { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import type { ReconciledDetection3D } from "../annotation/types";
import { getCuboidOrientationMarkerGeometry } from "./shared/cuboid-orientation-geometry";

// Pure geometry/matrix math for `CuboidInstances`, kept dependency-free (no
// React, no hooks, no event bus) so it can be unit tested without pulling in
// the rest of the app's module graph.

// Shared across every instance — each box's actual size/orientation is baked
// into its own matrix (see `computeBodyMatrix`), so the geometry itself just
// needs to be a unit cube.
export const UNIT_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

// Canonical arrowhead triangle: apex at local +X, base corners at local ±Y,
// unit half-width. Scaled per-instance by (headLength, headHalfWidth,
// headHalfWidth); rotated 90° about local X when the box's arrowhead spreads
// along Z instead of Y (see `computeArrowheadMatrix`).
export const UNIT_ARROWHEAD_GEOMETRY = new THREE.BufferGeometry();
UNIT_ARROWHEAD_GEOMETRY.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(
    [
      1, 0, 0, // apex
      0, 1, 0, // base1
      0, -1, 0, // base2
    ],
    3,
  ),
);
const SPREAD_TO_Z_QUATERNION = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2,
);
const IDENTITY_QUATERNION = new THREE.Quaternion();
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
export const ZERO_SCALE_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export const EDGES_PER_BOX = 12;
export const SHAFT_SEGMENTS_PER_BOX = 1;
export const AXES_SEGMENTS_PER_BOX = 3;

export interface CuboidGeometry {
  position: THREE.Vector3Tuple;
  dimensions: THREE.Vector3Tuple;
  quaternion: THREE.Quaternion;
}

/**
 * Resolves a non-edited label's display geometry directly from its own
 * (already-reconciled) fields — `detectionsToRender` labels are the working
 * store's current values, so there's no separate "effective" lookup needed
 * the way `useCuboidAnnotation` does for the one actively-edited box. This
 * intentionally skips transient-drag handling: a box being dragged is always
 * popped out to the standalone path (see `ThreeDLabels`), never present here.
 *
 * `overlayRotationFallback` mirrors `ThreeDLabels`' `cuboidOverlays` prop
 * assembly: a label missing its own `rotation` field there ends up with the
 * scene-level `overlayRotation` as its effective rotation (the JSX prop
 * spread order means `overlay.rotation`, when present, overrides the
 * `rotation={overlayRotation}` prop — but nothing overrides it when absent).
 */
export function resolveCuboidGeometry(
  label: ReconciledDetection3D,
  useLegacyCoordinates: boolean,
  overlayRotationFallback: THREE.Vector3Tuple,
): CuboidGeometry {
  const dimensions = label.dimensions;
  const [x, rawY, z] = label.location;
  // See `useDisplayCuboidTransform` for why legacy-coordinate labels need a
  // half-height offset here.
  const y = useLegacyCoordinates ? rawY - 0.5 * dimensions[1] : rawY;

  const quaternion = label.quaternion
    ? new THREE.Quaternion(...label.quaternion)
    : new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...(label.rotation ?? overlayRotationFallback)),
      );

  return { position: [x, y, z], dimensions, quaternion };
}

export function computeBodyMatrix(geometry: CuboidGeometry): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...geometry.position),
    geometry.quaternion,
    new THREE.Vector3(...geometry.dimensions),
  );
}

/**
 * World-space edge endpoints for one box's outline, in the flat pairs format
 * `LineSegmentsGeometry.setPositions()` expects (each consecutive 2 vertices
 * = one edge). `EdgesGeometry` already emits exactly this shape.
 */
export function computeBoxEdgePositions(
  geometry: CuboidGeometry,
): Float32Array {
  const box = new THREE.BoxGeometry(...geometry.dimensions);
  box.applyQuaternion(geometry.quaternion);
  box.translate(...geometry.position);
  const edges = new THREE.EdgesGeometry(box);
  const positions = new Float32Array(
    edges.attributes.position.array as Float32Array,
  );
  box.dispose();
  edges.dispose();
  return positions;
}

const _localPoint = new THREE.Vector3();
const _worldOffset = new THREE.Vector3();

export function localToWorld(
  local: THREE.Vector3Tuple | THREE.Vector3,
  geometry: CuboidGeometry,
): THREE.Vector3Tuple {
  if (local instanceof THREE.Vector3) {
    _localPoint.copy(local);
  } else {
    _localPoint.set(local[0], local[1], local[2]);
  }
  _worldOffset.set(...geometry.position);
  _localPoint.applyQuaternion(geometry.quaternion).add(_worldOffset);
  return [_localPoint.x, _localPoint.y, _localPoint.z];
}

/**
 * Per-instance affine matrix for the merged arrowhead `InstancedMesh` (see
 * `UNIT_ARROWHEAD_GEOMETRY`), derived from the same decomposed geometry the
 * standalone `CuboidOrientationMarker` uses (`getCuboidOrientationMarkerGeometry`).
 */
export function computeArrowheadMatrix(
  geometry: CuboidGeometry,
  upVector: THREE.Vector3 | null,
): THREE.Matrix4 {
  const markerGeometry = getCuboidOrientationMarkerGeometry(
    geometry.dimensions,
    geometry.quaternion,
    upVector,
  );
  if (!markerGeometry) {
    return ZERO_SCALE_MATRIX.clone();
  }

  const { anchor, headLength, headHalfWidth, spreadAlongZ } = markerGeometry;
  const localMatrix = new THREE.Matrix4().compose(
    anchor,
    spreadAlongZ ? SPREAD_TO_Z_QUATERNION : IDENTITY_QUATERNION,
    new THREE.Vector3(headLength, headHalfWidth, headHalfWidth),
  );
  const boxMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...geometry.position),
    geometry.quaternion,
    UNIT_SCALE,
  );
  return boxMatrix.multiply(localMatrix);
}

export function segmentsPerBoxFor(showOrientation: boolean): number {
  return (
    EDGES_PER_BOX +
    (showOrientation ? SHAFT_SEGMENTS_PER_BOX + AXES_SEGMENTS_PER_BOX : 0)
  );
}

export const setSegmentColor = (
  geometry: LineSegmentsGeometry,
  segmentIndex: number,
  color: THREE.Color,
) => {
  const start = geometry.attributes.instanceColorStart as
    | THREE.InterleavedBufferAttribute
    | undefined;
  const end = geometry.attributes.instanceColorEnd as
    | THREE.InterleavedBufferAttribute
    | undefined;
  start?.setXYZ(segmentIndex, color.r, color.g, color.b);
  end?.setXYZ(segmentIndex, color.r, color.g, color.b);
};
