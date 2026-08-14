import { describe, expect, it } from "vitest";
import {
  createScene3dViewStateStore,
  EMPTY_SCENE_3D_VIEW_STATE,
  scene3dSourceShapeMatches,
  resolveScene3dSelectionRestore,
} from "./scene-3d-view-state";

describe("episode 3D view-state store", () => {
  it("starts empty and records fields independently", () => {
    const store = createScene3dViewStateStore();
    expect(store.getSnapshot()).toEqual(EMPTY_SCENE_3D_VIEW_STATE);

    store.recordSourceSelection({
      enabledSourceIds: ["/lidar/top"],
      renderableSourceIds: ["/lidar/top", "/labels/boxes"],
      renderableSourceKeys: [
        "point-cloud\0/lidar/top",
        "scene-annotation\0/labels/boxes",
      ],
    });
    store.recordTrajectoryFrameOverrides({ "/odom": "map" });
    store.recordTrackingMode("heading");
    store.recordUserWorldFrameId("map");
    store.recordUserCameraTargetFrameId("base_link");
    store.recordCameraView({
      pose: { position: [1, 2, 3], target: [0, 0, 0] },
      sourceKey: "source-a",
      worldFrameId: "map",
    });
    store.recordCameraProjection({
      far: 20000,
      fovDegrees: 60,
      near: 0.1,
    });
    store.recordCameraNavigationMode("absolute");
    const navigationComposition = {
      kind: "target-relative",
      relativePosition: [1, 2, 3],
      relativeTarget: [0, 0, 0],
      rotationMode: "heading",
      sceneUpAxis: "z",
      targetFrameId: "base_link",
      trackingMode: "heading",
    } as const;
    store.recordNavigationCompositions([navigationComposition]);
    expect(store.getSnapshot()).toEqual({
      cameraNavigationMode: "absolute",
      cameraView: {
        pose: { position: [1, 2, 3], target: [0, 0, 0] },
        sourceKey: "source-a",
        worldFrameId: "map",
      },
      cameraProjection: { far: 20000, fovDegrees: 60, near: 0.1 },
      navigationCompositions: [navigationComposition],
      enabledSourceIds: ["/lidar/top"],
      renderableSourceIds: ["/lidar/top", "/labels/boxes"],
      renderableSourceKeys: [
        "point-cloud\0/lidar/top",
        "scene-annotation\0/labels/boxes",
      ],
      trackingMode: "heading",
      trajectoryFrameOverrides: { "/odom": "map" },
      userCameraTargetFrameId: "base_link",
      userWorldFrameId: "map",
    });
  });

  it("returns snapshots that are frozen in time", () => {
    const store = createScene3dViewStateStore();
    store.recordUserWorldFrameId("map");
    const snapshot = store.getSnapshot();

    store.recordUserWorldFrameId("odom");
    expect(snapshot.userWorldFrameId).toBe("map");
    expect(store.getSnapshot().userWorldFrameId).toBe("odom");
  });

  it("clears back to empty", () => {
    const store = createScene3dViewStateStore();
    store.recordTrackingMode("pose");
    store.clear();
    expect(store.getSnapshot()).toEqual(EMPTY_SCENE_3D_VIEW_STATE);
  });
});

describe("scene3dSourceShapeMatches", () => {
  it("matches equal key sets regardless of order", () => {
    expect(scene3dSourceShapeMatches(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("rejects null, subset, superset, and disjoint shapes", () => {
    expect(scene3dSourceShapeMatches(null, ["a"])).toBe(false);
    expect(scene3dSourceShapeMatches(["a"], ["a", "b"])).toBe(false);
    expect(scene3dSourceShapeMatches(["a", "b"], ["a"])).toBe(false);
    expect(scene3dSourceShapeMatches(["a"], ["b"])).toBe(false);
  });
});

describe("resolveScene3dSelectionRestore", () => {
  it("passes the selection fields through on a strict shape match", () => {
    const store = createScene3dViewStateStore();
    store.recordSourceSelection({
      enabledSourceIds: ["a"],
      renderableSourceIds: ["a", "b"],
      renderableSourceKeys: ["point-cloud\0/a", "point-cloud\0/b"],
    });

    expect(
      resolveScene3dSelectionRestore(store.getSnapshot(), ["b", "a"]),
    ).toEqual({
      enabledSourceIds: ["a"],
      sourceShapeMatches: true,
    });
  });

  it("falls back to nulls on a shape mismatch or missing snapshot", () => {
    const store = createScene3dViewStateStore();
    store.recordSourceSelection({
      enabledSourceIds: ["a"],
      renderableSourceIds: ["a", "b"],
      renderableSourceKeys: ["point-cloud\0/a", "point-cloud\0/b"],
    });

    expect(
      resolveScene3dSelectionRestore(store.getSnapshot(), ["a", "c"]),
    ).toEqual({
      enabledSourceIds: null,
      sourceShapeMatches: false,
    });
    expect(resolveScene3dSelectionRestore(null, ["a"])).toEqual({
      enabledSourceIds: null,
      sourceShapeMatches: false,
    });
  });
});
