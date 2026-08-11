import { Quaternion, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import type {
  FrameGraphSummarizer,
  FrameTransformResolver,
} from "../spatial/frame-transforms/use-frame-transforms";
import { resolvePointCloudProjectionTransform } from "./use-image-projection-layers";

describe("point cloud image projection placement", () => {
  it("composes point-time and image-time transforms through a stable frame", () => {
    const resolve = vi.fn<FrameTransformResolver>(
      (sourceFrameId, targetFrameId, _timeNs) => ({
        sourceFrameId,
        status: "resolved",
        targetFrameId,
        transform: {
          rotation:
            sourceFrameId === "map"
              ? new Quaternion().setFromAxisAngle(
                  new Vector3(0, 0, 1),
                  Math.PI / 2,
                )
              : new Quaternion(),
          sourceFrameId,
          targetFrameId,
          translation:
            sourceFrameId === "lidar" && targetFrameId === "map"
              ? new Vector3(1, 0, 0)
              : new Vector3(0, 2, 0),
        },
      }),
    );

    const transform = resolvePointCloudProjectionTransform({
      cameraFrameId: "camera",
      imageContentTimeNs: 20n,
      pointContentTimeNs: 10n,
      resolve,
      sourceFrameId: "lidar",
      summarizeGraph: graphSummarizer(["camera", "lidar", "map"], ["map"]),
    });

    expect(resolve).toHaveBeenNthCalledWith(1, "lidar", "map", 10n);
    expect(resolve).toHaveBeenNthCalledWith(2, "map", "camera", 20n);
    expect(transform?.translation.x).toBeCloseTo(0);
    expect(transform?.translation.y).toBeCloseTo(3);
    expect(transform?.translation.z).toBeCloseTo(0);
  });

  it("withholds projection without a common rooted transform component", () => {
    const resolve = vi.fn<FrameTransformResolver>();

    expect(
      resolvePointCloudProjectionTransform({
        cameraFrameId: "camera",
        imageContentTimeNs: 20n,
        pointContentTimeNs: 10n,
        resolve,
        sourceFrameId: "lidar",
        summarizeGraph: graphSummarizer(
          ["camera", "map"],
          ["map"],
          [["camera", "map"], ["lidar"]],
        ),
      }),
    ).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("accounts for motion when the point and camera frame names match", () => {
    const resolve = vi.fn<FrameTransformResolver>(
      (sourceFrameId, targetFrameId) => ({
        sourceFrameId,
        status: "resolved",
        targetFrameId,
        transform: {
          rotation: new Quaternion(),
          sourceFrameId,
          targetFrameId,
          translation:
            targetFrameId === "map"
              ? new Vector3(1, 0, 0)
              : new Vector3(-2, 0, 0),
        },
      }),
    );

    const transform = resolvePointCloudProjectionTransform({
      cameraFrameId: "sensor",
      imageContentTimeNs: 20n,
      pointContentTimeNs: 10n,
      resolve,
      sourceFrameId: "sensor",
      summarizeGraph: graphSummarizer(["map", "sensor"], ["map"]),
    });

    expect(resolve).toHaveBeenNthCalledWith(1, "sensor", "map", 10n);
    expect(resolve).toHaveBeenNthCalledWith(2, "map", "sensor", 20n);
    expect(transform?.translation.x).toBe(-1);
  });

  it("prefers a namespaced stable frame over another graph root", () => {
    const resolve = vi.fn<FrameTransformResolver>(
      (sourceFrameId, targetFrameId) => ({
        sourceFrameId,
        status: "resolved",
        targetFrameId,
        transform: {
          rotation: new Quaternion(),
          sourceFrameId,
          targetFrameId,
          translation: new Vector3(),
        },
      }),
    );

    resolvePointCloudProjectionTransform({
      cameraFrameId: "camera",
      imageContentTimeNs: 20n,
      pointContentTimeNs: 10n,
      resolve,
      sourceFrameId: "lidar",
      summarizeGraph: graphSummarizer(
        ["camera", "lidar", "robot/map"],
        ["camera"],
      ),
    });

    expect(resolve).toHaveBeenNthCalledWith(1, "lidar", "robot/map", 10n);
    expect(resolve).toHaveBeenNthCalledWith(2, "robot/map", "camera", 20n);
  });
});

function graphSummarizer(
  frameIds: readonly string[],
  roots: readonly string[],
  components: readonly (readonly string[])[] = [frameIds],
): FrameGraphSummarizer {
  return () => ({
    components,
    dataBearingReachableCountsByFrameId: new Map(),
    reachableCountsByFrameId: new Map(),
    roots,
    tfConnectedFrameIds: frameIds,
  });
}
