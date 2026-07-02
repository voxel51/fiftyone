import { act, cleanup, renderHook } from "@testing-library/react";
import { Quaternion, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PointCloudVisualization } from "../../../decoders";
import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import type { Mcap3dCameraTrackingAnchor } from "./mcap-3d-camera";
import { resetMcap3dViewStateForTests } from "./mcap-3d-view-state";
import {
  mcap3dCameraPoseRestoreApplies,
  mcap3dTrackingAnchorRestoreApplies,
  useMcap3dCameraTracking,
} from "./use-mcap-3d-camera-tracking";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

vi.mock("../mcap-latency-debug", () => ({
  markMcapLatencyEvent: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(markMcapLatencyEvent).mockClear();
  resetMcap3dViewStateForTests();
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

describe("useMcap3dCameraTracking view-state restore", () => {
  it("restores the tracking mode unconditionally", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        restore: cameraRestore({ trackingMode: "heading" }),
      }),
    });

    expect(result.current.trackingMode).toBe("heading");
  });

  it("restores the camera pose once transformed in its world frame, bypassing the remap", () => {
    const restore = cameraRestore({
      cameraView: { pose: pose(7), worldFrameId: "map" },
    });
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "empty",
        restore,
      }),
    });
    rerender(
      trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "provisional",
        provisionalFrameIds: ["lidar"],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
        restore,
      }),
    );

    // The panel's provisional auto-fit paints and records a provisional view
    // — exactly the memory the remap machinery would use to clobber us.
    act(() => {
      result.current.noteRenderedCameraPose(pose(1));
    });

    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        provisionalFrameIds: [],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
        restore,
      }),
    );

    // The restored pose wins and the remap never fires: no double-remap.
    expect(result.current.panelCameraPose).toEqual(pose(7));
    expect(remapEvents()).toHaveLength(0);
    expect(restoredEvents().map(([, detail]) => detail)).toMatchObject([
      { field: "cameraPose", worldFrameId: "map" },
    ]);
  });

  it("keeps the remap when the restored pose's world frame differs, then applies a late match without fighting", () => {
    const restore = cameraRestore({
      cameraView: { pose: pose(7), worldFrameId: "odom" },
    });
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "empty",
        restore,
      }),
    });
    rerender(
      trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "provisional",
        provisionalFrameIds: ["lidar"],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
        restore,
      }),
    );
    act(() => {
      result.current.noteRenderedCameraPose(pose(1));
    });
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        provisionalFrameIds: [],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
        restore,
      }),
    );

    // World frame is "map", the carried pose was captured in "odom": the
    // provisional remap applies exactly as without any restore.
    expect(result.current.panelCameraPose).toEqual({
      position: [11, 0, 10],
      target: [11, 0, 0],
    });
    expect(remapEvents()).toHaveLength(1);
    expect(restoredEvents()).toHaveLength(0);

    // The world frame later becomes the carried pose's frame (e.g. a pending
    // user world-frame adoption): the restore applies once and the remap
    // does not re-fire.
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        provisionalFrameIds: [],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
        restore,
        worldFrameId: "odom",
      }),
    );
    expect(result.current.panelCameraPose).toEqual(pose(7));
    expect(remapEvents()).toHaveLength(1);
    expect(restoredEvents().map(([, detail]) => detail)).toMatchObject([
      { field: "cameraPose", worldFrameId: "odom" },
    ]);
  });

  it("abandons the pose restore when the user moves the camera first", () => {
    const restore = cameraRestore({
      cameraView: { pose: pose(7), worldFrameId: "map" },
    });
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "empty",
        restore,
      }),
    });

    act(() => {
      result.current.handleCameraPoseChange(pose(3), "interaction");
    });
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        restore,
      }),
    );

    expect(result.current.panelCameraPose).toEqual(pose(3));
    expect(restoredEvents()).toHaveLength(0);
  });

  it("restores the follow-mode tracking anchor when its frames match", () => {
    const anchor = trackingAnchor({});
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        restore: cameraRestore({
          trackingAnchor: anchor,
          trackingMode: "position",
        }),
      }),
    });

    expect(result.current.trackingMode).toBe("position");
    expect(result.current.trackingAnchor).toEqual(anchor);
    // The anchored offset rides the current target transform (+10 on x).
    expect(result.current.controlledCameraPose).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
    expect(restoredEvents().map(([, detail]) => detail)).toMatchObject([
      { field: "trackingAnchor", trackingMode: "position" },
    ]);
  });

  it("does not restore an anchor whose frames differ from the effective selections", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        restore: cameraRestore({
          trackingAnchor: trackingAnchor({ targetFrameId: "other" }),
          trackingMode: "position",
        }),
      }),
    });

    expect(result.current.trackingMode).toBe("position");
    expect(result.current.trackingAnchor).toBeNull();
    expect(result.current.controlledCameraPose).toBeNull();
    expect(restoredEvents()).toHaveLength(0);
  });

  it("abandons a pending anchor restore when the user interacts first", () => {
    const restore = cameraRestore({
      trackingAnchor: trackingAnchor({}),
      trackingMode: "position",
    });
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      // The anchor's target frame is not effective yet, so the restore pends.
      initialProps: trackingProps({ cameraTargetFrameId: "", restore }),
    });

    expect(result.current.trackingAnchor).toBeNull();
    act(() => {
      result.current.handleCameraPoseChange(pose(1), "interaction");
    });
    rerender(trackingProps({ restore }));

    // Re-anchoring from the user's pose wins; the carried anchor never lands.
    expect(result.current.panelCameraPose).toEqual(pose(1));
    expect(restoredEvents()).toHaveLength(0);
  });
});

