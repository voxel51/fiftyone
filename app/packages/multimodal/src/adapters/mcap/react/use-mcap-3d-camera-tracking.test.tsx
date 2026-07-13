import { act, cleanup, renderHook } from "@testing-library/react";
import { Quaternion, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PointCloudVisualization } from "../../../decoders";
import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";
import { EMPTY_MCAP_FRAME_GRAPH_SUMMARY } from "../frame-transforms";
import type { Mcap3dCameraTrackingAnchor } from "./mcap-3d-camera";
import {
  createMcap3dViewStateStore,
  type Mcap3dViewStateStore,
} from "./mcap-3d-view-state";
import {
  mcap3dCameraPoseRestoreApplies,
  useMcap3dCameraTracking,
} from "./use-mcap-3d-camera-tracking";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

let viewStateStore: Mcap3dViewStateStore;

beforeEach(() => {
  viewStateStore = createMcap3dViewStateStore();
  viewStateStore.recordSourceSelection({
    enabledSourceIds: ["lidar"],
    renderableSourceIds: ["lidar"],
  });
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

  it("runs effectively free when automatic targeting has only the reference frame", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        cameraTargetFrameId: "map",
        suspendAutoFollowAtReference: true,
      }),
    });

    expect(result.current.trackingMode).toBe("position");
    expect(result.current.rig.mode).toBe("free");
    expect(result.current.cameraTrackingNotice).toBeNull();

    rerender(
      trackingProps({
        cameraTargetFrameId: "base_link",
        suspendAutoFollowAtReference: false,
      }),
    );
    expect(result.current.rig.mode).toBe("position");
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

  it("streams live rig poses to non-React camera observers", () => {
    const onCameraPoseSample = vi.fn();
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ onCameraPoseSample }),
    });

    act(() => {
      result.current.rig.onPoseSample({ anchor: null, pose: pose(3) });
    });

    expect(onCameraPoseSample).toHaveBeenCalledWith(pose(3));
    expect(result.current.poseCommand).toBeNull();
  });

  it("commits focus poses (recenter, view presets) to the command channel", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });

    act(() => {
      result.current.handleCameraPoseChange(pose(3), "focus");
    });

    expect(result.current.poseCommand).toEqual(pose(3));
    expect(viewStateStore.getSnapshot().cameraView).toEqual({
      pose: pose(3),
      sourceKey: "source-a",
      worldFrameId: "map",
    });
    expect(
      viewStateStore.getSnapshot().navigationCompositions[0]?.trackingMode,
    ).toBe("position");
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

  it("records pose and portable composition at transformed gesture commits", () => {
    const anchor = trackingAnchor({});
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "provisional" }),
    });

    // Provisional placement: neither the pose nor its composition is in the
    // effective world frame yet, so neither is safe to carry forward.
    act(() => {
      result.current.rig.onCommit(pose(4), anchor);
    });
    expect(viewStateStore.getSnapshot().cameraView).toBeNull();
    expect(viewStateStore.getSnapshot().navigationCompositions).toEqual([]);

    rerender(trackingProps({ placementStatus: "transformed" }));
    act(() => {
      result.current.rig.onCommit(pose(5), anchor);
    });
    expect(viewStateStore.getSnapshot().cameraView).toEqual({
      pose: pose(5),
      sourceKey: "source-a",
      worldFrameId: "map",
    });
    expect(viewStateStore.getSnapshot().navigationCompositions[0]).toEqual(
      targetComposition({}),
    );
  });

  it("records the final pose and composition on unmount for mid-gesture hops", () => {
    const anchor = trackingAnchor({});
    const { result, unmount } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });

    // Mid-drag: samples flow through refs, no commit has fired yet.
    act(() => {
      result.current.rig.onPoseSample({ anchor, pose: pose(6) });
    });
    expect(viewStateStore.getSnapshot().cameraView).toBeNull();

    unmount();
    expect(viewStateStore.getSnapshot().cameraView).toEqual({
      pose: pose(6),
      sourceKey: "source-a",
      worldFrameId: "map",
    });
    expect(viewStateStore.getSnapshot().navigationCompositions[0]).toEqual(
      targetComposition({}),
    );
  });

  it("freezes the displayed pose into the command channel on mode switch", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });

    act(() => {
      result.current.rig.onPoseSample({ anchor: null, pose: pose(7) });
    });
    act(() => {
      result.current.setTrackingMode("free");
    });

    expect(result.current.trackingMode).toBe("free");
    expect(result.current.poseCommand).toEqual(pose(7));
    expect(viewStateStore.getSnapshot().trackingMode).toBe("free");
    expect(
      viewStateStore.getSnapshot().navigationCompositions[0]?.trackingMode,
    ).toBe("free");
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

  it("uses the exact transform committed by automatic reference promotion", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });
    act(() => {
      result.current.handleCameraPoseChange(pose(1), "interaction");
    });

    rerender(
      trackingProps({
        frameTransforms: missingTransforms(),
        placementStatus: "transformed",
        worldFrameId: "odom",
        worldFrameTransition: {
          key: "promotion-1",
          sourceFrameId: "map",
          targetFrameId: "odom",
          transform: {
            rotation: new Quaternion(),
            sourceFrameId: "map",
            targetFrameId: "odom",
            translation: new Vector3(10, 0, 0),
          },
        },
      }),
    );

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
      cameraView: {
        pose: pose(7),
        sourceKey: "source-a",
        worldFrameId: "map",
      },
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
      cameraView: {
        pose: pose(7),
        sourceKey: "source-a",
        worldFrameId: "odom",
      },
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
      cameraView: {
        pose: pose(7),
        sourceKey: "source-a",
        worldFrameId: "map",
      },
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

  it("uses target-relative composition instead of raw coordinates across recordings", () => {
    const restore = cameraRestore({
      cameraView: {
        pose: pose(99),
        sourceKey: "source-a",
        worldFrameId: "map",
      },
      navigationCompositions: [targetComposition({})],
    });
    viewStateStore.recordCameraView(restore.cameraView);
    viewStateStore.recordNavigationCompositions(restore.navigationCompositions);
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        restore,
        sourceKey: "source-b",
      }),
    });

    expect(result.current.poseCommand).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
    expect(viewStateStore.getSnapshot().cameraView?.sourceKey).toBe("source-b");
  });

  it("preserves raw world coordinates across recordings in absolute mode", () => {
    const absolutePose = pose(99);
    const restore = cameraRestore({
      cameraView: {
        pose: absolutePose,
        sourceKey: "source-a",
        worldFrameId: "map",
      },
      navigationCompositions: [targetComposition({})],
    });
    viewStateStore.recordCameraView(restore.cameraView);
    viewStateStore.recordNavigationCompositions(restore.navigationCompositions);

    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        cameraNavigationMode: "absolute",
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        restore,
        sourceKey: "source-b",
      }),
    });

    expect(result.current.poseCommand).toEqual(absolutePose);
    expect(viewStateStore.getSnapshot().cameraView).toEqual({
      pose: absolutePose,
      sourceKey: "source-b",
      worldFrameId: "map",
    });
  });

  it("preserves raw world coordinates during a persistent-shell source hop", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        cameraNavigationMode: "absolute",
        placementStatus: "transformed",
      }),
    });
    act(() => {
      result.current.handleCameraPoseChange(pose(7), "focus");
    });

    rerender(
      trackingProps({
        cameraNavigationMode: "absolute",
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        sourceKey: "source-b",
      }),
    );

    expect(result.current.poseCommand).toEqual(pose(7));
    expect(viewStateStore.getSnapshot().cameraView?.sourceKey).toBe("source-b");
  });

  it("starts a new camera epoch when the persistent shell changes sources", () => {
    const anchor = trackingAnchor({});
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });

    act(() => {
      result.current.handleCameraPoseChange(pose(5), "focus");
      result.current.rig.onCommit(pose(5), anchor);
    });
    expect(result.current.poseCommand).toEqual(pose(5));

    // The shell stays mounted while B is loading. A's raw world-space command
    // must be removed immediately rather than pointing B's canvas at A.
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "empty",
        sourceKey: "source-b",
      }),
    );
    expect(result.current.poseCommand).toBeNull();

    // Once B's placement is compatible, resolve the composition relative to
    // B's target instead of reviving A's absolute coordinates.
    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        sourceKey: "source-b",
      }),
    );
    expect(result.current.poseCommand).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
    expect(viewStateStore.getSnapshot().cameraView).toEqual({
      pose: { position: [15, 0, 10], target: [15, 0, 0] },
      sourceKey: "source-b",
      worldFrameId: "map",
    });
  });

  it("carries relative composition through the unbound navigation interval", () => {
    const anchor = trackingAnchor({});
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });

    act(() => {
      result.current.rig.onCommit(pose(5), anchor);
    });
    const carried = viewStateStore.getSnapshot().navigationCompositions;
    expect(carried).toHaveLength(1);

    // The data-stream provider hides A before B is ready. The shell and last
    // scene stay mounted, but this empty key must not consume A's composition.
    rerender(trackingProps({ placementStatus: "transformed", sourceKey: "" }));
    expect(result.current.poseCommand).toBeNull();
    expect(viewStateStore.getSnapshot().navigationCompositions).toEqual(
      carried,
    );

    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "empty",
        sourceKey: "source-b",
      }),
    );
    expect(result.current.poseCommand).toBeNull();
    expect(viewStateStore.getSnapshot().navigationCompositions).toEqual(
      carried,
    );

    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        sourceKey: "source-b",
      }),
    );
    expect(result.current.poseCommand).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
  });

  it("waits for the incoming world-frame choice before restoring relative navigation", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });
    act(() => {
      result.current.rig.onCommit(pose(5), trackingAnchor({}));
    });

    rerender(trackingProps({ placementStatus: "transformed", sourceKey: "" }));
    rerender(
      trackingProps({
        cameraTargetFrameId: "lidar",
        cameraTargetSelectionSource: "auto",
        navigationReferenceSettled: false,
        placementStatus: "transformed",
        sourceKey: "source-b",
        worldFrameId: "lidar",
      }),
    );

    // A local reference is rendered while the incoming graph is still being
    // promoted. Applying here would make the later lidar -> map remap rotate
    // the user's saved orbit a second time.
    expect(result.current.poseCommand).toBeNull();

    rerender(
      trackingProps({
        cameraTargetSelectionSource: "auto",
        frameTransforms: translationTransforms(10, 0, 0),
        navigationReferenceSettled: true,
        placementStatus: "transformed",
        sourceKey: "source-b",
      }),
    );
    expect(result.current.poseCommand).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
  });

  it("rejects relative composition when the source shape changes after loading", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });
    act(() => {
      result.current.rig.onCommit(pose(5), trackingAnchor({}));
    });
    expect(viewStateStore.getSnapshot().navigationCompositions).toHaveLength(1);

    rerender(
      trackingProps({
        placementStatus: "transformed",
        renderableSourceIds: ["radar"],
        sourceKey: "",
      }),
    );
    expect(viewStateStore.getSnapshot().navigationCompositions).toHaveLength(1);

    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        renderableSourceIds: ["radar"],
        sourceKey: "source-b",
      }),
    );
    expect(result.current.poseCommand).toBeNull();
    expect(viewStateStore.getSnapshot().navigationCompositions).toEqual([]);
  });

  it("flushes the latest imperative pose before a persistent-shell source hop", () => {
    const anchor = trackingAnchor({
      relativePosition: [6, 0, 10],
      relativeTarget: [6, 0, 0],
    });
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({ placementStatus: "transformed" }),
    });

    // Navigation can replace the source before OrbitControls emits its gesture
    // commit. The latest sample must still seed B's portable composition.
    act(() => {
      result.current.rig.onPoseSample({ anchor, pose: pose(6) });
    });
    expect(viewStateStore.getSnapshot().navigationCompositions).toEqual([]);

    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "empty",
        sourceKey: "source-b",
      }),
    );
    expect(viewStateStore.getSnapshot().navigationCompositions[0]).toEqual(
      targetComposition({
        relativePosition: [6, 0, 10],
        relativeTarget: [6, 0, 0],
      }),
    );

    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        sourceKey: "source-b",
      }),
    );
    expect(result.current.poseCommand).toEqual({
      position: [16, 0, 10],
      target: [16, 0, 0],
    });
  });

  it("preserves a carried composition's tracking mode across a source hop", () => {
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps(),
    });
    viewStateStore.recordNavigationCompositions([
      targetComposition({ trackingMode: "free" }),
    ]);

    rerender(
      trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        sourceKey: "source-b",
      }),
    );

    expect(result.current.trackingMode).toBe("free");
    expect(result.current.poseCommand).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
    expect(
      viewStateStore.getSnapshot().navigationCompositions[0]?.trackingMode,
    ).toBe("free");
  });

  it("falls back to bounds composition when target semantics are incompatible", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        cameraTargetSelectionSource: "user",
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        restore: cameraRestore({
          navigationCompositions: [
            targetComposition({ targetFrameId: "vehicle" }),
            boundsComposition(),
          ],
        }),
        sourceKey: "source-b",
      }),
    });

    expect(result.current.poseCommand).toBeNull();
    act(() => {
      result.current.noteRenderedCameraPose(pose(0), {
        center: [100, 0, 0],
        radius: 10,
      });
    });
    expect(result.current.poseCommand).toEqual({
      position: [100, 0, 20],
      target: [100, 0, 0],
    });
  });

  it("resolves automatic navigation against the carried semantic target", () => {
    const restore = cameraRestore({
      navigationCompositions: [targetComposition({}), boundsComposition()],
    });
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        cameraTargetFrameId: "LIDAR_TOP",
        cameraTargetSelectionSource: "auto",
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        restore,
        sourceKey: "source-b",
      }),
    });

    expect(result.current.poseCommand).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
    act(() => {
      result.current.noteRenderedCameraPose(pose(0), {
        center: [100, 0, 0],
        radius: 10,
      });
    });
    expect(result.current.poseCommand).toEqual({
      position: [15, 0, 10],
      target: [15, 0, 0],
    });
  });

  it("falls back to bounds after transform discovery fails", () => {
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        cameraTargetFrameId: "LIDAR_TOP",
        cameraTargetSelectionSource: "auto",
        frameTransforms: {
          ...missingTransforms(),
          error: "transform discovery failed",
          status: "error",
        },
        placementStatus: "transformed",
        restore: cameraRestore({
          navigationCompositions: [targetComposition({}), boundsComposition()],
        }),
        sourceKey: "source-b",
      }),
    });

    act(() => {
      result.current.noteRenderedCameraPose(pose(0), {
        center: [100, 0, 0],
        radius: 10,
      });
    });
    expect(result.current.poseCommand).toEqual({
      position: [100, 0, 20],
      target: [100, 0, 0],
    });
  });

  it("rejects navigation composition when the 3D source family changed", () => {
    const compositions = [targetComposition({})];
    viewStateStore.recordNavigationCompositions(compositions);
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        renderableSourceIds: ["lidar-b"],
        restore: cameraRestore({
          navigationCompositions: compositions,
          renderableSourceIds: ["lidar-a"],
        }),
        sourceKey: "source-b",
      }),
    });

    expect(result.current.poseCommand).toBeNull();
    expect(result.current.rig.adoptAnchor).toBeNull();
    expect(viewStateStore.getSnapshot().navigationCompositions).toEqual([]);
  });

  it("does not let an unresolved intermediate sample replace the carried candidate", () => {
    const carried = targetComposition({ relativePosition: [9, 0, 10] });
    viewStateStore.recordNavigationCompositions([carried]);
    const { result, unmount } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        cameraTargetFrameId: "",
        placementStatus: "transformed",
        restore: cameraRestore({ navigationCompositions: [carried] }),
        sourceKey: "source-b",
      }),
    });

    act(() => {
      result.current.noteRenderedCameraPose(pose(2), {
        center: [2, 0, 0],
        radius: 10,
      });
    });
    unmount();

    expect(viewStateStore.getSnapshot().navigationCompositions).toEqual([
      carried,
    ]);
    expect(viewStateStore.getSnapshot().cameraView).toBeNull();
  });

  it("hands a matching follow-mode tracking anchor to the rig for adoption", () => {
    const anchor = trackingAnchor({});
    const { result } = renderHook(useMcap3dCameraTracking, {
      initialProps: trackingProps({
        frameTransforms: translationTransforms(10, 0, 0),
        placementStatus: "transformed",
        restore: cameraRestore({
          navigationCompositions: [targetComposition({})],
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
        placementStatus: "transformed",
        restore: cameraRestore({
          navigationCompositions: [
            targetComposition({ targetFrameId: "other" }),
          ],
          trackingMode: "position",
        }),
      }),
    });

    expect(result.current.trackingMode).toBe("position");
    expect(result.current.rig.adoptAnchor).toBeNull();
  });

  it("abandons a pending anchor restore when the user grabs the camera first", () => {
    const restore = cameraRestore({
      navigationCompositions: [targetComposition({})],
      trackingMode: "position",
    });
    const { rerender, result } = renderHook(useMcap3dCameraTracking, {
      // The anchor's target frame is not effective yet, so the restore pends.
      initialProps: trackingProps({
        cameraTargetFrameId: "",
        placementStatus: "transformed",
        restore,
      }),
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
        currentSourceKey: "source-a",
        placementStatus: "transformed",
        restoreSourceKey: "source-a",
        restoreWorldFrameId: "map",
        worldFrameId: "map",
      }),
    ).toBe(true);
    expect(
      mcap3dCameraPoseRestoreApplies({
        currentSourceKey: "source-b",
        placementStatus: "transformed",
        restoreSourceKey: "source-a",
        restoreWorldFrameId: "map",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dCameraPoseRestoreApplies({
        currentSourceKey: "source-a",
        placementStatus: "provisional",
        restoreSourceKey: "source-a",
        restoreWorldFrameId: "map",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dCameraPoseRestoreApplies({
        currentSourceKey: "source-a",
        placementStatus: "transformed",
        restoreSourceKey: "source-a",
        restoreWorldFrameId: "odom",
        worldFrameId: "map",
      }),
    ).toBe(false);
    expect(
      mcap3dCameraPoseRestoreApplies({
        currentSourceKey: "",
        placementStatus: "transformed",
        restoreSourceKey: "",
        restoreWorldFrameId: "",
        worldFrameId: "",
      }),
    ).toBe(false);
  });
});

function cameraRestore(
  overrides: Partial<NonNullable<TrackingProps["restore"]>>,
): NonNullable<TrackingProps["restore"]> {
  return {
    cameraView: null,
    navigationCompositions: [],
    renderableSourceIds: ["lidar"],
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

function targetComposition(
  overrides: Partial<
    Extract<
      NonNullable<TrackingProps["restore"]>["navigationCompositions"][number],
      { kind: "target-relative" }
    >
  >,
) {
  return {
    kind: "target-relative" as const,
    relativePosition: [5, 0, 10] as const,
    relativeTarget: [5, 0, 0] as const,
    rotationMode: "position" as const,
    sceneUpAxis: "z" as const,
    targetFrameId: "base_link",
    trackingMode: "position" as const,
    ...overrides,
  };
}

function boundsComposition() {
  return {
    distanceInRadii: 2,
    kind: "bounds-normalized" as const,
    sceneUpAxis: "z" as const,
    targetOffsetInRadii: [0, 0, 0] as const,
    trackingMode: "free" as const,
    viewDirection: [0, 0, 1] as const,
  };
}

function trackingProps(overrides: Partial<TrackingProps> = {}): TrackingProps {
  return {
    cameraTargetFrameId: "base_link",
    cameraTargetSelectionSource: "user",
    frameTransforms: translationTransforms(0, 0, 0),
    navigationReferenceSettled: true,
    placementStatus: "empty",
    playbackTimeNs: 0n,
    provisionalFrameIds: [],
    provisionalPlaybackFrame: null,
    renderableSourceIds: ["lidar"],
    sceneUpAxis: "z",
    selectedTopicsKey: "topics",
    sourceKey: "source-a",
    viewStateStore,
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
