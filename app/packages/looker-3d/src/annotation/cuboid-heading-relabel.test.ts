import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CUBOID_RESIZE_FACES,
  getCuboidResizeFaceFromNormal,
  type CuboidResizeFace,
} from "./cuboid-face-resize";
import {
  computeCuboidHeadingAndUpRelabel,
  computeCuboidHeadingRelabel,
  getCuboidUpFace,
  isValidHeadingUpFacePair,
} from "./cuboid-heading-relabel";

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

/** Which old-frame face currently reads as "up" for a given orientation. */
const currentUpFaceOf = (
  quaternion: THREE.Quaternion,
  upVector: THREE.Vector3 = new THREE.Vector3(0, 0, 1),
): CuboidResizeFace | null => {
  const localUp = upVector.clone().applyQuaternion(quaternion.clone().invert());
  return getCuboidResizeFaceFromNormal(localUp);
};

const UP_FACES = ["+y", "-y", "+z", "-z"] as const;

describe("computeCuboidHeadingAndUpRelabel", () => {
  it("returns null for non-finite dimensions", () => {
    expect(
      computeCuboidHeadingAndUpRelabel({
        dimensions: [4, Number.NaN, 6],
        quaternion: new THREE.Quaternion(),
        headingFace: "+x",
        upFace: "+y",
      }),
    ).toBeNull();
  });

  it.each(UP_FACES)(
    // Regression coverage for a dead end: with the box tipped nose-up the
    // heading itself is the axis closest to world up, and deriving "current
    // up" across all three axes returned ±x — not one of the four
    // selectable faces. The picker highlighted nothing and every click was
    // a silent no-op, escapable only by moving the heading off vertical.
    "resolves %s even when the heading itself points straight up",
    (upFace) => {
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
      );
      // The all-axes reading that caused the dead end.
      expect(currentUpFaceOf(quaternion)).toMatch(/^[+-]x$/);
      // The heading-aware reading still lands on a selectable face.
      expect(UP_FACES).toContain(getCuboidUpFace(quaternion, "+x"));

      const result = computeCuboidHeadingAndUpRelabel({
        dimensions: DIMENSIONS,
        quaternion,
        headingFace: "+x",
        upFace,
      });

      expect(result).not.toBeNull();
      if (!result) return;

      // Still a pure relabel — the box itself must not move.
      const before = worldCorners(DIMENSIONS, quaternion);
      const after = worldCorners(
        result.dimensions,
        new THREE.Quaternion(...result.quaternion),
      );
      expect(sortedCornerKeys(after)).toEqual(sortedCornerKeys(before));
    },
  );

  it("always resolves to a selectable face, at every pitch", () => {
    // The old all-axes reading returned an unselectable ±x whenever the
    // heading was the most up-pointing axis, which is what stranded the
    // picker. Sweep the full pitch range — including dead vertical, where
    // world up says nothing about the remaining axes — and assert there is
    // no orientation without an answer.
    for (let degrees = -180; degrees <= 180; degrees += 5) {
      const quaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        THREE.MathUtils.degToRad(degrees),
      );
      expect(UP_FACES).toContain(getCuboidUpFace(quaternion, "+x"));
    }
  });

  it("still resolves a selectable up face when the heading is steeply pitched but not vertical", () => {
    // 80° nose-up: the old all-axes reading returned ±x here (the heading is
    // the most vertical axis), stranding the picker even though +z still has
    // a real up component. This is the class the fix actually recovers.
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(-80),
    );
    expect(currentUpFaceOf(quaternion)).toMatch(/^[+-]x$/);
    expect(getCuboidUpFace(quaternion, "+x")).toBe("+z");

    const result = computeCuboidHeadingAndUpRelabel({
      dimensions: DIMENSIONS,
      quaternion,
      headingFace: "+x",
      upFace: "+y",
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(
      getCuboidUpFace(new THREE.Quaternion(...result.quaternion), "+x"),
    ).toBe("+y");
  });

  describe.each(ORIENTATIONS)("from %s", (_label, quaternion) => {
    it.each(UP_FACES)(
      // Regression coverage for a real bug: the old implementation reused a
      // helper built for the drag case, which only knows how to keep an old
      // axis's *own* number as its destination — it never looked at which
      // axis was actually up. Clicking "+Y" or "+Z" was silently a no-op,
      // and "-Y"/"-Z" both produced the identical 180°-about-heading flip.
      "results in %s reading as up after the click, regardless of the starting orientation",
      (upFace) => {
        const result = computeCuboidHeadingAndUpRelabel({
          dimensions: DIMENSIONS,
          quaternion,
          headingFace: "+x",
          upFace,
        });

        expect(result).not.toBeNull();
        if (!result) return;

        const nextQuaternion = new THREE.Quaternion(...result.quaternion);
        expect(getCuboidUpFace(nextQuaternion, "+x")).toBe(upFace);
      },
    );

    it.each(UP_FACES)(
      "leaves the box's world corners unchanged when picking %s as up",
      (upFace) => {
        const result = computeCuboidHeadingAndUpRelabel({
          dimensions: DIMENSIONS,
          quaternion,
          headingFace: "+x",
          upFace,
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

    it.each(UP_FACES)(
      "produces a right-handed basis (no mirroring) when picking %s as up",
      (upFace) => {
        const result = computeCuboidHeadingAndUpRelabel({
          dimensions: DIMENSIONS,
          quaternion,
          headingFace: "+x",
          upFace,
        });

        expect(result).not.toBeNull();
        if (!result) return;

        const [x, y, z] = result.basis.map(({ axis, sign }) =>
          new THREE.Vector3().setComponent(axis, sign),
        );
        expect(new THREE.Vector3().crossVectors(x, y).dot(z)).toBeCloseTo(1, 6);
      },
    );
  });

  it("is a no-op when picking the face that's already up", () => {
    // Identity + Z-up: +Z is already up, so clicking "+z" shouldn't change
    // anything — a real symptom of the bug was clicking the current face and
    // getting a spurious flip.
    const quaternion = new THREE.Quaternion();
    const result = computeCuboidHeadingAndUpRelabel({
      dimensions: DIMENSIONS,
      quaternion,
      headingFace: "+x",
      upFace: "+z",
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.quaternion[0]).toBeCloseTo(0, 6);
    expect(result.quaternion[1]).toBeCloseTo(0, 6);
    expect(result.quaternion[2]).toBeCloseTo(0, 6);
    expect(result.quaternion[3]).toBeCloseTo(1, 6);
    expect(result.dimensions).toEqual(DIMENSIONS);
  });

  it("flipping to the opposite sign of the current up face only flips that axis pair", () => {
    // Identity + Z-up, already up via +Z; picking "-z" should tip the box
    // over (Z and Y both flip sign) rather than reproducing a Y-axis result.
    const quaternion = new THREE.Quaternion();
    const result = computeCuboidHeadingAndUpRelabel({
      dimensions: DIMENSIONS,
      quaternion,
      headingFace: "+x",
      upFace: "-z",
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.basis).toEqual([
      { axis: 0, sign: 1 },
      { axis: 1, sign: -1 },
      { axis: 2, sign: -1 },
    ]);
  });

  it("uses the real up vector instead of the Z-up fallback when supplied", () => {
    // Y-up orientation: rotate -90deg about X so old +Y maps to world +Z.
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -Math.PI / 2,
    );
    const upVector = new THREE.Vector3(0, 0, 1);
    expect(currentUpFaceOf(quaternion, upVector)).not.toBeNull();

    const result = computeCuboidHeadingAndUpRelabel({
      dimensions: DIMENSIONS,
      quaternion,
      headingFace: "+x",
      upFace: "+z",
      upVector,
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(
      currentUpFaceOf(new THREE.Quaternion(...result.quaternion), upVector),
    ).toBe("+z");
  });
});

describe("isValidHeadingUpFacePair", () => {
  it("is true when heading and up are on different axes", () => {
    expect(isValidHeadingUpFacePair("+x", "+y")).toBe(true);
    expect(isValidHeadingUpFacePair("+x", "-z")).toBe(true);
  });

  it("is false when heading and up share an axis, regardless of sign", () => {
    expect(isValidHeadingUpFacePair("+x", "+x")).toBe(false);
    expect(isValidHeadingUpFacePair("+x", "-x")).toBe(false);
  });
});
