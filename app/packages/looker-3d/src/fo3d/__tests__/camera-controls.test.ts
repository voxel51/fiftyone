import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  setCameraControlsLookAt,
  setCameraControlsPosition,
  type Fo3dCameraControls,
} from "../camera-controls";

const makeCamera = (position: [number, number, number]) => {
  const camera = new PerspectiveCamera();
  camera.position.set(...position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  return camera;
};

const makeControls = (target: [number, number, number]) => {
  return {
    target: new Vector3(...target),
    update: vi.fn(),
  } as unknown as Fo3dCameraControls;
};

describe("camera controls adapter", () => {
  it("preserves requested look-at targets when camera and target are separated", () => {
    const camera = makeCamera([0, 0, 10]);
    const controls = makeControls([0, 0, 0]);

    setCameraControlsLookAt({
      camera,
      controls,
      position: [1, 2, 3],
      target: [4, 5, 6],
    });

    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(controls.target.toArray()).toEqual([4, 5, 6]);
    expect(controls.update).toHaveBeenCalledTimes(1);
  });

  it("keeps look-at updates out of zero-distance orbit state", () => {
    const camera = makeCamera([0, 0, 10]);
    const controls = makeControls([0, 0, 0]);

    setCameraControlsLookAt({
      camera,
      controls,
      position: [0, 0, 0],
      target: [0, 0, 0],
    });

    expect(camera.position.toArray()).toEqual([0, 0, 0]);
    expect(controls.target.x).toBeCloseTo(0);
    expect(controls.target.y).toBeCloseTo(0);
    expect(controls.target.z).toBeCloseTo(-10);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(10);
    expect(controls.update).toHaveBeenCalledTimes(1);
  });

  it("keeps position-only updates out of zero-distance orbit state", () => {
    const camera = makeCamera([0, 0, 10]);
    const controls = makeControls([0, 0, 0]);

    setCameraControlsPosition({
      camera,
      controls,
      position: [0, 0, 0],
    });

    expect(camera.position.toArray()).toEqual([0, 0, 0]);
    expect(controls.target.x).toBeCloseTo(0);
    expect(controls.target.y).toBeCloseTo(0);
    expect(controls.target.z).toBeCloseTo(-10);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(10);
    expect(controls.update).toHaveBeenCalledTimes(1);
  });

  it("falls back to camera forward when current controls are already degenerate", () => {
    const camera = makeCamera([0, 0, 0]);
    const controls = makeControls([0, 0, 0]);

    setCameraControlsLookAt({
      camera,
      controls,
      position: [0, 0, 0],
      target: [0, 0, 0],
    });

    expect(camera.position.toArray()).toEqual([0, 0, 0]);
    expect(controls.target.x).toBeCloseTo(0);
    expect(controls.target.y).toBeCloseTo(0);
    expect(controls.target.z).toBeCloseTo(-1);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(1);
    expect(controls.update).toHaveBeenCalledTimes(1);
  });
});
