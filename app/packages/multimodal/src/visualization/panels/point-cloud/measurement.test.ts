import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  formatMeasurementDistance,
  measurementDistance,
  nextMeasurementState,
} from "./measurement";
import {
  pickGridPlanePoint,
  previewDottedLinePositions,
} from "./MeasurementLayer";
import type * as ThreeTypes from "three";

function requireHit(hit: ThreeTypes.Vector3 | null): ThreeTypes.Vector3 {
  expect(hit).not.toBeNull();
  if (!hit) throw new Error("expected a pick");
  return hit;
}

describe("measurement state machine", () => {
  it("anchors, completes, then restarts on the third pick", () => {
    const first = nextMeasurementState(null, [1, 2, 3]);
    expect(first).toEqual({ a: [1, 2, 3], b: null });

    const complete = nextMeasurementState(first, [4, 6, 3]);
    expect(complete).toEqual({ a: [1, 2, 3], b: [4, 6, 3] });

    const restarted = nextMeasurementState(complete, [9, 9, 9]);
    expect(restarted).toEqual({ a: [9, 9, 9], b: null });
  });

  it("measures only complete pairs", () => {
    expect(measurementDistance(null)).toBeNull();
    expect(measurementDistance({ a: [0, 0, 0], b: null })).toBeNull();
    expect(measurementDistance({ a: [1, 2, 0], b: [4, 6, 0] })).toBeCloseTo(5);
  });

  it("ignores the configured up-axis component", () => {
    expect(
      measurementDistance({ a: [100, 1, 2], b: [-100, 4, 6] }, "x"),
    ).toBeCloseTo(5);
  });

  it("formats with scale-appropriate precision", () => {
    expect(formatMeasurementDistance(5)).toBe("5.00 m");
    expect(formatMeasurementDistance(12.345)).toBe("12.35 m");
    expect(formatMeasurementDistance(123.45)).toBe("123.5 m");
  });
});

describe("pickGridPlanePoint", () => {
  function lookAtOriginCamera(position: readonly [number, number, number]) {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(...position);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
  }

  it("picks the z-up grid plane under the ray", () => {
    const camera = lookAtOriginCamera([0, 0, 20]);
    const hit = pickGridPlanePoint({
      camera,
      ndc: new THREE.Vector2(0, 0),
      planeUp: "z",
      raycaster: new THREE.Raycaster(),
    });
    const point = requireHit(hit);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(0);
  });

  it("uses the configured up axis for the grid plane", () => {
    const camera = lookAtOriginCamera([20, 0, 0]);
    const hit = pickGridPlanePoint({
      camera,
      ndc: new THREE.Vector2(0.25, -0.2),
      planeUp: "x",
      raycaster: new THREE.Raycaster(),
    });
    const point = requireHit(hit);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).not.toBeCloseTo(0);
    expect(point.z).not.toBeCloseTo(0);
  });

  it("returns null when the camera ray is parallel to the grid plane", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 20);
    camera.lookAt(1, 0, 20);
    camera.updateMatrixWorld();
    const hit = pickGridPlanePoint({
      camera,
      ndc: new THREE.Vector2(0, 0),
      planeUp: "z",
      raycaster: new THREE.Raycaster(),
    });
    expect(hit).toBeNull();
  });

  it("ignores scene geometry by construction", () => {
    const camera = lookAtOriginCamera([0, 0, 20]);
    const hit = pickGridPlanePoint({
      camera,
      ndc: new THREE.Vector2(0.2, 0.2),
      planeUp: "z",
      raycaster: new THREE.Raycaster(),
    });
    // The helper has no scene input: clicks project to z=0 instead of
    // snapping to point-cloud returns or annotation meshes.
    expect(requireHit(hit).z).toBeCloseTo(0);
  });
});

describe("previewDottedLinePositions", () => {
  it("creates dotted positions from anchor to hover point", () => {
    const positions = previewDottedLinePositions([0, 0, 0], [2, 0, 0]);
    expect(positions).not.toBeNull();
    expect(Array.from(positions?.slice(0, 3) ?? [])).toEqual([0, 0, 0]);
    expect(Array.from(positions?.slice(-3) ?? [])).toEqual([2, 0, 0]);
    expect((positions?.length ?? 0) / 3).toBeGreaterThan(2);
  });

  it("skips degenerate preview lines", () => {
    expect(previewDottedLinePositions([1, 1, 0], [1, 1, 0])).toBeNull();
  });
});
