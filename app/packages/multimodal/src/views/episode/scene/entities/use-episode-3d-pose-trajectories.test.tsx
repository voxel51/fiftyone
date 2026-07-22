import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEpisode3dViewStateStore,
  type Episode3dViewStateStore,
} from "../camera/episode-3d-view-state";
import { useEpisode3dPoseTrajectories } from "./use-episode-3d-pose-trajectories";

vi.mock("./episode-pose-trajectories-context", () => ({
  useEpisodePoseTrajectoriesContext: () => new Map(),
}));

let viewStateStore: Episode3dViewStateStore;

beforeEach(() => {
  viewStateStore = createEpisode3dViewStateStore();
});

afterEach(() => {
  cleanup();
});

type TrajectoriesProps = Parameters<typeof useEpisode3dPoseTrajectories>[0];

describe("useEpisode3dPoseTrajectories view-state carry-over", () => {
  it("seeds frame overrides from the restore for frameless streams", () => {
    const { result } = renderHook(useEpisode3dPoseTrajectories, {
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
    const { result } = renderHook(useEpisode3dPoseTrajectories, {
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
