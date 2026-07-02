import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_MCAP_3D_VIEW_STATE,
  clearMcap3dViewState,
  getMcap3dViewStateSnapshot,
  mcap3dSourceShapeMatches,
  nextMcap3dViewStateRestoreOnceKey,
  recordMcap3dCameraView,
  recordMcap3dShowCameraImages,
  recordMcap3dSourceSelection,
  recordMcap3dTrackingAnchor,
  recordMcap3dTrackingMode,
  recordMcap3dTrajectoryFrameOverrides,
  recordMcap3dUserCameraTargetFrameId,
  recordMcap3dUserWorldFrameId,
  resetMcap3dViewStateForTests,
  resolveMcap3dSelectionRestore,
} from "./mcap-3d-view-state";

beforeEach(() => {
  resetMcap3dViewStateForTests();
});

describe("mcap3dViewState store", () => {
  it("starts empty and records fields independently", () => {
    expect(getMcap3dViewStateSnapshot()).toEqual(EMPTY_MCAP_3D_VIEW_STATE);

    recordMcap3dSourceSelection({
      enabledSourceIds: ["/lidar/top"],
      renderableSourceIds: ["/lidar/top", "/labels/boxes"],
    });
    recordMcap3dShowCameraImages(false);
    recordMcap3dTrajectoryFrameOverrides({ "/odom": "map" });
    recordMcap3dTrackingMode("heading");
    recordMcap3dUserWorldFrameId("map");
    recordMcap3dUserCameraTargetFrameId("base_link");
    recordMcap3dCameraView({
      pose: { position: [1, 2, 3], target: [0, 0, 0] },
      worldFrameId: "map",
    });
    recordMcap3dTrackingAnchor({
      mode: "heading",
      relativePosition: [1, 0, 0],
      relativeTarget: [0, 0, 0],
      targetFrameId: "base_link",
      worldFrameId: "map",
    });

    expect(getMcap3dViewStateSnapshot()).toEqual({
      cameraView: {
        pose: { position: [1, 2, 3], target: [0, 0, 0] },
        worldFrameId: "map",
      },
      enabledSourceIds: ["/lidar/top"],
      renderableSourceIds: ["/lidar/top", "/labels/boxes"],
      showCameraImages: false,
      trackingAnchor: {
        mode: "heading",
        relativePosition: [1, 0, 0],
        relativeTarget: [0, 0, 0],
        targetFrameId: "base_link",
        worldFrameId: "map",
      },
      trackingMode: "heading",
      trajectoryFrameOverrides: { "/odom": "map" },
      userCameraTargetFrameId: "base_link",
      userWorldFrameId: "map",
    });
  });

  it("returns snapshots that are frozen in time", () => {
    recordMcap3dUserWorldFrameId("map");
    const snapshot = getMcap3dViewStateSnapshot();

    recordMcap3dUserWorldFrameId("odom");
    expect(snapshot.userWorldFrameId).toBe("map");
    expect(getMcap3dViewStateSnapshot().userWorldFrameId).toBe("odom");
  });

  it("clears back to empty", () => {
    recordMcap3dTrackingMode("pose");
    clearMcap3dViewState();
    expect(getMcap3dViewStateSnapshot()).toEqual(EMPTY_MCAP_3D_VIEW_STATE);
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
    recordMcap3dSourceSelection({
      enabledSourceIds: ["a"],
      renderableSourceIds: ["a", "b"],
    });
    recordMcap3dShowCameraImages(false);

    expect(
      resolveMcap3dSelectionRestore(getMcap3dViewStateSnapshot(), ["b", "a"]),
    ).toEqual({
      enabledSourceIds: ["a"],
      showCameraImages: false,
      sourceShapeMatches: true,
    });
  });

  it("falls back to nulls on a shape mismatch or missing snapshot", () => {
    recordMcap3dSourceSelection({
      enabledSourceIds: ["a"],
      renderableSourceIds: ["a", "b"],
    });

    expect(
      resolveMcap3dSelectionRestore(getMcap3dViewStateSnapshot(), ["a", "c"]),
    ).toEqual({
      enabledSourceIds: null,
      showCameraImages: null,
      sourceShapeMatches: false,
    });
    expect(resolveMcap3dSelectionRestore(null, ["a"])).toEqual({
      enabledSourceIds: null,
      showCameraImages: null,
      sourceShapeMatches: false,
    });
  });
});
