import { act, cleanup, renderHook } from "@testing-library/react";
import { Quaternion, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PointCloudVisualization } from "../../../decoders";
import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import { useMcap3dCameraTracking } from "./use-mcap-3d-camera-tracking";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

vi.mock("../mcap-latency-debug", () => ({
  markMcapLatencyEvent: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(markMcapLatencyEvent).mockClear();
});

afterEach(() => {
  cleanup();
});

type TrackingProps = Parameters<typeof useMcap3dCameraTracking>[0];

describe("useMcap3dCameraTracking", () => {
  it("passes through user poses in free mode and ignores initial poses", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps(),
    });

    expect(result.current.trackingMode).toBe("free");
    expect(result.current.panelCameraPose).toBeNull();

    act(() => {
      result.current.handleCameraPoseChange(pose(1), "interaction");
    });
    expect(result.current.panelCameraPose).toEqual(pose(1));
    expect(result.current.controlledCameraPose).toBeNull();

    // Panel-fitted initial poses never overwrite the tile's camera state.
    act(() => {
      result.current.handleCameraPoseChange(pose(2), "initial");
    });
    expect(result.current.panelCameraPose).toEqual(pose(1));

    act(() => {
      result.current.handleCameraPoseChange(pose(3), "focus");
    });
    expect(result.current.panelCameraPose).toEqual(pose(3));
  });

  it("anchors from the latest pose when a follow mode starts and tracks the moving target", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: translationTransforms(0, 0, 0),
      }),
    });

    act(() => {
      result.current.handleCameraPoseChange(pose(5), "interaction");
    });
    act(() => {
      result.current.setTrackingMode("position");
    });

    expect(result.current.trackingMode).toBe("position");
    expect(result.current.trackingAnchor).not.toBeNull();
    // The anchored view reproduces the user's pose while the target sits at
    // the anchor-time transform.
    expect(result.current.panelCameraPose).toEqual(pose(5));

    // Target frame moves +10 on x: the controlled pose preserves the user's
    // offset relative to the target.
    rerender(
      trackingProps({ frameTransforms: translationTransforms(10, 0, 0) }),
    );
    expect(result.current.controlledCameraPose).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
    expect(result.current.panelCameraPose).toEqual(
      result.current.controlledCameraPose,
    );
  });

  it("re-anchors on user interaction while following and clears the anchor in free mode", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: translationTransforms(0, 0, 0),
      }),
    });

    act(() => {
      result.current.handleCameraPoseChange(pose(5), "interaction");
    });
    act(() => {
      result.current.setTrackingMode("position");
    });
    rerender(
      trackingProps({ frameTransforms: translationTransforms(10, 0, 0) }),
    );

    // User drags while following: the anchor re-bases on the new pose.
    act(() => {
      result.current.handleCameraPoseChange(pose(100), "interaction");
    });
    expect(result.current.panelCameraPose).toEqual(pose(100));

    rerender(
      trackingProps({ frameTransforms: translationTransforms(12, 0, 0) }),
    );
    expect(result.current.panelCameraPose).toEqual({
      position: [102, 0, 10],
      target: [102, 0, 0],
    });

    // Back to free: anchor cleared, last uncontrolled pose wins again.
    act(() => {
      result.current.setTrackingMode("free");
    });
    expect(result.current.trackingAnchor).toBeNull();
    expect(result.current.controlledCameraPose).toBeNull();
    expect(result.current.panelCameraPose).toEqual(pose(100));
  });

  it("remaps the provisional camera pose exactly once per remap key", () => {
    // Mount before any layers exist, then transition to provisional the way
    // the tile does once the first source-frame cloud paints.
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "empty",
      }),
    });
    rerender(
      trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "provisional",
        provisionalFrameIds: ["lidar"],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
      }),
    );

    act(() => {
      result.current.handleCameraPoseChange(pose(1), "interaction");
    });

    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        provisionalFrameIds: [],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
      }),
    );

    expect(result.current.panelCameraPose).toEqual({
      position: [11, 0, 10],
      target: [11, 0, 0],
    });
    expect(remapEvents()).toHaveLength(1);
    expect(remapEvents()[0]?.[1]).toMatchObject({
      sourceFrameId: "lidar",
      targetFrameId: "map",
    });

    // Placement flip-flops back through provisional with the same content
    // time: the remap key dedupes and the pose stays put.
    rerender(
      trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "provisional",
        provisionalFrameIds: ["lidar"],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
      }),
    );
    act(() => {
      result.current.noteRenderedCameraPose(pose(2));
    });
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        provisionalFrameIds: [],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
      }),
    );

    expect(remapEvents()).toHaveLength(1);
    expect(result.current.panelCameraPose).toEqual({
      position: [11, 0, 10],
      target: [11, 0, 0],
    });
  });

  it("drops provisional remap memory when the selected topics change", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "empty",
      }),
    });
    rerender(
      trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "provisional",
        provisionalFrameIds: ["lidar"],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
      }),
    );

    act(() => {
      result.current.handleCameraPoseChange(pose(1), "interaction");
    });

    rerender(
      trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "provisional",
        provisionalFrameIds: ["lidar"],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
        selectedTopicsKey: "other-topics",
      }),
    );
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        provisionalFrameIds: [],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
        selectedTopicsKey: "other-topics",
      }),
    );

    expect(remapEvents()).toHaveLength(0);
    expect(result.current.panelCameraPose).toEqual(pose(1));
  });
});

function remapEvents() {
  return vi
    .mocked(markMcapLatencyEvent)
    .mock.calls.filter(([name]) => name === "3d camera pose remapped");
}

function trackingProps(overrides: Partial<TrackingProps> = {}): TrackingProps {
  return {
    cameraTargetFrameId: "base_link",
    frameTransforms: translationTransforms(0, 0, 0),
    latencyDebugEnabled: true,
    placementStatus: "empty",
    playbackTimeNs: 0n,
    provisionalFrameIds: [],
    provisionalPlaybackFrame: null,
    selectedTopicsKey: "topics",
    worldFrameId: "map",
    ...overrides,
  };
}

function pose(x: number): PointCloudCameraPose {
  return { position: [x, 0, 10], target: [x, 0, 0] };
}

function translationTransforms(
  x: number,
  y: number,
  z: number,
): McapFrameTransformsState {
  return {
    error: null,
    frameIds: ["base_link", "lidar", "map"],
    resolve: (sourceFrameId, targetFrameId) => ({
      sourceFrameId,
      status: "resolved",
      targetFrameId,
      transform: {
        rotation: new Quaternion(),
        sourceFrameId,
        targetFrameId,
        translation: new Vector3(x, y, z),
      },
    }),
    status: "ready",
  };
}

function missingTransforms(): McapFrameTransformsState {
  return {
    error: null,
    frameIds: [],
    resolve: (sourceFrameId, targetFrameId) => ({
      sourceFrameId,
      status: "missing",
      targetFrameId,
    }),
    status: "loading",
  };
}

function provisionalFrame(
  frameId: string,
  contentTimeNs: bigint,
): McapTopicPlaybackFrame<PointCloudVisualization> {
  return {
    ageNs: 0n,
    contentTimeNs,
    frame: {
      coordinateFrameId: frameId,
    } as unknown as PointCloudVisualization,
    requestedTimeNs: contentTimeNs,
  };
}
