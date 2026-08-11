import type { PointCloudCameraPose } from "../../../../visualization/scene-3d/types";
import { describe, expect, it, vi } from "vitest";

import { createScene3dViewStateStore } from "./scene-3d-view-state";
import { createScene3dViewpointStore } from "./scene-3d-viewpoint";
import { createScene3dViewpointActions } from "./use-scene-3d-viewpoint-registration";

describe("createScene3dViewpointActions", () => {
  it("normalizes, publishes, and persists viewpoint commands", () => {
    const handleCameraPoseChange = vi.fn();
    const setCameraNavigationMode = vi.fn();
    const setCameraProjection = vi.fn();
    const viewStateStore = createScene3dViewStateStore();
    const viewpointStore = createScene3dViewpointStore({
      cameraNavigationMode: "relative",
      pose: null,
      projection: { far: 100, fovDegrees: 50, near: 0.1 },
      sceneUpAxis: "z",
    });
    const actions = createScene3dViewpointActions({
      handleCameraPoseChange,
      setCameraNavigationMode,
      setCameraProjection,
      viewStateStore,
      viewpointStore,
    });

    actions.setCameraNavigationMode("absolute");
    expect(setCameraNavigationMode).toHaveBeenCalledWith("absolute");
    expect(viewStateStore.getSnapshot().cameraNavigationMode).toBe("absolute");

    const pose: PointCloudCameraPose = {
      position: [1, 2, 3],
      target: [0, 0, 0],
    };
    actions.setPose(pose);
    expect(handleCameraPoseChange).toHaveBeenCalledWith(pose, "focus");
    expect(viewpointStore.getSnapshot().pose).toBe(pose);

    actions.setProjection({ far: -1, fovDegrees: 999, near: -1 });
    const projection = viewpointStore.getSnapshot().projection;
    expect(setCameraProjection).toHaveBeenCalledWith(projection);
    expect(projection.fovDegrees).toBe(150);
    expect(projection.near).toBeGreaterThan(0);
    expect(viewStateStore.getSnapshot().cameraProjection).toEqual(projection);
  });
});
