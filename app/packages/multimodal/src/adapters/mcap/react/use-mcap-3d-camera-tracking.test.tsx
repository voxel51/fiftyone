import { act, cleanup, renderHook } from "@testing-library/react";
import { Quaternion, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PointCloudVisualization } from "../../../decoders";
import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";
import { EMPTY_MCAP_FRAME_GRAPH_SUMMARY } from "../frame-transforms";
import type { Mcap3dCameraTrackingAnchor } from "./mcap-3d-camera";
import {
  getMcap3dViewStateSnapshot,
  resetMcap3dViewStateForTests,
} from "./mcap-3d-view-state";
import {
  mcap3dCameraPoseRestoreApplies,
  mcap3dTrackingAnchorRestoreApplies,
  useMcap3dCameraTracking,
} from "./use-mcap-3d-camera-tracking";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

beforeEach(() => {
  resetMcap3dViewStateForTests();
});

afterEach(() => {
  cleanup();
});

type TrackingProps = Parameters<typeof useMcap3dCameraTracking>[0];

describe("useMcap3dCameraTracking", () => {
  it("defaults to follow position with no pose command", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps(),
    });

    expect(result.current.trackingMode).toBe("position");
    expect(result.current.rig.mode).toBe("position");
    expect(result.current.poseCommand).toBeNull();
  });

  it("keeps interaction and initial traffic out of React state", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps(),
    });

    // Per-event interaction emissions and panel-fit initial emissions are
    // bookkeeping only: the rig owns interactive motion imperatively, and a
    // state write here would re-render the tile per pointer move.
    act(() => {
      result.current.handleCameraPoseChange(pose(1), "interaction");
      result.current.handleCameraPoseChange(pose(2), "initial");
    });

    expect(result.current.poseCommand).toBeNull();
    expect(result.current.getDisplayedCameraPose()).toEqual(pose(2));
  });

  it("commits focus poses (recenter, view presets) to the command channel", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });

    act(() => {
      result.current.handleCameraPoseChange(pose(3), "focus");
    });

    expect(result.current.poseCommand).toEqual(pose(3));
    expect(getMcap3dViewStateSnapshot().cameraView).toEqual({
      pose: pose(3),
      worldFrameId: "map",
    });
  });

  it("pins the fit fallback at gesture start exactly once", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps(),
    });

    act(() => {
      result.current.rig.onGestureStart(pose(1));
    });
    expect(result.current.poseCommand).toEqual(pose(1));

    // Wheel micro-gestures re-enter gesture start; the pin must not churn.
    const pinned = result.current.poseCommand;
    act(() => {
      result.current.rig.onGestureStart(pose(9));
    });
    expect(result.current.poseCommand).toBe(pinned);
  });

  it("records pose and anchor at gesture commits, gated on placement", () => {
    const anchor = trackingAnchor({});
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "provisional" }),
    });

    // Provisional placement: the pose is not a world-frame pose yet, but the
    // anchor carries its own frame gates and is always safe to record.
    act(() => {
      result.current.rig.onCommit(pose(4), anchor);
    });
    expect(getMcap3dViewStateSnapshot().cameraView).toBeNull();
    expect(getMcap3dViewStateSnapshot().trackingAnchor).toEqual(anchor);

    rerender(trackingProps({ placementStatus: "transformed" }));
    act(() => {
      result.current.rig.onCommit(pose(5), anchor);
    });
    expect(getMcap3dViewStateSnapshot().cameraView).toEqual({
      pose: pose(5),
      worldFrameId: "map",
    });
  });

  it("records the final pose and anchor on unmount for mid-gesture hops", () => {
    const anchor = trackingAnchor({});
    const { result, unmount } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });

    // Mid-drag: samples flow through refs, no commit has fired yet.
    act(() => {
      result.current.rig.onPoseSample({ anchor, pose: pose(6) });
    });
    expect(getMcap3dViewStateSnapshot().cameraView).toBeNull();

    unmount();
    expect(getMcap3dViewStateSnapshot().cameraView).toEqual({
      pose: pose(6),
      worldFrameId: "map",
    });
    expect(getMcap3dViewStateSnapshot().trackingAnchor).toEqual(anchor);
  });

  it("freezes the displayed pose into the command channel on mode switch", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps(),
    });

    act(() => {
      result.current.rig.onPoseSample({ anchor: null, pose: pose(7) });
    });
    act(() => {
      result.current.setTrackingMode("free");
    });

    expect(result.current.trackingMode).toBe("free");
    expect(result.current.poseCommand).toEqual(pose(7));
    expect(getMcap3dViewStateSnapshot().trackingMode).toBe("free");
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

    expect(result.current.poseCommand).toEqual({
      position: [11, 0, 10],
      target: [11, 0, 0],
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

    expect(result.current.poseCommand).toEqual({
      position: [11, 0, 10],
      target: [11, 0, 0],
    });
  });

  it("skips the provisional remap when a matching follow anchor governs", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "provisional",
        provisionalFrameIds: ["lidar"],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
      }),
    });

    act(() => {
      result.current.handleCameraPoseChange(pose(1), "interaction");
      // The rig derived a matching anchor: follow governs the camera.
      result.current.rig.onPoseSample({
        anchor: trackingAnchor({}),
        pose: pose(1),
      });
    });
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        provisionalFrameIds: [],
        provisionalPlaybackFrame: provisionalFrame("lidar", 5n),
      }),
    );

    expect(result.current.poseCommand).toBeNull();
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

    expect(result.current.poseCommand).toBeNull();
  });
});