describe("restore compatibility gates", () => {
  it("gates the camera pose on transformed placement and a world-frame match", () => {
    expect(
      mcap3dCameraPoseRestoreApplies({
        placementStatus: "transformed",
        restoreWorldFrameId: "map",
        worldFrameId: "map",
      }),
    ).toBe(true);
    expect(
      mcap3dCameraPoseRestoreApplies({
        placementStatus: "provisional",
        restoreWorldFrameId: "map",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dCameraPoseRestoreApplies({
        placementStatus: "transformed",
        restoreWorldFrameId: "odom",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dCameraPoseRestoreApplies({
        placementStatus: "transformed",
        restoreWorldFrameId: "",
        worldFrameId: "",
      }),
    ).toBe(false);
  });

  it("gates the tracking anchor on mode and both frame ids", () => {
    const anchor = trackingAnchor({});
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "base_link",
        trackingMode: "position",
        worldFrameId: "map",
      }),
    ).toBe(true);
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "base_link",
        trackingMode: "pose",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "other",
        trackingMode: "position",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "base_link",
        trackingMode: "position",
        worldFrameId: "odom",
      }),
    ).toBe(false);
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "base_link",
        trackingMode: "free",
        worldFrameId: "map",
      }),
    ).toBe(false);
  });
});

function remapEvents() {
  return vi
    .mocked(markMcapLatencyEvent)
    .mock.calls.filter(([name]) => name === "3d camera pose remapped");
}

function restoredEvents() {
  return vi
    .mocked(markMcapLatencyEvent)
    .mock.calls.filter(([name]) => name === "3d view state restored");
}

function cameraRestore(
  overrides: Partial<NonNullable<TrackingProps["restore"]>>,
): NonNullable<TrackingProps["restore"]> {
  return {
    cameraView: null,
    trackingAnchor: null,
    trackingMode: null,
    ...overrides,
  };
}

function trackingAnchor(
  overrides: Partial<Mcap3dCameraTrackingAnchor>,
): Mcap3dCameraTrackingAnchor {
  return {
    mode: "position",
    relativePosition: [5, 0, 10],
    relativeTarget: [5, 0, 0],
    targetFrameId: "base_link",
    worldFrameId: "map",
    ...overrides,
  };
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
