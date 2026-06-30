import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { PointCloudVisualization } from "../../../decoders";
import { build3dLayers } from "./mcap-3d-layers";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";

const TIME_NS = 100n;

function frame(coordinateFrameId?: string): PointCloudVisualization {
  return { coordinateFrameId } as unknown as PointCloudVisualization;
}

function playbackFrame(
  value: PointCloudVisualization,
  contentTimeNs = TIME_NS,
) {
  return {
    ageNs: 0n,
    contentTimeNs,
    frame: value,
    requestedTimeNs: contentTimeNs,
  };
}

function transformsState(
  resolve: McapFrameTransformsState["resolve"],
): McapFrameTransformsState {
  return { error: null, frameIds: [], resolve, status: "ready" };
}

describe("build3dLayers", () => {
  it("places a cloud whose frame resolves to the world frame", () => {
    const transform = {
      rotation: new Quaternion(),
      sourceFrameId: "lidar",
      targetFrameId: "base_link",
      translation: new Vector3(1, 2, 3),
    };
    const { pointCloudLayers, unresolvedFrameIds } = build3dLayers({
      frameTransforms: transformsState((sourceFrameId, targetFrameId) => ({
        sourceFrameId,
        resolutionKind: "exact",
        status: "resolved",
        targetFrameId,
        transform,
      })),
      frames: [playbackFrame(frame("lidar"))],
      selectedTopics: ["lidar-topic"],
      worldFrameId: "base_link",
    });

    expect(unresolvedFrameIds).toEqual([]);
    expect(pointCloudLayers).toHaveLength(1);
    expect(pointCloudLayers[0]?.frameTransform).toBe(transform);
  });

  it("renders a still-loading (pending) cloud in its own frame rather than dropping it", () => {
    const { pointCloudLayers, provisionalFrameIds, unresolvedFrameIds } =
      build3dLayers({
        frameTransforms: transformsState((sourceFrameId, targetFrameId) => ({
          sourceFrameId,
          status: "pending",
          targetFrameId,
        })),
        frames: [playbackFrame(frame("lidar"))],
        selectedTopics: ["lidar-topic"],
        worldFrameId: "map",
      });

    // Pending is transient (window still loading): show the cloud now, snap to
    // world once the transform arrives. No missing warning.
    expect(unresolvedFrameIds).toEqual([]);
    expect(provisionalFrameIds).toEqual(["lidar"]);
    expect(pointCloudLayers).toHaveLength(1);
    expect(pointCloudLayers[0]?.frameTransform).toBeUndefined();
  });

  it("renders only the selected provisional cloud when multiple transforms are pending", () => {
    const { pointCloudLayers, provisionalFrameIds } = build3dLayers({
      frameTransforms: transformsState((sourceFrameId, targetFrameId) => ({
        sourceFrameId,
        status: "pending",
        targetFrameId,
      })),
      frames: [
        playbackFrame(frame("radar_front")),
        playbackFrame(frame("lidar_top")),
        playbackFrame(frame("radar_back")),
      ],
      provisionalTopicId: "lidar-topic",
      selectedTopics: ["radar-front-topic", "lidar-topic", "radar-back-topic"],
      worldFrameId: "map",
    });

    expect(provisionalFrameIds).toEqual(["lidar_top"]);
    expect(pointCloudLayers).toHaveLength(1);
    expect(pointCloudLayers[0]?.id).toBe("lidar-topic");
    expect(pointCloudLayers[0]?.frameTransform).toBeUndefined();
  });

  it("drops and reports a cloud that is genuinely missing a path to the world frame", () => {
    const { pointCloudLayers, unresolvedFrameIds } = build3dLayers({
      frameTransforms: transformsState((sourceFrameId, targetFrameId) => ({
        sourceFrameId,
        status: "missing",
        targetFrameId,
      })),
      frames: [playbackFrame(frame("lidar"))],
      selectedTopics: ["lidar-topic"],
      worldFrameId: "map",
    });

    expect(unresolvedFrameIds).toEqual(["lidar"]);
    expect(pointCloudLayers).toHaveLength(0);
  });

  it("renders on first paint before a world frame or playback time is known", () => {
    const { pointCloudLayers, unresolvedFrameIds } = build3dLayers({
      frameTransforms: transformsState(() => {
        throw new Error("resolve must not run without a world frame and time");
      }),
      frames: [playbackFrame(frame("lidar"))],
      selectedTopics: ["lidar-topic"],
      worldFrameId: "",
    });

    expect(unresolvedFrameIds).toEqual([]);
    expect(pointCloudLayers).toHaveLength(1);
    expect(pointCloudLayers[0]?.frameTransform).toBeUndefined();
  });

  it("renders a frameless cloud as-is without consulting transforms", () => {
    const { pointCloudLayers } = build3dLayers({
      frameTransforms: transformsState(() => {
        throw new Error("resolve must not run for frameless clouds");
      }),
      frames: [playbackFrame(frame(undefined))],
      selectedTopics: ["pcd-topic"],
      worldFrameId: "map",
    });

    expect(pointCloudLayers).toHaveLength(1);
    expect(pointCloudLayers[0]?.frameTransform).toBeUndefined();
  });

  it("resolves each cloud transform at its own content timestamp", () => {
    const calls: Array<{
      readonly sourceFrameId: string;
      readonly timeNs: bigint;
    }> = [];

    build3dLayers({
      frameTransforms: transformsState(
        (sourceFrameId, targetFrameId, timeNs) => {
          calls.push({ sourceFrameId, timeNs });
          return {
            sourceFrameId,
            status: "resolved",
            targetFrameId,
            transform: {
              rotation: new Quaternion(),
              sourceFrameId,
              targetFrameId,
              translation: new Vector3(),
            },
          };
        },
      ),
      frames: [
        playbackFrame(frame("lidar_front"), 100n),
        playbackFrame(frame("lidar_rear"), 250n),
      ],
      selectedTopics: ["front", "rear"],
      worldFrameId: "map",
    });

    expect(calls).toEqual([
      { sourceFrameId: "lidar_front", timeNs: 100n },
      { sourceFrameId: "lidar_rear", timeNs: 250n },
    ]);
  });

  it("reports boundary-clamped transforms separately from missing paths", () => {
    const { clampedFrameIds, pointCloudLayers, unresolvedFrameIds } =
      build3dLayers({
        frameTransforms: transformsState((sourceFrameId, targetFrameId) => ({
          resolutionKind: "clamped",
          sourceFrameId,
          status: "resolved",
          targetFrameId,
          transform: {
            resolutionKind: "clamped",
            rotation: new Quaternion(),
            sourceFrameId,
            targetFrameId,
            translation: new Vector3(),
          },
        })),
        frames: [playbackFrame(frame("lidar"))],
        selectedTopics: ["lidar-topic"],
        worldFrameId: "map",
      });

    expect(clampedFrameIds).toEqual(["lidar"]);
    expect(unresolvedFrameIds).toEqual([]);
    expect(pointCloudLayers).toHaveLength(1);
  });

  it("reports rendered transforms that interpolate across large gaps", () => {
    const { largeInterpolationGaps, pointCloudLayers, unresolvedFrameIds } =
      build3dLayers({
        frameTransforms: transformsState((sourceFrameId, targetFrameId) => ({
          maxInterpolationGapNs: 2_500_000_000n,
          resolutionKind: "interpolated",
          sourceFrameId,
          status: "resolved",
          targetFrameId,
          transform: {
            maxInterpolationGapNs: 2_500_000_000n,
            resolutionKind: "interpolated",
            rotation: new Quaternion(),
            sourceFrameId,
            targetFrameId,
            translation: new Vector3(),
          },
        })),
        frames: [playbackFrame(frame("lidar"))],
        largeInterpolationGapWarningNs: 2_000_000_000n,
        selectedTopics: ["lidar-topic"],
        worldFrameId: "map",
      });

    expect(largeInterpolationGaps).toEqual([
      { frameId: "lidar", gapNs: 2_500_000_000n },
    ]);
    expect(unresolvedFrameIds).toEqual([]);
    expect(pointCloudLayers).toHaveLength(1);
  });
});
