import { describe, expect, it, vi } from "vitest";
import { Quaternion, Vector3 } from "three";

import type { CameraFrustumPanelLayer } from "../../../visualization/scene-3d";
import type { FrameTransformResolver } from "./frame-transforms/use-frame-transforms";
import type { DepthHover } from "./depth-sampling";
import { resolveDepthRay } from "./depth-projection";

describe("mcap depth ray", () => {
  it("uses the matching displayed frustum pose", () => {
    const frameTransform = transform("camera", "map");
    const resolveFrameTransform = vi.fn<FrameTransformResolver>();

    expect(
      resolveDepthRay({
        frustumLayers: [frustum(frameTransform)],
        hover: depthHover(),
        resolveFrameTransform,
        timeNs: 50n,
        worldFrameId: "map",
      }),
    ).toEqual({
      layer: {
        end: [1, 2, 3],
        frameTransform,
        id: "depth-ray:/camera/depth",
        start: [0, 0, 0],
      },
      status: "ready",
    });
    expect(resolveFrameTransform).not.toHaveBeenCalled();
  });

  it("renders directly when the camera already is the world frame", () => {
    const resolveFrameTransform = vi.fn<FrameTransformResolver>();

    expect(
      resolveDepthRay({
        frustumLayers: [],
        hover: depthHover({ cameraFrameId: "map" }),
        resolveFrameTransform,
        worldFrameId: "map",
      }),
    ).toEqual({
      layer: {
        end: [1, 2, 3],
        id: "depth-ray:/camera/depth",
        start: [0, 0, 0],
      },
      status: "ready",
    });
    expect(resolveFrameTransform).not.toHaveBeenCalled();
  });

  it("withholds the ray when the 3D pane has no world frame", () => {
    const resolveFrameTransform = vi.fn<FrameTransformResolver>();

    expect(
      resolveDepthRay({
        frustumLayers: [],
        hover: depthHover(),
        resolveFrameTransform,
        timeNs: 50n,
        worldFrameId: "",
      }),
    ).toEqual({ status: "missing" });
    expect(resolveFrameTransform).not.toHaveBeenCalled();
  });

  it.each(["pending", "missing"] as const)(
    "withholds the ray when fallback placement is %s",
    (status) => {
      const resolveFrameTransform: FrameTransformResolver = (
        sourceFrameId,
        targetFrameId,
      ) => ({ sourceFrameId, status, targetFrameId });

      expect(
        resolveDepthRay({
          frustumLayers: [],
          hover: depthHover(),
          resolveFrameTransform,
          timeNs: 50n,
          worldFrameId: "map",
        }),
      ).toEqual({ status });
    },
  );

  it("uses a resolved fallback transform at the current playhead", () => {
    const frameTransform = transform("camera", "map");
    const resolveFrameTransform = vi.fn<FrameTransformResolver>(
      (sourceFrameId, targetFrameId) => ({
        resolutionKind: "exact",
        sourceFrameId,
        status: "resolved",
        targetFrameId,
        transform: frameTransform,
      }),
    );

    const resolution = resolveDepthRay({
      frustumLayers: [],
      hover: depthHover(),
      resolveFrameTransform,
      timeNs: 50n,
      worldFrameId: "map",
    });

    expect(resolution).toMatchObject({
      layer: { frameTransform },
      status: "ready",
    });
    expect(resolveFrameTransform).toHaveBeenCalledWith("camera", "map", 50n);
  });
});

function depthHover(overrides: Partial<DepthHover> = {}): DepthHover {
  return {
    cameraFrameId: "camera",
    contentTimeNs: 25n,
    depthMeters: 3,
    imageStream: "/camera/depth",
    pixel: [4, 5],
    position: [1, 2, 3],
    ...overrides,
  };
}

function frustum(
  frameTransform: CameraFrustumPanelLayer["frameTransform"],
): CameraFrustumPanelLayer {
  return {
    frame: {
      coordinateFrameId: "camera",
      height: 10,
      K: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      kind: "camera-calibration",
      width: 10,
    },
    frameTransform,
    id: "/camera/info",
    imageStream: "/camera/depth",
  } as CameraFrustumPanelLayer;
}

function transform(sourceFrameId: string, targetFrameId: string) {
  return {
    rotation: new Quaternion(),
    sourceFrameId,
    targetFrameId,
    translation: new Vector3(10, 20, 30),
  };
}
