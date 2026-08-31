import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createScreenSpaceLineRaycast } from "./screen-space-line-raycast";

const VIEWPORT_HEIGHT_PX = 1000;

describe("createScreenSpaceLineRaycast", () => {
  it("keeps a two-pixel perspective tolerance across distance", () => {
    for (const distance of [10, 40]) {
      const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      const line = pickableLine();

      expect(intersectionsAtPixelOffset(line, camera, 1)).toHaveLength(1);
      expect(intersectionsAtPixelOffset(line, camera, 4)).toHaveLength(0);
    }
  });

  it("keeps the tolerance in screen space for an orthographic view", () => {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    camera.zoom = 2;
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const line = pickableLine();

    expect(intersectionsAtPixelOffset(line, camera, 1)).toHaveLength(1);
    expect(intersectionsAtPixelOffset(line, camera, 4)).toHaveLength(0);
  });
});

function pickableLine(): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0),
  ]);
  const line = new THREE.LineSegments(geometry);
  line.raycast = createScreenSpaceLineRaycast(VIEWPORT_HEIGHT_PX);
  line.updateMatrixWorld(true);
  return line;
}

function intersectionsAtPixelOffset(
  line: THREE.LineSegments,
  camera: THREE.Camera,
  offsetPx: number,
): THREE.Intersection[] {
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 0.75;
  raycaster.setFromCamera(
    new THREE.Vector2(0, (offsetPx / VIEWPORT_HEIGHT_PX) * 2),
    camera,
  );
  const intersections = raycaster.intersectObject(line);
  expect(raycaster.params.Line.threshold).toBe(0.75);
  return intersections;
}
