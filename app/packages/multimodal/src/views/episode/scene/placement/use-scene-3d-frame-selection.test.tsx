import { act, cleanup, renderHook } from "@testing-library/react";
import { Quaternion, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PointCloudVisualization } from "../../../../ir/index";
import type { EpisodeFrameGraphSummary } from "../../../../runtime/frame-transforms";
import { markEpisodeLatencyEvent } from "../../../../observability/episode-latency";
import {
  createScene3dViewStateStore,
  type Scene3dViewStateStore,
} from "../camera/scene-3d-view-state";
import { useScene3dFrameSelection } from "./use-scene-3d-frame-selection";
import type { FrameTransformsState } from "../../spatial/frame-transforms/use-frame-transforms";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";

let viewStateStore: Scene3dViewStateStore;

vi.mock("../../../../observability/episode-latency", () => ({
  markEpisodeLatencyEvent: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(markEpisodeLatencyEvent).mockClear();
  viewStateStore = createScene3dViewStateStore();
});

afterEach(() => {
  cleanup();
});

type FrameSelectionProps = Parameters<typeof useScene3dFrameSelection>[0];
type TransformEdge = readonly [parentFrameId: string, childFrameId: string];

describe("useScene3dFrameSelection", () => {
  it("defaults map plus base_link logs to stable world and ego target", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("lidar"),
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
    const { rerender, result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("base_link"),
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
        ...pointCloudObservation("base_link"),
        frameTransforms: transforms([
          ["odom", "map"],
          ["map", "base_link"],
        ]),
      }),
    );
    expect(result.current.worldFrameId).toBe("odom");

    rerender(
      selectionProps({
        ...pointCloudObservation("base_link"),
        frameTransforms: transforms([["map", "base_link"]]),
      }),
    );
    expect(result.current.worldFrameId).toBe("map");
    // The user's choice degrades silently; the selection-source flag stays.
    expect(result.current.worldFrameSelectionSource).toBe("user");
  });

  it("uses the TF root instead of an early optical frame in sensor-arm graphs", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("realsense_depth_optical_frame"),
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

  it("falls back to ego world names in rootless graphs", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("base_link"),
        frameTransforms: transforms([
          ["camera", "base_link"],
          ["base_link", "camera"],
        ]),
      }),
    });

    expect(result.current.worldFrameId).toBe("base_link");
  });

  it("falls back to the first non-optical TF frame when no better default exists", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("a_frame"),
        frameTransforms: transforms([
          ["z_frame", "a_frame"],
          ["a_frame", "z_frame"],
          ["a_frame", "camera_optical_frame"],
        ]),
      }),
    });

    expect(result.current.worldFrameId).toBe("a_frame");
  });

  it("uses a truthful local frame when geometry has no transforms", () => {
    const { rerender, result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        frames: [pointCloudFrame("lidar_data")],
      }),
    });

    expect(result.current.frameIds).toEqual(["lidar_data"]);
    expect(result.current.worldFrameId).toBe("lidar_data");
    expect(result.current.cameraTargetFrameId).toBe("lidar_data");

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
    // A disconnected TF island must not displace the component that carries
    // the selected geometry.
    expect(result.current.worldFrameId).toBe("lidar_data");
    expect(result.current.cameraTargetFrameId).toBe("lidar_data");
  });

  it("prefers ego frames over the world frame for the camera target", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
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

  it("keeps a carried automatic camera target when it exists", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("base_link"),
        frameTransforms: transforms([
          ["map", "base_link"],
          ["base_link", "sensor_target"],
        ]),
        carriedCameraTargetFrameId: "sensor_target",
      }),
    });

    expect(result.current.cameraTargetFrameId).toBe("sensor_target");
    expect(result.current.cameraTargetSelectionSource).toBe("auto");
  });

  it("rejects a carried camera target outside the active component", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("base_link"),
        frameTransforms: transforms([
          ["map", "base_link"],
          ["other", "sensor_target"],
        ]),
        carriedCameraTargetFrameId: "sensor_target",
      }),
    });

    expect(result.current.cameraTargetFrameId).toBe("base_link");
    expect(result.current.cameraTargetSelectionSource).toBe("auto");
  });

  it("falls back to the world frame for the camera target when no ego frame exists", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("odom"),
        frameTransforms: transforms([["world", "odom"]]),
      }),
    });

    expect(result.current.worldFrameId).toBe("world");
    expect(result.current.cameraTargetFrameId).toBe("world");
  });

  it("uses a unique namespaced ego suffix for the camera target", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("robot/lidar"),
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
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("map"),
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
    const { rerender, result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("base_link"),
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
        ...pointCloudObservation("base_link"),
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
        ...pointCloudObservation("base_link"),
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
  });

  it("never pins a carried-over frame that does not reappear", () => {
    const { rerender, result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("base_link"),
        frameTransforms: transforms([["map", "base_link"]]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "gone" },
      }),
    });

    rerender(
      selectionProps({
        ...pointCloudObservation("base_link"),
        frameTransforms: transforms([
          ["odom", "map"],
          ["map", "base_link"],
        ]),
        restore: { userCameraTargetFrameId: null, userWorldFrameId: "gone" },
      }),
    );

    expect(result.current.worldFrameId).toBe("map");
    expect(result.current.worldFrameSelectionSource).toBe("auto");
  });

  it("cancels the pending adoption when the user selects a frame first", () => {
    const { rerender, result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("base_link"),
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
  });

  it("writes user frame selections through to the view-state store", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
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

  it("clears explicit intent when returning to the recommended reference", () => {
    const { result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("base_link"),
        frameTransforms: transforms([["map", "base_link"]]),
      }),
    });

    act(() => result.current.updateWorldFrameId("base_link"));
    expect(result.current.worldFrameId).toBe("base_link");
    expect(viewStateStore.getSnapshot().userWorldFrameId).toBe("base_link");

    act(() => result.current.useRecommendedWorldFrame());
    expect(result.current.worldFrameId).toBe("map");
    expect(result.current.referenceSelectionSource).toBe("auto-stable");
    expect(viewStateStore.getSnapshot().userWorldFrameId).toBeNull();
  });

  it("keeps stream frame identity through a content gap without resummarizing topology", () => {
    const frameTransforms = transforms([["map", "lidar"]]);
    const summarizeGraph = vi.fn(frameTransforms.summarizeGraph);
    const props = selectionProps({
      frameTransforms: { ...frameTransforms, summarizeGraph },
      frames: [pointCloudFrame("lidar")],
      pointCloudStreams: ["/points"],
      primarySourceId: "/points",
    });
    const { rerender, result } = renderHook(useScene3dFrameSelection, {
      initialProps: props,
    });

    rerender({ ...props, frames: [null] });
    expect(result.current.worldFrameId).toBe("map");
    expect(summarizeGraph).toHaveBeenCalledTimes(1);
  });

  it("checks readiness once for a promotion key and ignores playback clock updates", () => {
    const local = transforms([["world", "base_link"]]);
    const connected = transforms([
      ["world", "base_link"],
      ["base_link", "velodyne"],
    ]);
    const getPlacementReadiness = vi.fn(() => ({
      frameIds: ["velodyne"],
      status: "loading" as const,
    }));
    const { rerender, result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        frameTransforms: { ...local, topologyRevision: 1 },
        frames: [pointCloudFrame("velodyne")],
        playbackTimeNs: 10n,
        pointCloudStreams: ["/points"],
        primarySourceId: "/points",
      }),
    });
    expect(result.current.worldFrameId).toBe("velodyne");

    const connectedProps = selectionProps({
      frameTransforms: {
        ...connected,
        getPlacementReadiness,
        topologyRevision: 2,
      },
      frames: [pointCloudFrame("velodyne")],
      playbackTimeNs: 10n,
      pointCloudStreams: ["/points"],
      primarySourceId: "/points",
    });
    rerender(connectedProps);
    expect(result.current.worldFrameId).toBe("velodyne");
    expect(result.current.pendingPromotion).not.toBeNull();
    expect(result.current.navigationReferenceSettled).toBe(false);
    expect(getPlacementReadiness).toHaveBeenCalledTimes(1);

    rerender({ ...connectedProps, playbackTimeNs: 20n });
    expect(getPlacementReadiness).toHaveBeenCalledTimes(1);
  });

  it("does not expose a navigation reference before transform bootstrap settles", () => {
    const loading = transforms([]);
    const { rerender, result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...pointCloudObservation("lidar"),
        frameTransforms: loading,
      }),
    });

    expect(result.current.navigationReferenceSettled).toBe(false);

    rerender(
      selectionProps({
        ...pointCloudObservation("lidar"),
        frameTransforms: { ...loading, status: "ready" },
      }),
    );
    expect(result.current.navigationReferenceSettled).toBe(true);
  });

  it("commits the exact transform that passes the promotion gate", () => {
    const local = transforms([["world", "base_link"]]);
    const connected = transforms([
      ["world", "base_link"],
      ["base_link", "velodyne"],
    ]);
    const transform = {
      rotation: new Quaternion(),
      sourceFrameId: "velodyne",
      targetFrameId: "world",
      translation: new Vector3(4, 0, 0),
    };
    const resolve = vi.fn(() => ({
      sourceFrameId: "velodyne",
      status: "resolved" as const,
      targetFrameId: "world",
      transform,
    }));
    const baseProps = {
      frames: [pointCloudFrame("velodyne")],
      playbackTimeNs: 10n,
      pointCloudStreams: ["/points"],
      primarySourceId: "/points",
    };
    const { rerender, result } = renderHook(useScene3dFrameSelection, {
      initialProps: selectionProps({
        ...baseProps,
        frameTransforms: { ...local, topologyRevision: 1 },
      }),
    });

    rerender(
      selectionProps({
        ...baseProps,
        frameTransforms: {
          ...connected,
          resolve,
          topologyRevision: 2,
        },
      }),
    );

    expect(result.current.worldFrameId).toBe("world");
    expect(result.current.referenceTransition).toMatchObject({
      sourceFrameId: "velodyne",
      targetFrameId: "world",
      transform,
    });
    expect(resolve).toHaveBeenCalledTimes(1);

    rerender(
      selectionProps({
        ...baseProps,
        frameTransforms: {
          ...connected,
          resolve,
          topologyRevision: 2,
        },
        playbackTimeNs: 20n,
      }),
    );
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

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

function transforms(edges: readonly TransformEdge[]): FrameTransformsState {
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
): StreamPlaybackFrame<PointCloudVisualization> {
  return {
    ageNs: 0n,
    contentTimeNs: 0n,
    frame: {
      coordinateFrameId: frameId,
    } as unknown as PointCloudVisualization,
    requestedTimeNs: 0n,
  };
}

function pointCloudObservation(frameId: string) {
  return {
    frames: [pointCloudFrame(frameId)],
    pointCloudStreams: ["/points"],
  };
}

function summarizeGraph(
  edges: readonly TransformEdge[],
  dataBearingFrameIds: ReadonlySet<string>,
): EpisodeFrameGraphSummary {
  if (edges.length === 0) {
    return {
      components: [],
      dataBearingReachableCountsByFrameId: new Map(),
      reachableCountsByFrameId: new Map(),
      roots: [],
      tfConnectedFrameIds: [],
    };
  }

  const childFrameIds = new Set<string>();
  const childrenByParent = new Map<string, string[]>();
  const neighborsByFrameId = new Map<string, string[]>();
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
    neighborsByFrameId.set(parentFrameId, [
      ...(neighborsByFrameId.get(parentFrameId) ?? []),
      childFrameId,
    ]);
    neighborsByFrameId.set(childFrameId, [
      ...(neighborsByFrameId.get(childFrameId) ?? []),
      parentFrameId,
    ]);
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareFrameIds);
  }

  const tfConnectedFrameIds = [...frameIds].sort(compareFrameIds);
  const roots = [...parentFrameIds]
    .filter((frameId) => !childFrameIds.has(frameId))
    .sort(compareFrameIds);
  const components = connectedComponents(
    tfConnectedFrameIds,
    neighborsByFrameId,
  );
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
    components,
    dataBearingReachableCountsByFrameId,
    reachableCountsByFrameId,
    roots,
    tfConnectedFrameIds,
  };
}

function connectedComponents(
  frameIds: readonly string[],
  neighborsByFrameId: ReadonlyMap<string, readonly string[]>,
) {
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const frameId of frameIds) {
    if (visited.has(frameId)) continue;
    const component: string[] = [];
    const stack = [frameId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      stack.push(...(neighborsByFrameId.get(current) ?? []));
    }
    components.push(component.sort(compareFrameIds));
  }
  return components.sort((left, right) =>
    compareFrameIds(left[0] ?? "", right[0] ?? ""),
  );
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
