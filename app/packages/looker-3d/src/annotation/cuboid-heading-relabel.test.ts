import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CUBOID_RESIZE_FACES } from "./cuboid-face-resize";
import { computeCuboidHeadingRelabel } from "./cuboid-heading-relabel";

const DIMENSIONS: THREE.Vector3Tuple = [4, 2, 6];
const LOCATION = new THREE.Vector3(10, -3, 7);

/**
 * The box's eight world-space corners, which a heading relabel must leave
 * exactly where they were — that's what "the box doesn't move" means.
 */
const worldCorners = (
  dimensions: THREE.Vector3Tuple,
  quaternion: THREE.Quaternion,
) => {
  const corners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(
          new THREE.Vector3(
            (sx * dimensions[0]) / 2,
            (sy * dimensions[1]) / 2,
            (sz * dimensions[2]) / 2,
          )
            .applyQuaternion(quaternion)
            .add(LOCATION),
        );
      }
    }
  }
  return corners;
};

/** Corner sets are order-independent, so compare them as sorted point lists. */
const sortedCornerKeys = (corners: THREE.Vector3[]) =>
  corners
    .map((c) => `${c.x.toFixed(6)},${c.y.toFixed(6)},${c.z.toFixed(6)}`)
    .sort();

const ORIENTATIONS: [string, THREE.Quaternion][] = [
  ["identity", new THREE.Quaternion()],
  [
    "yawed 37deg about Z",
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      THREE.MathUtils.degToRad(37),
    ),
  ],
  [
    "tilted so heading already points up",
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
    ),
  ],
  [
    "arbitrary compound rotation",
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -1.1, 2.3, "XYZ")),
  ],
];

const NON_TRIVIAL_FACES = CUBOID_RESIZE_FACES.filter((f) => f !== "+x");

