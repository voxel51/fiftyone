import * as THREE from "three";
import {
  getCuboidResizeFaceAxis,
  getCuboidResizeFaceFromNormal,
  type CuboidResizeFace,
} from "./cuboid-face-resize";

/**
 * A cuboid's heading is its local +X axis, and `dimensions[0]` is the extent
 * along it — there is no separately stored "heading" field. So changing which
 * face the heading arrow points out of is a *relabeling* of the box's local
 * axes, not a rotation: we pick a new signed local basis, permute `dimensions`
 * into the matching slot order, and post-multiply the orientation by the
 * change-of-basis so the box occupies exactly the same world-space volume as
 * before. Only the meaning of "local +X" (and therefore which dimension is
 * the heading length) changes.
 *
 * Because no continuous rotation is ever produced, this is exact for all six
 * faces including straight up/down (a drone's heading), with no ground-plane
 * projection step and no degenerate case.
 */

const EPSILON = 1e-10;

type AxisIndex = 0 | 1 | 2;
type AxisSign = 1 | -1;

interface SignedAxis {
  axis: AxisIndex;
  sign: AxisSign;
}

export interface CuboidHeadingRelabel {
  dimensions: THREE.Vector3Tuple;
  quaternion: THREE.Vector4Tuple;
  /**
   * The signed old-axis that each new local axis slot now refers to, in
   * new-slot order (X, Y, Z). Exposed for tests/debugging — callers only need
   * `dimensions`/`quaternion`.
   */
  basis: [SignedAxis, SignedAxis, SignedAxis];
}

const ALL_AXES: AxisIndex[] = [0, 1, 2];

const toVector = ({ axis, sign }: SignedAxis) =>
  new THREE.Vector3().setComponent(axis, sign);

/**
 * The signed axis equal to `a × b`. Used to fill the basis's last slot so the
 * relabeling is always a proper rotation (determinant +1); a reflected basis
 * would mirror the box rather than relabel it.
 */
const crossAxis = (a: SignedAxis, b: SignedAxis): SignedAxis => {
  const cross = new THREE.Vector3().crossVectors(toVector(a), toVector(b));
  const axis = ALL_AXES.find(
    (index) => Math.abs(cross.getComponent(index)) > EPSILON,
  );

  if (axis === undefined) {
    // Only reachable if a and b were parallel; callers always pass distinct
    // perpendicular axes.
    return { axis: 2, sign: 1 };
  }

  return { axis, sign: cross.getComponent(axis) > 0 ? 1 : -1 };
};

/**
 * Builds the relabel that places `newX` at new-slot 0 and `newUp` at new-slot
 * `upSlot` (1 or 2, chosen by the caller — independent of `newUp`'s own old
 * axis number), filling the third slot via cross product so the basis stays
 * right-handed (a proper rotation, not a mirror).
 */
const buildRelabelFromExplicitSlots = (
  dimensions: THREE.Vector3Tuple,
  quaternion: THREE.Quaternion,
  newX: SignedAxis,
  upSlot: 1 | 2,
  newUp: SignedAxis,
): CuboidHeadingRelabel | null => {
  if (newX.axis === newUp.axis) {
    // Same axis (parallel or antiparallel) can't serve both roles.
    return null;
  }

  const basis: [SignedAxis, SignedAxis, SignedAxis] = [newX, newX, newX];
  basis[upSlot] = newUp;

  // Fill the remaining slot with the leftover axis, signed to keep the basis
  // right-handed: Z = X × Y, or Y = Z × X.
  if (upSlot === 2) {
    basis[1] = crossAxis(basis[2], basis[0]);
  } else {
    basis[2] = crossAxis(basis[0], basis[1]);
  }

  if (new Set(basis.map(({ axis }) => axis)).size !== 3) {
    // Guards against a degenerate basis silently duplicating a dimension.
    return null;
  }

  // Each new slot inherits the old axis's stored value verbatim, sign included:
  // a relabel is a pure permutation, and other code (see
  // `computeCuboidFaceResizeDelta`) does carry dimension signs, so normalizing
  // to magnitudes here would silently rewrite data the caller didn't ask us to
  // touch. The extent — and so the box — is identical either way.
  const newDimensions = basis.map(
    ({ axis }) => dimensions[axis],
  ) as THREE.Vector3Tuple;

  // The change-of-basis columns are the old-frame directions the new local axes
  // point along, so `quaternion * changeOfBasis` maps new-local coordinates to
  // the same world points as before.
  const changeOfBasis = new THREE.Matrix4().makeBasis(
    toVector(basis[0]),
    toVector(basis[1]),
    toVector(basis[2]),
  );
  const newQuaternion = quaternion
    .clone()
    .multiply(new THREE.Quaternion().setFromRotationMatrix(changeOfBasis))
    .normalize();

  return {
    dimensions: newDimensions,
    quaternion: newQuaternion.toArray() as THREE.Vector4Tuple,
    basis,
  };
};

/**
 * Builds the relabel from an explicit new-X (heading) axis and a chosen "up"
 * axis, keeping that axis's *own* number as its destination slot (Y stays Y,
 * Z stays Z), with a fallback to slot 2 when it's old axis 0 (already
 * claimed by `newX`). Used by {@link computeCuboidHeadingRelabel}, where
 * `up` is inferred from the world-space up vector and the goal is to
 * preserve its role with minimal disruption — NOT by
 * {@link computeCuboidHeadingAndUpRelabel}, where the caller names an
 * explicit destination slot that may differ from `up`'s own old axis number
 * (see {@link buildRelabelFromExplicitSlots}).
 */
