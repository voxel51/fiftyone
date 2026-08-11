import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createScene3dViewStateStore,
  type Scene3dViewStateStore,
} from "../camera/scene-3d-view-state";
import { useScene3dPoseTrajectories } from "./use-scene-3d-pose-trajectories";

vi.mock("./pose-trajectories-context", () => ({
  usePoseTrajectoriesContext: () => new Map(),
}));

let viewStateStore: Scene3dViewStateStore;

beforeEach(() => {
  viewStateStore = createScene3dViewStateStore();
});

afterEach(() => {
  cleanup();
});

type TrajectoriesProps = Parameters<typeof useScene3dPoseTrajectories>[0];

describe("useScene3dPoseTrajectories view-state carry-over", () => {
  it("seeds frame overrides from the restore for frameless streams", () => {
    const { result } = renderHook(useScene3dPoseTrajectories, {
      initialProps: trajectoriesProps({
        restore: { "/odom": "frame_x" },
      }),
    });

    expect(result.current.trajectoryFrameOverrides).toEqual({
      "/odom": "frame_x",
    });
    // The stream has no frame of its own, so the carried override wins.
    expect(result.current.trajectoryFrameByStream.get("/odom")).toBe("frame_x");
  });

  it("defaults to no overrides without a restore and mirrors changes to the store", () => {
    const { result } = renderHook(useScene3dPoseTrajectories, {
      initialProps: trajectoriesProps({}),
    });

    expect(result.current.trajectoryFrameOverrides).toEqual({});
    expect(viewStateStore.getSnapshot().trajectoryFrameOverrides).toEqual({});

    act(() => {
      result.current.setTrajectoryFrameOverrides({ "/odom": "map" });
    });
    expect(viewStateStore.getSnapshot().trajectoryFrameOverrides).toEqual({
      "/odom": "map",
    });
  });
});

function trajectoriesProps(
  overrides: Partial<TrajectoriesProps>,
): TrajectoriesProps {
  return {
    annotationFrames: [],
    frameIds: ["frame_x", "map"],
    playbackTimeNs: 0n,
    poseFrames: [null],
    poseStreams: ["/odom"],
    sceneAnnotationStreams: [],
    viewStateStore,
    ...overrides,
  };
}
