import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  getCuboidOrientationMarkerGeometry,
  getCuboidOrientationMarkerPropsFromGeometry,
  getHeadingArrowLengthScale,
} from "./cuboid-orientation-geometry";

describe("getCuboidOrientationMarkerGeometry", () => {
  it("returns null when the box has no heading extent", () => {
    expect(getCuboidOrientationMarkerGeometry([0, 2, 2])).toBeNull();
  });

  it("anchors at the center of the forward face", () => {
    const geometry = getCuboidOrientationMarkerGeometry([4, 2, 2]);
    expect(geometry).not.toBeNull();
    expect(geometry?.shaftStart).toEqual([2, 0, 0]);
  });

  it("places the anchor beyond the shaft start by the extension length", () => {
    const geometry = getCuboidOrientationMarkerGeometry([4, 2, 2]);
    expect(geometry).not.toBeNull();
    if (!geometry) return;
    const extensionLength = geometry.anchor.x - geometry.shaftStart[0];
    expect(extensionLength).toBeGreaterThan(0);
    expect(geometry.anchor.y).toBeCloseTo(geometry.shaftStart[1], 6);
    expect(geometry.anchor.z).toBeCloseTo(geometry.shaftStart[2], 6);
  });

  it("produces a positive headLength and headRadius", () => {
    const geometry = getCuboidOrientationMarkerGeometry([4, 2, 2]);
    expect(geometry?.headLength).toBeGreaterThan(0);
    expect(geometry?.headRadius).toBeGreaterThan(0);
  });
});

describe("getCuboidOrientationMarkerPropsFromGeometry", () => {
  it("derives shaftEnd from the decomposed geometry's anchor", () => {
    const decomposed = getCuboidOrientationMarkerGeometry([4, 2, 2]);
    expect(decomposed).not.toBeNull();
    if (!decomposed) return;

    const composed = getCuboidOrientationMarkerPropsFromGeometry(decomposed);
    expect(composed.shaftStart).toEqual(decomposed.shaftStart);
    expect(composed.shaftEnd).toEqual([
      decomposed.anchor.x,
      decomposed.anchor.y,
      decomposed.anchor.z,
    ]);
    expect(composed.headLength).toBe(decomposed.headLength);
    expect(composed.headRadius).toBe(decomposed.headRadius);
  });
});

describe("getHeadingArrowLengthScale", () => {
  it("is the smallest extent, so it can't track a long axis", () => {
    expect(getHeadingArrowLengthScale([4, 2, 6])).toBeCloseTo(2, 6);
    expect(getHeadingArrowLengthScale([40, 2, 6])).toBeCloseTo(2, 6);
  });

  it("ignores zero and non-finite extents rather than collapsing to 0", () => {
    expect(getHeadingArrowLengthScale([4, 0, 6])).toBeCloseTo(4, 6);
    expect(getHeadingArrowLengthScale([4, Number.NaN, 6])).toBeCloseTo(4, 6);
  });

  it("is 0 only when the box has no extent at all", () => {
    expect(getHeadingArrowLengthScale([0, 0, 0])).toBe(0);
  });

  it("is unaffected by which axis is longest", () => {
    // Same multiset of extents, permuted — the scale must not move.
    expect(getHeadingArrowLengthScale([6, 4, 2])).toBeCloseTo(
      getHeadingArrowLengthScale([2, 6, 4]),
      6,
    );
  });
});

describe("arrow length normalization", () => {
  const lengthOf = (dimensions: THREE.Vector3Tuple) => {
    const geometry = getCuboidOrientationMarkerGeometry(dimensions);
    if (!geometry) return null;
    // Shaft overhang past the face, plus the head.
    return geometry.anchor.x - geometry.shaftStart[0] + geometry.headLength;
  };

  it("does not grow when the heading axis gets longer", () => {
    // The whole point: a 4m box and a 40m box with the same cross-section get
    // the same arrow, instead of the long one sprouting a huge one.
    expect(lengthOf([40, 2, 6])).toBeCloseTo(lengthOf([4, 2, 6]) as number, 6);
  });

  it("still scales with the box overall", () => {
    const small = lengthOf([1, 1, 1]) as number;
    const large = lengthOf([10, 10, 10]) as number;
    expect(large).toBeGreaterThan(small);
  });

  it("keeps the anchor on the forward face regardless of the arrow length", () => {
    const geometry = getCuboidOrientationMarkerGeometry([40, 2, 6]);
    // Face position still comes from the heading extent, not the arrow scale.
    expect(geometry?.shaftStart).toEqual([20, 0, 0]);
  });
});
