import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  formatMeasurementDistance,
  measurementDistance,
  nextMeasurementState,
  pointsPickThreshold,
} from "./measurement";
import { pickScenePoint } from "./MeasurementLayer";
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
    expect(measurementDistance({ a: [1, 2, 3], b: [4, 6, 3] })).toBeCloseTo(5);
  });

  it("formats with scale-appropriate precision", () => {
    expect(formatMeasurementDistance(5)).toBe("5.00 m");
    expect(formatMeasurementDistance(12.345)).toBe("12.35 m");
    expect(formatMeasurementDistance(123.45)).toBe("123.5 m");
  });

  it("scales the point snap radius with camera distance, clamped", () => {
    expect(pointsPickThreshold(10)).toBeCloseTo(0.08);
    expect(pointsPickThreshold(1)).toBeCloseTo(0.05);
    expect(pointsPickThreshold(1000)).toBeCloseTo(0.8);
    expect(pointsPickThreshold(Number.NaN)).toBeCloseTo(0.25);
  });
});

describe("pickScenePoint", () => {
  function lookDownScene() {
    // Camera 20m above the origin looking straight down at a small
    // point cloud on the ground plane.
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const scene = new THREE.Scene();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 5, 0, 0, 0, 5, 0], 3),
    );
    const points = new THREE.Points(geometry, new THREE.PointsMaterial());
    scene.add(points);
    scene.updateMatrixWorld(true);
    return { camera, scene };
  }

  it("picks the lidar return under the ray", () => {
    const { camera, scene } = lookDownScene();
    const hit = pickScenePoint({
      camera,
      ndc: new THREE.Vector2(0, 0),
      raycaster: new THREE.Raycaster(),
      scene,
    });
    const point = requireHit(hit);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(0);
  });

  it("returns null when the ray misses everything", () => {
    const { camera, scene } = lookDownScene();
    const hit = pickScenePoint({
      camera,
      ndc: new THREE.Vector2(0.9, 0.9),
      raycaster: new THREE.Raycaster(),
      scene,
    });
    expect(hit).toBeNull();
  });

  it("ignores the measurement overlay's own objects", () => {
    const { camera, scene } = lookDownScene();
    const overlay = new THREE.Group();
    overlay.userData.isMeasurementOverlay = true;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(2, 8, 8),
      new THREE.MeshBasicMaterial(),
    );
    marker.position.set(0, 0, 10);
    overlay.add(marker);
    scene.add(overlay);
    scene.updateMatrixWorld(true);

    const hit = pickScenePoint({
      camera,
      ndc: new THREE.Vector2(0, 0),
      raycaster: new THREE.Raycaster(),
      scene,
    });
    // The marker hovers between camera and cloud but must not be picked.
    expect(requireHit(hit).z).toBeCloseTo(0);
  });

  it("picks mesh surfaces such as the ground plane", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const scene = new THREE.Scene();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshBasicMaterial(),
    );
    scene.add(plane);
    scene.updateMatrixWorld(true);

    const hit = pickScenePoint({
      camera,
      ndc: new THREE.Vector2(0.2, 0.2),
      raycaster: new THREE.Raycaster(),
      scene,
    });
    expect(requireHit(hit).z).toBeCloseTo(0);
  });
});
