import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PointCloudVisualization } from "../../../decoders";
import type { McapFrameGraphSummary } from "../frame-transforms";
import { markMcapLatencyEvent } from "../mcap-latency-debug";
import {
  createMcap3dViewStateStore,
  type Mcap3dViewStateStore,
} from "./mcap-3d-view-state";
import { useMcap3dFrameSelection } from "./use-mcap-3d-frame-selection";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

vi.mock("../mcap-latency-debug", () => ({
  markMcapLatencyEvent: vi.fn(),
}));

let viewStateStore: Mcap3dViewStateStore;

beforeEach(() => {
  vi.mocked(markMcapLatencyEvent).mockClear();
  viewStateStore = createMcap3dViewStateStore();
});

afterEach(() => {
  cleanup();
});

type FrameSelectionProps = Parameters<typeof useMcap3dFrameSelection>[0];
type TransformEdge = readonly [parentFrameId: string, childFrameId: string];

describe("useMcap3dFrameSelection", () => {
  it("defaults map plus base_link logs to stable world and ego target", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([
          ["map", "base_link"],
          ["base_link", "lidar"],
        ]),
      }),
    });

    expect(result.current.frameIds).toEqual(["base_link", "lidar", "map"]);
    expect(result.current.worldFrameId).toBe("map");
    expect(result.current.cameraTargetFrameId).toBe("base_link");
    expect(result.current.worldFrameSelectionSource).toBe("auto");
  });

  it("keeps the user's world frame while it exists and degrades when it disappears", () => {
    const { rerender, result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([
          ["odom", "map"],
          ["map", "base_link"],
        ]),
      }),
    });

    expect(result.current.worldFrameId).toBe("map");

    act(() => {
      result.current.updateWorldFrameId("odom");
    });
    expect(result.current.worldFrameId).toBe("odom");
    expect(result.current.worldFrameSelectionSource).toBe("user");

    rerender(
      selectionProps({
        frameTransforms: transforms([
          ["odom", "map"],
          ["map", "base_link"],
        ]),
      }),
    );
    expect(result.current.worldFrameId).toBe("odom");

    rerender(
      selectionProps({ frameTransforms: transforms([["map", "base_link"]]) }),
    );
    expect(result.current.worldFrameId).toBe("map");
    // The user's choice degrades silently; the selection-source flag stays.
    expect(result.current.worldFrameSelectionSource).toBe("user");
  });

  it("uses the TF root instead of an early optical frame in sensor-arm graphs", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([
          ["link0", "camera_color_optical_frame"],
          ["link0", "wrist_link"],
          ["wrist_link", "realsense_depth_optical_frame"],
        ]),
      }),
    });

    expect(result.current.worldFrameId).toBe("link0");
    expect(result.current.worldFrameId).not.toContain("optical");
  });

  it("falls back to ego world names in rootless graphs without data rank", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([
          ["camera", "base_link"],
          ["base_link", "camera"],
        ]),
      }),
    });

    expect(result.current.worldFrameId).toBe("base_link");
  });

  it("falls back to the first non-optical TF frame when no better default exists", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([
          ["z_frame", "a_frame"],
          ["a_frame", "z_frame"],
          ["a_frame", "camera_optical_frame"],
        ]),
      }),
    });

    expect(result.current.worldFrameId).toBe("a_frame");
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
        frameTransforms: transforms([["zzz_frame", "sensor_mount"]]),
      }),
    );
    expect(result.current.frameIds).toEqual([
      "lidar_data",
      "sensor_mount",
      "zzz_frame",
    ]);
    expect(result.current.worldFrameId).toBe("zzz_frame");
    expect(result.current.cameraTargetFrameId).toBe("zzz_frame");
  });

  it("prefers ego frames over the world frame for the camera target", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([["map", "base_link"]]),
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
        frameTransforms: transforms([["world", "odom"]]),
      }),
    });

    expect(result.current.worldFrameId).toBe("world");
    expect(result.current.cameraTargetFrameId).toBe("world");
  });

  it("uses a unique namespaced ego suffix for the camera target", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([
          ["robot/map", "robot/base_link"],
          ["robot/base_link", "robot/lidar"],
        ]),
      }),
    });

    expect(result.current.worldFrameId).toBe("robot/map");
    expect(result.current.cameraTargetFrameId).toBe("robot/base_link");
  });

  it("does not guess an ambiguous namespaced ego suffix for the camera target", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([
          ["map", "robot_a/base_link"],
          ["map", "robot_b/base_link"],
        ]),
      }),
    });

    expect(result.current.worldFrameId).toBe("map");
    expect(result.current.cameraTargetFrameId).toBe("map");
  });

  it("adopts carried-over user frames once they appear in the streaming inventory", () => {
    const { rerender, result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([["map", "base_link"]]),
        restore: {
          userCameraTargetFrameId: "ego_vehicle",
          userWorldFrameId: "odom",
        },
      }),
    });

    // Until the carried frames (re)appear, auto-selection runs untouched.
    expect(result.current.worldFrameId).toBe("map");
    expect(result.current.worldFrameSelectionSource).toBe("auto");
    expect(result.current.cameraTargetFrameId).toBe("base_link");

    rerender(
      selectionProps({
        frameTransforms: transforms([
          ["map", "base_link"],
          ["map", "ego_vehicle"],
        ]),
        restore: {
          userCameraTargetFrameId: "ego_vehicle",
          userWorldFrameId: "odom",
        },
      }),
    );
    // The camera target adopted; the world frame is still pending.
    expect(result.current.cameraTargetFrameId).toBe("ego_vehicle");
    expect(result.current.cameraTargetSelectionSource).toBe("user");
    expect(result.current.worldFrameId).toBe("map");

    rerender(
      selectionProps({
        frameTransforms: transforms([
          ["odom", "map"],
          ["map", "base_link"],
          ["map", "ego_vehicle"],
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
        frameTransforms: transforms([["map", "base_link"]]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "gone" },
      }),
    });

    rerender(
      selectionProps({
        frameTransforms: transforms([
          ["odom", "map"],
          ["map", "base_link"],
        ]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "gone" },
      }),
    );

    expect(result.current.worldFrameId).toBe("map");
    expect(result.current.worldFrameSelectionSource).toBe("auto");
    expect(restoredFrameEvents()).toHaveLength(0);
  });

  it("cancels the pending adoption when the user selects a frame first", () => {
    const { rerender, result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([["map", "base_link"]]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "odom" },
      }),
    });

    act(() => {
      result.current.updateWorldFrameId("map");
    });
    rerender(
      selectionProps({
        frameTransforms: transforms([
          ["odom", "map"],
          ["map", "base_link"],
        ]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "odom" },
      }),
    );

    expect(result.current.worldFrameId).toBe("map");
    expect(restoredFrameEvents()).toHaveLength(0);
  });

  it("writes user frame selections through to the view-state store", () => {
    const { result } = renderHook(useMcap3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: transforms([
          ["odom", "map"],
          ["map", "base_link"],
        ]),
      }),
    });

    expect(viewStateStore.getSnapshot().userWorldFrameId).toBeNull();

    act(() => {
      result.current.updateWorldFrameId("odom");
      result.current.updateCameraTargetFrameId("map");
    });
    expect(viewStateStore.getSnapshot()).toMatchObject({
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
    viewStateStore,
    ...overrides,
  };
}

