/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import * as THREE from "three";
import type { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import type { ReconciledDetection3D } from "../annotation/types";
import {
  ORIENTATION_MARKER_HEAD_SEGMENTS,
  getCuboidOrientationMarkerGeometry,
} from "./shared/cuboid-orientation-geometry";

// Pure geometry/matrix math for `CuboidInstances`, kept dependency-free (no
// React, no hooks, no event bus) so it can be unit tested without pulling in
// the rest of the app's module graph.

// Shared across every instance — each box's actual size/orientation is baked
// into its own matrix (see `computeBodyMatrix`), so the geometry itself just
// needs to be a unit cube.
export const UNIT_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

// Canonical arrowhead cone: unit radius, base at local origin, tip at local
// +X, unit length. Scaled per-instance by (headLength, headRadius,
// headRadius) (see `computeArrowheadMatrix`). A cone rather than a flat
// triangle: it's rotationally symmetric about its own axis, so — unlike a
// flat shape — it has no edge-on viewing angle that collapses it to an
// invisible sliver for some combinations of heading/up.
export const UNIT_ARROWHEAD_GEOMETRY = new THREE.ConeGeometry(
  1,
  1,
  ORIENTATION_MARKER_HEAD_SEGMENTS,
);
// `ConeGeometry` points along +Y, centered on its own axis; rotate so it
// points along +X instead (matching the arrow's fixed local axis) and
// re-center so the base sits at the origin and the tip at x=1.
UNIT_ARROWHEAD_GEOMETRY.rotateZ(-Math.PI / 2);
UNIT_ARROWHEAD_GEOMETRY.translate(0.5, 0, 0);

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
  const dimensions = label.data.dimensions;
  const [x, rawY, z] = label.data.location;
  // See `useDisplayCuboidTransform` for why legacy-coordinate labels need a
  // half-height offset here.
  const y = useLegacyCoordinates ? rawY - 0.5 * dimensions[1] : rawY;

  const quaternion = label.data.quaternion
    ? new THREE.Quaternion(...label.data.quaternion)
    : new THREE.Quaternion().setFromEuler(
        new THREE.Euler(...(label.data.rotation ?? overlayRotationFallback)),
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

// A unit box's edge topology (which corners each of the 12 edges connects)
// never changes — only the per-box position/quaternion/dimensions do. Reused
// across every `computeBoxEdgePositions` call instead of building and
// disposing a `BoxGeometry` + `EdgesGeometry` pair per box (which for ~3k
// cuboids meant 6k geometry allocations per rebuild).
const UNIT_BOX_CORNERS: THREE.Vector3Tuple[] = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
];
const BOX_EDGE_CORNER_INDICES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];
const _edgeMatrix = new THREE.Matrix4();
const _edgeCorners = UNIT_BOX_CORNERS.map(() => new THREE.Vector3());

/**
 * World-space edge endpoints for one box's outline, in the flat pairs format
 * `LineSegmentsGeometry.setPositions()` expects (each consecutive 2 vertices
 * = one edge).
 */
export function computeBoxEdgePositions(
  geometry: CuboidGeometry,
): Float32Array {
  _edgeMatrix.compose(
    new THREE.Vector3(...geometry.position),
    geometry.quaternion,
    new THREE.Vector3(...geometry.dimensions),
  );
  for (let i = 0; i < UNIT_BOX_CORNERS.length; i++) {
    _edgeCorners[i].set(...UNIT_BOX_CORNERS[i]).applyMatrix4(_edgeMatrix);
  }
  const positions = new Float32Array(EDGES_PER_BOX * 6);
  let offset = 0;
  for (const [a, b] of BOX_EDGE_CORNER_INDICES) {
    positions[offset++] = _edgeCorners[a].x;
    positions[offset++] = _edgeCorners[a].y;
    positions[offset++] = _edgeCorners[a].z;
    positions[offset++] = _edgeCorners[b].x;
    positions[offset++] = _edgeCorners[b].y;
    positions[offset++] = _edgeCorners[b].z;
  }
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
): THREE.Matrix4 {
  const markerGeometry = getCuboidOrientationMarkerGeometry(
    geometry.dimensions,
  );
  if (!markerGeometry) {
    return ZERO_SCALE_MATRIX.clone();
  }

  const { anchor, headLength, headRadius } = markerGeometry;
  const localMatrix = new THREE.Matrix4().compose(
    anchor,
    IDENTITY_QUATERNION,
    new THREE.Vector3(headLength, headRadius, headRadius),
  );
  const boxMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...geometry.position),
    geometry.quaternion,
    UNIT_SCALE,
  );
  return boxMatrix.multiply(localMatrix);
}

/**
 * Segment count per box in the *orientation* buffer (shaft + 3 axes) — kept
 * separate from `EDGES_PER_BOX` because edges and orientation markers now
 * live in two different `LineSegmentsGeometry`/`LineMaterial` pairs (see
 * `CuboidInstances`): edges need normal depth testing (they sit exactly on
 * the box surface and rely on a render-order tie-break), while orientation
 * markers need `depthTest: false` (their lines run from the box's *center*
 * outward — since `ORIENTATION_AXES_LENGTH_RATIO < 1`, they never reach the
 * surface, so normal depth testing would bury them inside the opaque body).
 */
export function orientationSegmentsPerBoxFor(showOrientation: boolean): number {
  return showOrientation ? SHAFT_SEGMENTS_PER_BOX + AXES_SEGMENTS_PER_BOX : 0;
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
  if (start) start.data.needsUpdate = true;
  if (end) end.data.needsUpdate = true;
};
