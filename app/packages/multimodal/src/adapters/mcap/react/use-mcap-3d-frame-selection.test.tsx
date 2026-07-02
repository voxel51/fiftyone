import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PointCloudVisualization } from "../../../decoders";
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import {
  getMcap3dViewStateSnapshot,
  resetMcap3dViewStateForTests,
} from "./mcap-3d-view-state";
import { useMcap3dFrameSelection } from "./use-mcap-3d-frame-selection";
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

type FrameSelectionProps = Parameters<typeof useMcap3dFrameSelection>[0];

describe("useMcap3dFrameSelection", () => {
  it("auto-selects the most-preferred world frame present", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms(["lidar", "map", "base_link"]),
      }),
    });

    expect(result.current.frameIds).toEqual(["base_link", "lidar", "map"]);
    expect(result.current.worldFrameId).toBe("base_link");
    expect(result.current.cameraTargetFrameId).toBe("base_link");
    expect(result.current.worldFrameSelectionSource).toBe("auto");
  });

  it("keeps the user's world frame while it exists and degrades when it disappears", () => {
    const { rerender, result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms(["base_link", "map", "odom"]),
      }),
    });

    expect(result.current.worldFrameId).toBe("base_link");

    act(() => {
      result.current.updateWorldFrameId("odom");
    });
    expect(result.current.worldFrameId).toBe("odom");
    expect(result.current.worldFrameSelectionSource).toBe("user");

    rerender(
      selectionProps({
        frameTransforms: transforms(["base_link", "map", "odom"]),
      }),
    );
    expect(result.current.worldFrameId).toBe("odom");

    rerender(
      selectionProps({ frameTransforms: transforms(["base_link", "map"]) }),
    );
    expect(result.current.worldFrameId).toBe("base_link");
    // The user's choice degrades silently; the selection-source flag stays.
    expect(result.current.worldFrameSelectionSource).toBe("user");
  });

  it("does not lock onto a data frame before transform frame ids arrive", () => {
    const { rerender, result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frames: [pointCloudFrame("lidar_data")],
      }),
    });

    expect(result.current.frameIds).toEqual(["lidar_data"]);
    expect(result.current.worldFrameId).toBe("");
    expect(result.current.cameraTargetFrameId).toBe("");

    rerender(
      selectionProps({
        frames: [pointCloudFrame("lidar_data")],
        frameTransforms: transforms(["zzz_frame"]),
      }),
    );
    expect(result.current.frameIds).toEqual(["lidar_data", "zzz_frame"]);
    expect(result.current.worldFrameId).toBe("lidar_data");
  });

  it("prefers ego frames over the world frame for the camera target", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms(["base_link", "map"]),
      }),
    });

    act(() => {
      result.current.updateWorldFrameId("map");
    });

    expect(result.current.worldFrameId).toBe("map");
    expect(result.current.cameraTargetFrameId).toBe("base_link");
  });

  it("falls back to the world frame for the camera target when no ego frame exists", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms(["odom", "world"]),
      }),
    });

    expect(result.current.worldFrameId).toBe("world");
    expect(result.current.cameraTargetFrameId).toBe("world");
  });

  it("adopts carried-over user frames once they appear in the streaming inventory", () => {
    const { rerender, result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms(["base_link", "map"]),
        restore: {
          userCameraTargetFrameId: "ego_vehicle",
          userWorldFrameId: "odom",
        },
      }),
    });

    // Until the carried frames (re)appear, auto-selection runs untouched.
    expect(result.current.worldFrameId).toBe("base_link");
    expect(result.current.worldFrameSelectionSource).toBe("auto");
    expect(result.current.cameraTargetFrameId).toBe("base_link");

    rerender(
      selectionProps({
        frameTransforms: transforms(["base_link", "ego_vehicle", "map"]),
        restore: {
          userCameraTargetFrameId: "ego_vehicle",
          userWorldFrameId: "odom",
        },
      }),
    );
    // The camera target adopted; the world frame is still pending.
    expect(result.current.cameraTargetFrameId).toBe("ego_vehicle");
    expect(result.current.cameraTargetSelectionSource).toBe("user");
    expect(result.current.worldFrameId).toBe("base_link");

    rerender(
      selectionProps({
        frameTransforms: transforms([
          "base_link",
          "ego_vehicle",
          "map",
          "odom",
        ]),
        restore: {
          userCameraTargetFrameId: "ego_vehicle",
          userWorldFrameId: "odom",
        },
      }),
    );
    expect(result.current.worldFrameId).toBe("odom");
    expect(result.current.worldFrameSelectionSource).toBe("user");
    expect(restoredFrameEvents().map(([, detail]) => detail)).toEqual([
      { field: "cameraTargetFrameId", frameId: "ego_vehicle" },
      { field: "worldFrameId", frameId: "odom" },
    ]);
  });

  it("never pins a carried-over frame that does not reappear", () => {
    const { rerender, result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms(["base_link", "map"]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "gone" },
      }),
    });

    rerender(
      selectionProps({
        frameTransforms: transforms(["base_link", "map", "odom"]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "gone" },
      }),
    );

    expect(result.current.worldFrameId).toBe("base_link");
    expect(result.current.worldFrameSelectionSource).toBe("auto");
    expect(restoredFrameEvents()).toHaveLength(0);
  });

  it("cancels the pending adoption when the user selects a frame first", () => {
    const { rerender, result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms(["base_link", "map"]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "odom" },
      }),
    });

    act(() => {
      result.current.updateWorldFrameId("map");
    });
    rerender(
      selectionProps({
        frameTransforms: transforms(["base_link", "map", "odom"]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "odom" },
      }),
    );

    expect(result.current.worldFrameId).toBe("map");
    expect(restoredFrameEvents()).toHaveLength(0);
  });

  it("writes user frame selections through to the view-state store", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms(["base_link", "map", "odom"]),
      }),
    });

    expect(getMcap3dViewStateSnapshot().userWorldFrameId).toBeNull();

    act(() => {
      result.current.updateWorldFrameId("odom");
      result.current.updateCameraTargetFrameId("map");
    });
    expect(getMcap3dViewStateSnapshot()).toMatchObject({
      userCameraTargetFrameId: "map",
      userWorldFrameId: "odom",
    });
  });
});

function restoredFrameEvents() {
  return vi
    .mocked(markMcapLatencyEvent)
    .mock.calls.filter(([name]) => name === "3d view state restored");
}

function selectionProps(
  overrides: Partial<FrameSelectionProps> = {},
): FrameSelectionProps {
  return {
    annotationFrames: [],
    calibrationFrames: [],
    frames: [],
    frameTransforms: transforms([]),
    gridFrames: [],
    ...overrides,
  };
}

function transforms(frameIds: readonly string[]): McapFrameTransformsState {
  return {
    error: null,
    frameIds,
    resolve: (sourceFrameId, targetFrameId) => ({
      sourceFrameId,
      status: "missing",
      targetFrameId,
    }),
    status: frameIds.length > 0 ? "ready" : "loading",
  };
}

function pointCloudFrame(
  frameId: string,
): McapTopicPlaybackFrame<PointCloudVisualization> {
  return {
    ageNs: 0n,
    contentTimeNs: 0n,
    frame: {
      coordinateFrameId: frameId,
    } as unknown as PointCloudVisualization,
    requestedTimeNs: 0n,
  };
}