describe("useMcap3dCameraTracking world-frame changes", () => {
  it("remaps the camera pose through the old→new world transform", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
      }),
    });

    act(() => {
      result.current.handleCameraPoseChange(pose(1), "interaction");
    });
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        worldFrameId: "odom",
      }),
    );

    // Content re-places through T(odom ← map) = +10 on x; the camera rides
    // the same transform so the on-screen view is unchanged.
    expect(result.current.poseCommand).toEqual({
      position: [11, 0, 10],
      target: [11, 0, 0],
    });
  });

  it("drops the pose command (fit-pin included) when the world frames have no path", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        placementStatus: "transformed",
      }),
    });

    // The user has interacted: the fit fallback is pinned out.
    act(() => {
      result.current.rig.onGestureStart(pose(1));
    });
    expect(result.current.poseCommand).toEqual(pose(1));

    rerender(
      trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "transformed",
        worldFrameId: "odom",
      }),
    );

    // A stale-frame pose is worse than a refit: the command AND the latch
    // are dropped so the panel falls back to fitting the re-placed scene.
    expect(result.current.poseCommand).toBeNull();
    expect(result.current.getDisplayedCameraPose()).toBeNull();
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
    expect(result.current.poseCommand).toEqual(pose(7));
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
    expect(result.current.poseCommand).toEqual({
      position: [11, 0, 10],
      target: [11, 0, 0],
    });

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
    expect(result.current.poseCommand).toEqual(pose(7));
  });

  it("abandons the pose restore when the user grabs the camera first", () => {
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
      result.current.rig.onGestureStart(pose(3));
    });
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        restore,
      }),
    );

    expect(result.current.poseCommand).toEqual(pose(3));
  });

  it("hands a matching follow-mode tracking anchor to the rig for adoption", () => {
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
    expect(result.current.rig.adoptAnchor).toEqual(anchor);
  });

  it("does not hand over an anchor whose frames differ from the effective selections", () => {
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
    expect(result.current.rig.adoptAnchor).toBeNull();
  });

  it("abandons a pending anchor restore when the user grabs the camera first", () => {
    const restore = cameraRestore({
      trackingAnchor: trackingAnchor({}),
      trackingMode: "position",
    });
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      // The anchor's target frame is not effective yet, so the restore pends.
      initialProps: trackingProps({ cameraTargetFrameId: "", restore }),
    });

    expect(result.current.rig.adoptAnchor).toBeNull();
    act(() => {
      result.current.rig.onGestureStart(pose(1));
    });
    rerender(trackingProps({ restore }));

    // The user's grab wins; the carried anchor never lands.
    expect(result.current.rig.adoptAnchor).toBeNull();
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

  it("gates the tracking anchor on mode, scene-up, and both frame ids", () => {
    const anchor = trackingAnchor({});
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "base_link",
        sceneUpAxis: "z",
        trackingMode: "position",
        worldFrameId: "map",
      }),
    ).toBe(true);
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "base_link",
        sceneUpAxis: "z",
        trackingMode: "pose",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "other",
        sceneUpAxis: "z",
        trackingMode: "position",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "base_link",
        sceneUpAxis: "z",
        trackingMode: "position",
        worldFrameId: "odom",
      }),
    ).toBe(false);
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "base_link",
        sceneUpAxis: "y",
        trackingMode: "position",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dTrackingAnchorRestoreApplies({
        anchor,
        cameraTargetFrameId: "base_link",
        sceneUpAxis: "z",
        trackingMode: "free",
        worldFrameId: "map",
      }),
    ).toBe(false);
  });
});

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
    sceneUpAxis: "z",
    targetFrameId: "base_link",
    worldFrameId: "map",
    ...overrides,
  };
}

function trackingProps(overrides: Partial<TrackingProps> = {}): TrackingProps {
  return {
    cameraTargetFrameId: "base_link",
    frameTransforms: translationTransforms(0, 0, 0),
    placementStatus: "empty",
    playbackTimeNs: 0n,
    provisionalFrameIds: [],
    provisionalPlaybackFrame: null,
    sceneUpAxis: "z",
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
    getPlacementReadiness: () => ({ frameIds: [], status: "ready" }),
    indexedDynamicRanges: () => [],
    prefetchPlacement: () => undefined,
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
    summarizeGraph: () => EMPTY_MCAP_FRAME_GRAPH_SUMMARY,
  };
}

function missingTransforms(): McapFrameTransformsState {
  return {
    error: null,
    frameIds: [],
    getPlacementReadiness: () => ({
      frameIds: ["lidar"],
      status: "definitiveMissing",
    }),
    indexedDynamicRanges: () => [],
    prefetchPlacement: () => undefined,
    resolve: (sourceFrameId, targetFrameId) => ({
      sourceFrameId,
      status: "missing",
      targetFrameId,
    }),
    status: "loading",
    summarizeGraph: () => EMPTY_MCAP_FRAME_GRAPH_SUMMARY,
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
