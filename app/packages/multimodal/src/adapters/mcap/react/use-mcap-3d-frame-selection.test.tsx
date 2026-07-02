import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PointCloudVisualization } from "../../../decoders";
import { useMcap3dFrameSelection } from "./use-mcap-3d-frame-selection";
import type { McapFrameTransformsState } from "./use-mcap-frame-transforms";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";

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
