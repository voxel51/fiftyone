import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { fitPerspectiveCameraToBounds } from "./helpers";

function createBoundsCorners(bounds: {
  min: [number, number, number];
  max: [number, number, number];
}) {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;

  return [
    new THREE.Vector3(minX, minY, minZ),
    new THREE.Vector3(minX, minY, maxZ),
    new THREE.Vector3(minX, maxY, minZ),
    new THREE.Vector3(minX, maxY, maxZ),
    new THREE.Vector3(maxX, minY, minZ),
    new THREE.Vector3(maxX, minY, maxZ),
    new THREE.Vector3(maxX, maxY, minZ),
    new THREE.Vector3(maxX, maxY, maxZ),
  ];
}

describe("fitPerspectiveCameraToBounds", () => {
  it("fits every bounds corner inside the frustum while targeting the center", () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    camera.up.set(0, 0, 1);
    const controls = {
      target: new THREE.Vector3(),
      update: vi.fn(),
    };
    const bounds = {
      min: [-4, -1, -0.5] as [number, number, number],
      max: [10, 3, 4] as [number, number, number],
    };
    const center = new THREE.Vector3(3, 1, 1.75);

    fitPerspectiveCameraToBounds(camera, controls, bounds);
    camera.updateMatrixWorld(true);

    expect(controls.target.toArray()).toEqual(center.toArray());
    expect(controls.update).toHaveBeenCalledTimes(1);

    createBoundsCorners(bounds).forEach((corner) => {
      const projectedCorner = corner.clone().project(camera);

      expect(Math.abs(projectedCorner.x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(projectedCorner.y)).toBeLessThanOrEqual(1.0001);
      expect(projectedCorner.z).toBeGreaterThanOrEqual(-1.0001);
      expect(projectedCorner.z).toBeLessThanOrEqual(1.0001);
    });
  });

  it("uses viewport aspect ratio to avoid over-zooming wide scenes", () => {
    const bounds = {
      min: [-20, -2, -1] as [number, number, number],
      max: [20, 2, 1] as [number, number, number],
    };
    const center = new THREE.Vector3(0, 0, 0);
    const squareCamera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    const wideCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 1000);

    squareCamera.up.set(0, 0, 1);
    wideCamera.up.set(0, 0, 1);

    fitPerspectiveCameraToBounds(squareCamera, null, bounds);
    fitPerspectiveCameraToBounds(wideCamera, null, bounds);

    expect(wideCamera.position.distanceTo(center)).toBeLessThan(
      squareCamera.position.distanceTo(center)
    );
  });
});
