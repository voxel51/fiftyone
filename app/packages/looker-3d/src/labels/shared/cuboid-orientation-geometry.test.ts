import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  getCuboidOrientationMarkerGeometry,
  getCuboidOrientationMarkerProps,
  getHeadingArrowLengthScale,
} from "./cuboid-orientation-geometry";

describe("getCuboidOrientationMarkerGeometry", () => {
  it("returns null when the box has no heading extent", () => {
    expect(
      getCuboidOrientationMarkerGeometry(
        [0, 2, 2],
        new THREE.Quaternion(),
        null,
      ),
    ).toBeNull();
  });

  it("anchors at the center of the forward face", () => {
    const geometry = getCuboidOrientationMarkerGeometry(
      [4, 2, 2],
      new THREE.Quaternion(),
      null,
    );
    expect(geometry).not.toBeNull();
    expect(geometry?.shaftStart).toEqual([2, 0, 0]);
    // Default up is scene Z-up, so local Z is the vertical axis and the flat
    // head spreads across Y to stay readable from above.
    expect(geometry?.spreadAlongZ).toBe(false);
  });

  it("spreads the head across the other axis with a Y-up vector", () => {
    const geometry = getCuboidOrientationMarkerGeometry(
      [4, 2, 2],
      new THREE.Quaternion(),
      new THREE.Vector3(0, 1, 0),
    );
    expect(geometry).not.toBeNull();
    // The anchor stays at the face center regardless of which way is up.
    expect(geometry?.shaftStart).toEqual([2, 0, 0]);
    expect(geometry?.spreadAlongZ).toBe(true);
  });

  it("places the anchor beyond the shaft start by the extension length", () => {
    const geometry = getCuboidOrientationMarkerGeometry(
      [4, 2, 2],
      new THREE.Quaternion(),
      null,
    );
    expect(geometry).not.toBeNull();
    if (!geometry) return;
    const extensionLength = geometry.anchor.x - geometry.shaftStart[0];
    expect(extensionLength).toBeGreaterThan(0);
    expect(geometry.anchor.y).toBeCloseTo(geometry.shaftStart[1], 6);
    expect(geometry.anchor.z).toBeCloseTo(geometry.shaftStart[2], 6);
  });

  it("produces a positive headLength and headHalfWidth", () => {
    const geometry = getCuboidOrientationMarkerGeometry(
      [4, 2, 2],
      new THREE.Quaternion(),
      null,
    );
    expect(geometry?.headLength).toBeGreaterThan(0);
    expect(geometry?.headHalfWidth).toBeGreaterThan(0);
  });
});

describe("getCuboidOrientationMarkerProps", () => {
  it("returns null when the box has no heading extent", () => {
    expect(
      getCuboidOrientationMarkerProps([0, 2, 2], new THREE.Quaternion(), null),
    ).toBeNull();
  });

  it("derives shaftEnd/headVertices consistently from the decomposed geometry", () => {
    const decomposed = getCuboidOrientationMarkerGeometry(
      [4, 2, 2],
      new THREE.Quaternion(),
      null,
    );
    const composed = getCuboidOrientationMarkerProps(
      [4, 2, 2],
      new THREE.Quaternion(),
      null,
    );
    expect(decomposed).not.toBeNull();
    expect(composed).not.toBeNull();
    if (!decomposed || !composed) return;

    expect(composed.shaftStart).toEqual(decomposed.shaftStart);
    expect(composed.shaftEnd).toEqual([
      decomposed.anchor.x,
      decomposed.anchor.y,
      decomposed.anchor.z,
    ]);

    // The apex sits headLength further along X than the anchor, at the
    // same Y/Z.
    const [apex] = composed.headVertices;
    expect(apex[0] - decomposed.anchor.x).toBeCloseTo(decomposed.headLength, 6);
    expect(apex[1]).toBeCloseTo(decomposed.anchor.y, 6);
    expect(apex[2]).toBeCloseTo(decomposed.anchor.z, 6);

    // The base corners straddle the anchor by ±headHalfWidth along whichever
    // axis spreadAlongZ selects.
    const [, base1, base2] = composed.headVertices;
    const spreadAxis = decomposed.spreadAlongZ ? 2 : 1;
    expect(
      base1[spreadAxis] - decomposed.anchor.getComponent(spreadAxis),
    ).toBeCloseTo(decomposed.headHalfWidth, 6);
    expect(
      base2[spreadAxis] - decomposed.anchor.getComponent(spreadAxis),
    ).toBeCloseTo(-decomposed.headHalfWidth, 6);
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
    const geometry = getCuboidOrientationMarkerGeometry(
      dimensions,
      new THREE.Quaternion(),
      null,
    );
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
    const geometry = getCuboidOrientationMarkerGeometry(
      [40, 2, 6],
      new THREE.Quaternion(),
      null,
    );
    // Face position still comes from the heading extent, not the arrow scale.
    expect(geometry?.shaftStart).toEqual([20, 0, 0]);
  });
});