describe("computeCuboidHeadingRelabel", () => {
  it("returns null for the face that is already the heading", () => {
    expect(
      computeCuboidHeadingRelabel({
        dimensions: DIMENSIONS,
        quaternion: new THREE.Quaternion(),
        targetFace: "+x",
        upVector: new THREE.Vector3(0, 0, 1),
      }),
    ).toBeNull();
  });

  it("returns null for non-finite dimensions", () => {
    expect(
      computeCuboidHeadingRelabel({
        dimensions: [4, Number.NaN, 6],
        quaternion: new THREE.Quaternion(),
        targetFace: "+y",
        upVector: new THREE.Vector3(0, 0, 1),
      }),
    ).toBeNull();
  });

  describe.each(ORIENTATIONS)("from %s", (_label, quaternion) => {
    it.each(NON_TRIVIAL_FACES)(
      "leaves the box's world corners unchanged when relabeling to %s",
      (targetFace) => {
        const result = computeCuboidHeadingRelabel({
          dimensions: DIMENSIONS,
          quaternion,
          targetFace,
          upVector: new THREE.Vector3(0, 0, 1),
        });

        expect(result).not.toBeNull();
        if (!result) return;

        const before = worldCorners(DIMENSIONS, quaternion);
        const after = worldCorners(
          result.dimensions,
          new THREE.Quaternion(...result.quaternion),
        );

        expect(sortedCornerKeys(after)).toEqual(sortedCornerKeys(before));
      },
    );

    it.each(NON_TRIVIAL_FACES)(
      "points the new heading (+X) out of the %s face's old direction",
      (targetFace) => {
        const result = computeCuboidHeadingRelabel({
          dimensions: DIMENSIONS,
          quaternion,
          targetFace,
          upVector: new THREE.Vector3(0, 0, 1),
        });

        expect(result).not.toBeNull();
        if (!result) return;

        // The world direction the dragged-to face pointed before the relabel...
        const sign = targetFace.startsWith("-") ? -1 : 1;
        const axisIndex = { x: 0, y: 1, z: 2 }[
          targetFace[1] as "x" | "y" | "z"
        ];
        const expected = new THREE.Vector3()
          .setComponent(axisIndex, sign)
          .applyQuaternion(quaternion);

        // ...must be where the new heading (+X) now points.
        const actual = new THREE.Vector3(1, 0, 0).applyQuaternion(
          new THREE.Quaternion(...result.quaternion),
        );

        expect(actual.x).toBeCloseTo(expected.x, 6);
        expect(actual.y).toBeCloseTo(expected.y, 6);
        expect(actual.z).toBeCloseTo(expected.z, 6);
      },
    );

    it.each(NON_TRIVIAL_FACES)(
      "produces a right-handed basis (no mirroring) for %s",
      (targetFace) => {
        const result = computeCuboidHeadingRelabel({
          dimensions: DIMENSIONS,
          quaternion,
          targetFace,
          upVector: new THREE.Vector3(0, 0, 1),
        });

        expect(result).not.toBeNull();
        if (!result) return;

        const [x, y, z] = result.basis.map(({ axis, sign }) =>
          new THREE.Vector3().setComponent(axis, sign),
        );
        // det == +1 for a proper rotation; -1 would mean a reflection.
        expect(new THREE.Vector3().crossVectors(x, y).dot(z)).toBeCloseTo(1, 6);
      },
    );

    it.each(NON_TRIVIAL_FACES)(
      "permutes dimensions so each new slot carries its axis's extent for %s",
      (targetFace) => {
        const result = computeCuboidHeadingRelabel({
          dimensions: DIMENSIONS,
          quaternion,
          targetFace,
          upVector: new THREE.Vector3(0, 0, 1),
        });

        expect(result).not.toBeNull();
        if (!result) return;

        result.basis.forEach(({ axis }, slot) => {
          expect(result.dimensions[slot]).toBeCloseTo(
            Math.abs(DIMENSIONS[axis]),
            6,
          );
        });
        // A relabel is a permutation, so the multiset of extents is preserved.
        expect([...result.dimensions].sort()).toEqual([...DIMENSIONS].sort());
      },
    );
  });

  describe("drone case (heading consumes the up axis)", () => {
    // Identity orientation with Z-up: local +Z is up, so dragging the heading
    // onto the +z/-z face consumes the up axis.
    const quaternion = new THREE.Quaternion();
    const upVector = new THREE.Vector3(0, 0, 1);

    it.each(["+z", "-z"] as const)(
      "hands the up role to the old heading axis for %s",
      (targetFace) => {
        const result = computeCuboidHeadingRelabel({
          dimensions: DIMENSIONS,
          quaternion,
          targetFace,
          upVector,
        });

        expect(result).not.toBeNull();
        if (!result) return;

        // The old heading axis (old local X, index 0) becomes the new up-ish
        // axis, parked in the Z slot.
        expect(result.basis[2].axis).toBe(0);
      },
    );

    it.each(["+z", "-z"] as const)(
      "still preserves the box's world corners for %s",
      (targetFace) => {
        const result = computeCuboidHeadingRelabel({
          dimensions: DIMENSIONS,
          quaternion,
          targetFace,
          upVector,
        });

        expect(result).not.toBeNull();
        if (!result) return;

        expect(
          sortedCornerKeys(
            worldCorners(
              result.dimensions,
              new THREE.Quaternion(...result.quaternion),
            ),
          ),
        ).toEqual(sortedCornerKeys(worldCorners(DIMENSIONS, quaternion)));
      },
    );
  });

  it("preserves the up axis's role when the heading does not consume it", () => {
    // Identity + Z-up: local +Z is up. Relabeling to +y must leave Z as up.
    const result = computeCuboidHeadingRelabel({
      dimensions: DIMENSIONS,
      quaternion: new THREE.Quaternion(),
      targetFace: "+y",
      upVector: new THREE.Vector3(0, 0, 1),
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.basis[2]).toEqual({ axis: 2, sign: 1 });
  });

  it("falls back to Z-up when no up vector is supplied", () => {
    const withoutUp = computeCuboidHeadingRelabel({
      dimensions: DIMENSIONS,
      quaternion: new THREE.Quaternion(),
      targetFace: "+y",
    });
    const withZUp = computeCuboidHeadingRelabel({
      dimensions: DIMENSIONS,
      quaternion: new THREE.Quaternion(),
      targetFace: "+y",
      upVector: new THREE.Vector3(0, 0, 1),
    });

    expect(withoutUp).toEqual(withZUp);
  });
});
