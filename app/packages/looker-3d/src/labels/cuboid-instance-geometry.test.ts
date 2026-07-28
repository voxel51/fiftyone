import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { ReconciledDetection3D } from "../annotation/types";
import {
  computeArrowheadMatrix,
  computeBodyMatrix,
  computeBoxEdgePositions,
  EDGES_PER_BOX,
  resolveCuboidGeometry,
  segmentsPerBoxFor,
} from "./cuboid-instance-geometry";

function createLabel(
  overrides: Partial<ReconciledDetection3D> = {},
): ReconciledDetection3D {
  return {
    _id: "label-1",
    _cls: "Detection",
    path: "ground_truth",
    location: [1, 2, 3],
    dimensions: [4, 5, 6],
    ...overrides,
  } as unknown as ReconciledDetection3D;
}

describe("resolveCuboidGeometry", () => {
  it("uses the label's own position and dimensions unchanged", () => {
    const label = createLabel({ location: [1, 2, 3], dimensions: [4, 5, 6] });
    const geometry = resolveCuboidGeometry(label, false, [0, 0, 0]);
    expect(geometry.position).toEqual([1, 2, 3]);
    expect(geometry.dimensions).toEqual([4, 5, 6]);
  });

  it("offsets Y downward by half the height in legacy coordinates", () => {
    const label = createLabel({ location: [1, 10, 3], dimensions: [4, 6, 8] });
    const geometry = resolveCuboidGeometry(label, true, [0, 0, 0]);
    expect(geometry.position).toEqual([1, 7, 3]);
  });

  it("does not offset Y when not using legacy coordinates", () => {
    const label = createLabel({ location: [1, 10, 3], dimensions: [4, 6, 8] });
    const geometry = resolveCuboidGeometry(label, false, [0, 0, 0]);
    expect(geometry.position).toEqual([1, 10, 3]);
  });

  it("prefers an explicit quaternion over rotation", () => {
    const explicitQuaternion = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(0.1, 0.2, 0.3))
      .toArray() as [number, number, number, number];
    const label = createLabel({
      rotation: [1, 1, 1], // deliberately different, should be ignored
      quaternion: explicitQuaternion,
    });
    const geometry = resolveCuboidGeometry(label, false, [0, 0, 0]);
    expect(geometry.quaternion.toArray()).toEqual(explicitQuaternion);
  });

  it("falls back to the label's own rotation when no quaternion is present", () => {
    const label = createLabel({ rotation: [0, Math.PI / 2, 0] });
    const geometry = resolveCuboidGeometry(label, false, [0, 0, 0]);
    const expected = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, Math.PI / 2, 0),
    );
    expect(geometry.quaternion.angleTo(expected)).toBeCloseTo(0, 6);
  });

  it("falls back to overlayRotationFallback when the label has neither rotation nor quaternion", () => {
    const label = createLabel({ rotation: undefined, quaternion: undefined });
    const fallback: THREE.Vector3Tuple = [0, Math.PI, 0];
    const geometry = resolveCuboidGeometry(label, false, fallback);
    const expected = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...fallback),
    );
    expect(geometry.quaternion.angleTo(expected)).toBeCloseTo(0, 6);
  });
});

describe("computeBodyMatrix", () => {
  it("composes position, rotation, and dimensions-as-scale", () => {
    const geometry = {
      position: [1, 2, 3] as THREE.Vector3Tuple,
      dimensions: [4, 5, 6] as THREE.Vector3Tuple,
      quaternion: new THREE.Quaternion(),
    };
    const matrix = computeBodyMatrix(geometry);

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);

    expect(position.toArray()).toEqual([1, 2, 3]);
    expect(scale.toArray()).toEqual([4, 5, 6]);
    expect(quaternion.equals(new THREE.Quaternion())).toBe(true);
  });
});

describe("computeBoxEdgePositions", () => {
  it("produces 12 edges (72 floats) for a box", () => {
    const geometry = {
      position: [0, 0, 0] as THREE.Vector3Tuple,
      dimensions: [2, 2, 2] as THREE.Vector3Tuple,
      quaternion: new THREE.Quaternion(),
    };
    const positions = computeBoxEdgePositions(geometry);
    expect(positions.length).toBe(EDGES_PER_BOX * 6);
  });

  it("offsets edge positions by the box's world position", () => {
    const centered = computeBoxEdgePositions({
      position: [0, 0, 0],
      dimensions: [2, 2, 2],
      quaternion: new THREE.Quaternion(),
    });
    const translated = computeBoxEdgePositions({
      position: [10, 0, 0],
      dimensions: [2, 2, 2],
      quaternion: new THREE.Quaternion(),
    });

    for (let i = 0; i < centered.length; i += 3) {
      expect(translated[i]).toBeCloseTo(centered[i] + 10, 6);
      expect(translated[i + 1]).toBeCloseTo(centered[i + 1], 6);
      expect(translated[i + 2]).toBeCloseTo(centered[i + 2], 6);
    }
  });
});

describe("computeArrowheadMatrix", () => {
  it("returns a zero-scale matrix when the box has no valid heading extent", () => {
    const geometry = {
      position: [0, 0, 0] as THREE.Vector3Tuple,
      dimensions: [0, 5, 5] as THREE.Vector3Tuple,
      quaternion: new THREE.Quaternion(),
    };
    const matrix = computeArrowheadMatrix(geometry, null);

    // A degenerate all-zero-scale matrix reads back as scale (1,1,1) via
    // Matrix4.decompose() (three.js falls back to 1 when a basis column has
    // zero length, to avoid dividing by it) — check the diagonal elements
    // directly instead.
    expect([
      matrix.elements[0],
      matrix.elements[5],
      matrix.elements[10],
    ]).toEqual([0, 0, 0]);
  });

  it("returns a non-degenerate matrix for a box with a valid heading extent", () => {
    const geometry = {
      position: [0, 0, 0] as THREE.Vector3Tuple,
      dimensions: [4, 2, 2] as THREE.Vector3Tuple,
      quaternion: new THREE.Quaternion(),
    };
    const matrix = computeArrowheadMatrix(geometry, null);

    const scale = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.x).toBeGreaterThan(0);
    expect(scale.y).toBeGreaterThan(0);
    expect(scale.z).toBeGreaterThan(0);
  });

  it("translates the arrowhead matrix along with the box's own position", () => {
    const dimensions: THREE.Vector3Tuple = [4, 2, 2];
    const quaternion = new THREE.Quaternion();
    const atOrigin = computeArrowheadMatrix(
      { position: [0, 0, 0], dimensions, quaternion },
      null,
    );
    const translated = computeArrowheadMatrix(
      { position: [5, 0, 0], dimensions, quaternion },
      null,
    );

    const originPos = new THREE.Vector3();
    atOrigin.decompose(originPos, new THREE.Quaternion(), new THREE.Vector3());
    const translatedPos = new THREE.Vector3();
    translated.decompose(
      translatedPos,
      new THREE.Quaternion(),
      new THREE.Vector3(),
    );

    expect(translatedPos.x - originPos.x).toBeCloseTo(5, 6);
  });
});

describe("segmentsPerBoxFor", () => {
  it("is just the 12 outline edges when orientation markers are off", () => {
    expect(segmentsPerBoxFor(false)).toBe(12);
  });

  it("adds the shaft + 3 axes segments when orientation markers are on", () => {
    expect(segmentsPerBoxFor(true)).toBe(12 + 1 + 3);
  });
});
