import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  getCuboidOrientationMarkerGeometry,
  getCuboidOrientationMarkerProps,
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

  it("anchors on the lowest edge of the forward face relative to the up vector", () => {
    // Default up vector (no upVector passed) is scene Z-up — the lowest
    // candidate edge (most-negative-Z direction) should win.
    const geometry = getCuboidOrientationMarkerGeometry(
      [4, 2, 2],
      new THREE.Quaternion(),
      null,
    );
    expect(geometry).not.toBeNull();
    expect(geometry?.shaftStart).toEqual([2, 0, -1]);
    // baseY (0) is not >= baseZ (-1) in magnitude... |0| < |-1|, so the
    // arrowhead spreads along Z here.
    expect(geometry?.spreadAlongZ).toBe(false);
  });

  it("picks a different lowest edge with a Y-up vector, spreading along Y", () => {
    const geometry = getCuboidOrientationMarkerGeometry(
      [4, 2, 2],
      new THREE.Quaternion(),
      new THREE.Vector3(0, 1, 0),
    );
    expect(geometry).not.toBeNull();
    expect(geometry?.shaftStart).toEqual([2, -1, 0]);
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