function transforms(edges: readonly TransformEdge[]): McapFrameTransformsState {
  const frameIds = uniqueSortedFrameIds(edges.flatMap((edge) => [...edge]));

  return {
    error: null,
    frameIds,
    getPlacementReadiness: () => ({ frameIds: [], status: "ready" }),
    indexedDynamicRanges: () => [],
    prefetchPlacement: () => undefined,
    resolve: (sourceFrameId, targetFrameId) => ({
      sourceFrameId,
      status: "missing",
      targetFrameId,
    }),
    status: frameIds.length > 0 ? "ready" : "loading",
    summarizeGraph: (dataBearingFrameIds) =>
      summarizeGraph(edges, dataBearingFrameIds),
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

function summarizeGraph(
  edges: readonly TransformEdge[],
  dataBearingFrameIds: ReadonlySet<string>,
): McapFrameGraphSummary {
  if (edges.length === 0) {
    return {
      dataBearingReachableCountsByFrameId: new Map(),
      reachableCountsByFrameId: new Map(),
      roots: [],
      tfConnectedFrameIds: [],
    };
  }

  const childFrameIds = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  const frameIds = new Set<string>();
  const parentFrameIds = new Set<string>();
  for (const [parentFrameId, childFrameId] of edges) {
    childFrameIds.add(childFrameId);
    frameIds.add(parentFrameId);
    frameIds.add(childFrameId);
    parentFrameIds.add(parentFrameId);
    childrenByParent.set(parentFrameId, [
      ...(childrenByParent.get(parentFrameId) ?? []),
      childFrameId,
    ]);
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareFrameIds);
  }

  const tfConnectedFrameIds = [...frameIds].sort(compareFrameIds);
  const roots = [...parentFrameIds]
    .filter((frameId) => !childFrameIds.has(frameId))
    .sort(compareFrameIds);
  const reachableCountsByFrameId = new Map<string, number>();
  const dataBearingReachableCountsByFrameId = new Map<string, number>();
  for (const frameId of tfConnectedFrameIds) {
    const reachableFrameIds = reachableFrameIdsFrom(frameId, childrenByParent);
    reachableCountsByFrameId.set(frameId, reachableFrameIds.length);
    dataBearingReachableCountsByFrameId.set(
      frameId,
      reachableFrameIds.filter((reachableFrameId) =>
        dataBearingFrameIds.has(reachableFrameId),
      ).length,
    );
  }

  return {
    dataBearingReachableCountsByFrameId,
    reachableCountsByFrameId,
    roots,
    tfConnectedFrameIds,
  };
}

function reachableFrameIdsFrom(
  frameId: string,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
) {
  const reachableFrameIds: string[] = [];
  const visited = new Set<string>();
  const stack = [frameId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    reachableFrameIds.push(current);
    const children = childrenByParent.get(current) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child && !visited.has(child)) {
        stack.push(child);
      }
    }
  }

  return reachableFrameIds;
}

function uniqueSortedFrameIds(frameIds: readonly string[]) {
  return [...new Set(frameIds)].sort(compareFrameIds);
}

function compareFrameIds(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
