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
  const effectiveUp =
    upVector && upVector.lengthSq() > EPSILON
      ? upVector.clone().normalize()
      : new THREE.Vector3(0, 0, 1);
  const localUpFace = getCuboidResizeFaceFromNormal(
    effectiveUp.clone().applyQuaternion(quaternion.clone().invert()),
  );
  const currentUp = (
    localUpFace ? getCuboidResizeFaceAxis(localUpFace) : { axis: 2, sign: 1 }
  ) as SignedAxis;

  // The new heading claims one axis; the other two fill the Y and Z slots.
  // Pick which of them carries the "up" role, and which slot it sits in
  // (keeping Y as Y / Z as Z wherever possible so dimension labels stay put).
  let up: SignedAxis;
  let upSlot: 1 | 2;

  if (currentUp.axis !== newX.axis) {
    // Up survives the relabel — keep its axis and sign.
    up = currentUp;
    // An up along old X has no prior Y/Z slot, so park it in Z.
    upSlot = currentUp.axis === 0 ? 2 : (currentUp.axis as 1 | 2);
  } else if (newX.axis !== 0) {
    // Drone case: the heading consumed the up axis, so the old heading axis
    // (+X) takes over the up role, parked in Z.
    up = { axis: 0, sign: 1 };
    upSlot = 2;
  } else {
    // The heading is flipping along the very axis that was up (±x while up is
    // local X). Neither remaining axis was ever "up", so keep slot order.
    up = { axis: 2, sign: 1 };
    upSlot = 2;
  }

  const basis: [SignedAxis, SignedAxis, SignedAxis] = [newX, newX, newX];
  basis[upSlot] = up;

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
}
