import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  captureMcap3dCameraCompositions,
  resolveMcap3dCameraComposition,
  type Mcap3dBoundsNormalizedCameraComposition,
  type Mcap3dTargetRelativeCameraComposition,
} from "./mcap-3d-camera-composition";

describe("MCAP 3D camera composition", () => {
  it("captures target-relative intent before the bounds fallback", () => {
    const compositions = captureMcap3dCameraCompositions({
      cameraPose: { position: [15, 2, 10], target: [10, 2, 0] },
      cameraTargetFrameId: "base_link",
      cameraTargetResolution: targetAt(10, 2, 0),
      sceneBounds: { center: [10, 2, 0], radius: 5 },
      sceneUpAxis: "z",
      trackingAnchor: null,
      trackingMode: "free",
      worldFrameId: "map",
    });

    expect(compositions).toHaveLength(2);
    expect(compositions[0]).toEqual({
      kind: "target-relative",
      relativePosition: [5, 0, 10],
      relativeTarget: [0, 0, 0],
      rotationMode: "position",
      sceneUpAxis: "z",
      targetFrameId: "base_link",
      trackingMode: "free",
    });
    expect(compositions[1]?.kind).toBe("bounds-normalized");
  });

  it("reconstructs a target-relative view in the new recording", () => {
    const composition: Mcap3dTargetRelativeCameraComposition = {
      kind: "target-relative",
      relativePosition: [5, 0, 10],
      relativeTarget: [0, 0, 0],
      rotationMode: "position",
      sceneUpAxis: "z",
      targetFrameId: "base_link",
      trackingMode: "position",
    };

    expect(
      resolveMcap3dCameraComposition({
        cameraTargetFrameId: "base_link",
        cameraTargetResolution: targetAt(100, 20, 0),
        composition,
        placementStatus: "transformed",
        sceneBounds: null,
        sceneUpAxis: "z",
        worldFrameId: "odom",
      }),
    ).toEqual({
      anchor: {
        mode: "position",
        relativePosition: [5, 0, 10],
        relativeTarget: [0, 0, 0],
        sceneUpAxis: "z",
        targetFrameId: "base_link",
        worldFrameId: "odom",
      },
      pose: { position: [105, 20, 10], target: [100, 20, 0] },
      status: "resolved",
    });
  });

  it("rejects incompatible target and scene conventions", () => {
    const composition: Mcap3dTargetRelativeCameraComposition = {
      kind: "target-relative",
      relativePosition: [5, 0, 10],
      relativeTarget: [0, 0, 0],
      rotationMode: "position",
      sceneUpAxis: "z",
      targetFrameId: "base_link",
      trackingMode: "free",
    };
    const common = {
      cameraTargetResolution: targetAt(0, 0, 0),
      composition,
      placementStatus: "transformed" as const,
      sceneBounds: null,
      worldFrameId: "map",
    };

    expect(
      resolveMcap3dCameraComposition({
        ...common,
        cameraTargetFrameId: "vehicle",
        sceneUpAxis: "z",
      }),
    ).toEqual({ reason: "target-frame-mismatch", status: "rejected" });
    expect(
      resolveMcap3dCameraComposition({
        ...common,
        cameraTargetFrameId: "base_link",
        sceneUpAxis: "y",
      }),
    ).toEqual({ reason: "scene-up-mismatch", status: "rejected" });
  });

  it("reconstructs bounds-normalized orientation and zoom", () => {
    const composition: Mcap3dBoundsNormalizedCameraComposition = {
      distanceInRadii: 2,
      kind: "bounds-normalized",
      sceneUpAxis: "z",
      targetOffsetInRadii: [1, 0, 0],
      trackingMode: "free",
      viewDirection: [0, 0, 1],
    };

    expect(
      resolveMcap3dCameraComposition({
        cameraTargetFrameId: "",
        cameraTargetResolution: { status: "pending" },
        composition,
        placementStatus: "transformed",
        sceneBounds: { center: [10, 20, 30], radius: 5 },
        sceneUpAxis: "z",
        worldFrameId: "",
      }),
    ).toEqual({
      anchor: null,
      pose: { position: [15, 20, 40], target: [15, 20, 30] },
      status: "resolved",
    });
  });

  it("keeps unresolved placement and bounds pending", () => {
    const composition: Mcap3dBoundsNormalizedCameraComposition = {
      distanceInRadii: 2,
      kind: "bounds-normalized",
      sceneUpAxis: "z",
      targetOffsetInRadii: [0, 0, 0],
      trackingMode: "free",
      viewDirection: [0, 0, 1],
    };
    const common = {
      cameraTargetFrameId: "",
      cameraTargetResolution: { status: "pending" as const },
      composition,
      sceneUpAxis: "z" as const,
      worldFrameId: "",
    };

    expect(
      resolveMcap3dCameraComposition({
        ...common,
        placementStatus: "provisional",
        sceneBounds: null,
      }),
    ).toEqual({ reason: "placement-pending", status: "pending" });
    expect(
      resolveMcap3dCameraComposition({
        ...common,
        placementStatus: "transformed",
        sceneBounds: null,
      }),
    ).toEqual({ reason: "bounds-unavailable", status: "pending" });
  });
});

function targetAt(x: number, y: number, z: number) {
  return {
    pose: {
      rotation: new Quaternion(),
      translation: new Vector3(x, y, z),
    },
    status: "resolved" as const,
  };
}
