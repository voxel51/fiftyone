import { describe, expect, it } from "vitest";
import {
  createMcap3dViewStateStore,
  EMPTY_MCAP_3D_VIEW_STATE,
  mcap3dSourceShapeMatches,
  nextMcap3dViewStateRestoreOnceKey,
  resolveMcap3dSelectionRestore,
} from "./mcap-3d-view-state";

describe("mcap3dViewState store", () => {
  it("starts empty and records fields independently", () => {
    const store = createMcap3dViewStateStore();
    expect(store.getSnapshot()).toEqual(EMPTY_MCAP_3D_VIEW_STATE);

    store.recordSourceSelection({
      enabledSourceIds: ["/lidar/top"],
      renderableSourceIds: ["/lidar/top", "/labels/boxes"],
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
    expect(store.getSnapshot()).toEqual({
      cameraNavigationMode: "absolute",
      cameraView: {
        pose: { position: [1, 2, 3], target: [0, 0, 0] },
        sourceKey: "source-a",
        worldFrameId: "map",
      },
      cameraProjection: { far: 20000, fovDegrees: 60, near: 0.1 },
      navigationCompositions: [],
      enabledSourceIds: ["/lidar/top"],
      renderableSourceIds: ["/lidar/top", "/labels/boxes"],
      trackingMode: "heading",
      trajectoryFrameOverrides: { "/odom": "map" },
      userCameraTargetFrameId: "base_link",
      userWorldFrameId: "map",
    });
  });

  it("returns snapshots that are frozen in time", () => {
    const store = createMcap3dViewStateStore();
    store.recordUserWorldFrameId("map");
    const snapshot = store.getSnapshot();

    store.recordUserWorldFrameId("odom");
    expect(snapshot.userWorldFrameId).toBe("map");
    expect(store.getSnapshot().userWorldFrameId).toBe("odom");
  });

  it("clears back to empty", () => {
    const store = createMcap3dViewStateStore();
    store.recordTrackingMode("pose");
    store.clear();
    expect(store.getSnapshot()).toEqual(EMPTY_MCAP_3D_VIEW_STATE);
  });

  it("hands out unique restore once-keys", () => {
    expect(nextMcap3dViewStateRestoreOnceKey()).not.toBe(
      nextMcap3dViewStateRestoreOnceKey(),
    );
  });
});

describe("mcap3dSourceShapeMatches", () => {
  it("matches equal id sets regardless of order", () => {
    expect(mcap3dSourceShapeMatches(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("rejects null, subset, superset, and disjoint shapes", () => {
    expect(mcap3dSourceShapeMatches(null, ["a"])).toBe(false);
    expect(mcap3dSourceShapeMatches(["a"], ["a", "b"])).toBe(false);
    expect(mcap3dSourceShapeMatches(["a", "b"], ["a"])).toBe(false);
    expect(mcap3dSourceShapeMatches(["a"], ["b"])).toBe(false);
  });
});

describe("resolveMcap3dSelectionRestore", () => {
  it("passes the selection fields through on a strict shape match", () => {
    const store = createMcap3dViewStateStore();
    store.recordSourceSelection({
      enabledSourceIds: ["a"],
      renderableSourceIds: ["a", "b"],
    });

    expect(
      resolveMcap3dSelectionRestore(store.getSnapshot(), ["b", "a"]),
    ).toEqual({
      enabledSourceIds: ["a"],
      sourceShapeMatches: true,
    });
  });

  it("falls back to nulls on a shape mismatch or missing snapshot", () => {
    const store = createMcap3dViewStateStore();
    store.recordSourceSelection({
      enabledSourceIds: ["a"],
      renderableSourceIds: ["a", "b"],
    });

    expect(
      resolveMcap3dSelectionRestore(store.getSnapshot(), ["a", "c"]),
    ).toEqual({
      enabledSourceIds: null,
      sourceShapeMatches: false,
    });
    expect(resolveMcap3dSelectionRestore(null, ["a"])).toEqual({
      enabledSourceIds: null,
      sourceShapeMatches: false,
    });
  });
});