const buildRelabelFromAxes = (
  dimensions: THREE.Vector3Tuple,
  quaternion: THREE.Quaternion,
  newX: SignedAxis,
  up: SignedAxis,
): CuboidHeadingRelabel | null => {
  const upSlot: 1 | 2 = up.axis === 0 ? 2 : (up.axis as 1 | 2);
  return buildRelabelFromExplicitSlots(
    dimensions,
    quaternion,
    newX,
    upSlot,
    up,
  );
};

/**
 * Which old local axis currently points most nearly "up" in world space
 * (falling back to world +Z when no real up vector is available — e.g. the
 * DOM annotation sidebar, which has no access to the scene's actual one).
 */
const getCurrentUpAxis = (
  quaternion: THREE.Quaternion,
  upVector?: THREE.Vector3 | null,
): SignedAxis => {
  const effectiveUp =
    upVector && upVector.lengthSq() > EPSILON
      ? upVector.clone().normalize()
      : new THREE.Vector3(0, 0, 1);
  const localUpFace = getCuboidResizeFaceFromNormal(
    effectiveUp.clone().applyQuaternion(quaternion.clone().invert()),
  );
  return (
    localUpFace ? getCuboidResizeFaceAxis(localUpFace) : { axis: 2, sign: 1 }
  ) as SignedAxis;
};

/**
 * Whether `headingFace` and `upFace` could serve as the heading and up faces
 * of the same box — i.e. they aren't on the same axis (parallel or
 * antiparallel). Exposed so the sidebar can disable its Apply button and show
 * a warning without needing dimensions/quaternion.
 */
export function isValidHeadingUpFacePair(
  headingFace: CuboidResizeFace,
  upFace: CuboidResizeFace,
): boolean {
  return (
    getCuboidResizeFaceAxis(headingFace).axis !==
    getCuboidResizeFaceAxis(upFace).axis
  );
}

/**
 * Explicit heading + up relabel for the "Edit heading/up vector" sidebar
 * section: unlike {@link computeCuboidHeadingRelabel} (which only takes a
 * target heading face and infers `up` from the current world-space up
 * vector), this takes both faces directly from the user's picks.
 *
 * `upFace` names a *destination* (slot + sign) — "I want local +Z to be up"
 * — not an old axis to preserve. So it can't be handed to
 * `buildRelabelFromAxes` directly (that function keeps an old axis's *own*
 * number as its destination, which only makes sense when the caller is
 * preserving an inferred role rather than naming a slot). Instead: find
 * whichever old axis is *actually* up right now, then place that old axis at
 * `upFace`'s slot, with a sign chosen so `upFace`'s own sign is what ends up
 * pointing up.
 */
export function computeCuboidHeadingAndUpRelabel({
  dimensions,
  quaternion,
  headingFace,
  upFace,
  upVector,
}: {
  dimensions: THREE.Vector3Tuple;
  quaternion: THREE.Quaternion;
  headingFace: CuboidResizeFace;
  upFace: CuboidResizeFace;
  upVector?: THREE.Vector3 | null;
}): CuboidHeadingRelabel | null {
  if (!dimensions.every((value) => Number.isFinite(value))) {
    return null;
  }

  const newX = getCuboidResizeFaceAxis(headingFace) as SignedAxis;
  const pickedUp = getCuboidResizeFaceAxis(upFace) as SignedAxis;
  const currentUp = getCurrentUpAxis(quaternion, upVector);

  if (currentUp.axis === newX.axis) {
    // Degenerate: heading and "current up" already read as the same old
    // axis (e.g. the box is already nose-up) — there's no distinct old "up"
    // axis left to relabel. Bail rather than guess.
    return null;
  }

  const upSlot = pickedUp.axis as 1 | 2;
  const newUp: SignedAxis = {
    axis: currentUp.axis,
    sign: (currentUp.sign * pickedUp.sign) as AxisSign,
  };

  return buildRelabelFromExplicitSlots(
    dimensions,
    quaternion,
    newX,
    upSlot,
    newUp,
  );
}

export function computeCuboidHeadingRelabel({
  dimensions,
  quaternion,
  targetFace,
  upVector,
}: {
  dimensions: THREE.Vector3Tuple;
  quaternion: THREE.Quaternion;
  targetFace: CuboidResizeFace;
  upVector?: THREE.Vector3 | null;
}): CuboidHeadingRelabel | null {
  if (targetFace === "+x") {
    // Already the heading — nothing to relabel.
    return null;
  }

  if (!dimensions.every((value) => Number.isFinite(value))) {
    return null;
  }

  const newX = getCuboidResizeFaceAxis(targetFace) as SignedAxis;

  // Which local axis currently points most nearly "up" in world space. The
  // relabel tries to preserve this axis's role so the box's up-ness isn't
  // arbitrarily reassigned.
  const currentUp = getCurrentUpAxis(quaternion, upVector);

  // The new heading claims one axis; `up` fills whichever of the remaining
  // two slots it belongs in (see `buildRelabelFromAxes`) — keeping Y as Y /
  // Z as Z wherever possible so dimension labels stay put.
  let up: SignedAxis;

  if (currentUp.axis !== newX.axis) {
    // Up survives the relabel — keep its axis and sign.
    up = currentUp;
  } else if (newX.axis !== 0) {
    // Drone case: the heading consumed the up axis, so the old heading axis
    // (+X) takes over the up role.
    up = { axis: 0, sign: 1 };
  } else {
    // The heading is flipping along the very axis that was up (±x while up is
    // local X). Neither remaining axis was ever "up", so default to Z.
    up = { axis: 2, sign: 1 };
  }

  return buildRelabelFromAxes(dimensions, quaternion, newX, up);
}
