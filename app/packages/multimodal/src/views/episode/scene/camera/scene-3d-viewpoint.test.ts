import { describe, expect, it, vi } from "vitest";
import {
  cameraOrbitFromPose,
  cameraPoseFromOrbit,
  createScene3dViewpointStore,
  normalizeScene3dCameraProjection,
} from "./scene-3d-viewpoint";

describe("episode 3D viewpoint", () => {
  it("expresses a Z-up camera as understandable orbit angles", () => {
    const orbit = cameraOrbitFromPose(
      { position: [0, 10, 10], target: [0, 0, 0] },
      "z",
    );

    expect(orbit.azimuthDegrees).toBeCloseTo(90);
    expect(orbit.elevationDegrees).toBeCloseTo(45);
    expect(orbit.distance).toBeCloseTo(Math.sqrt(200));
    expect(orbit.target).toEqual([0, 0, 0]);
  });

  it("round-trips orbit controls for every scene-up convention", () => {
    for (const sceneUpAxis of ["x", "y", "z"] as const) {
      const pose = cameraPoseFromOrbit(
        {
          azimuthDegrees: 35,
          distance: 12,
          elevationDegrees: 25,
          target: [4, 5, 6],
        },
        sceneUpAxis,
      );
      const orbit = cameraOrbitFromPose(pose, sceneUpAxis);

      expect(orbit.azimuthDegrees).toBeCloseTo(35);
      expect(orbit.elevationDegrees).toBeCloseTo(25);
      expect(orbit.distance).toBeCloseTo(12);
      expect(orbit.target).toEqual([4, 5, 6]);
    }
  });

  it("keeps projection values inside safe perspective bounds", () => {
    expect(
      normalizeScene3dCameraProjection({
        far: 0,
        fovDegrees: 200,
        near: -1,
      }),
    ).toEqual({ far: 10000, fovDegrees: 150, near: 0.0001 });
  });

  it("notifies subscribers only when the visible snapshot changes", () => {
    const store = createScene3dViewpointStore({
      cameraNavigationMode: "relative",
      pose: null,
      projection: { far: 10000, fovDegrees: 50, near: 0.01 },
      sceneUpAxis: "z",
    });
    const listener = vi.fn();
    store.subscribe(listener);

    store.publish({ sceneUpAxis: "z" });
    store.publish({ cameraNavigationMode: "absolute" });
    store.publish({ pose: { position: [1, 2, 3], target: [0, 0, 0] } });
    store.publish({ pose: { position: [1, 2, 3], target: [0, 0, 0] } });

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
