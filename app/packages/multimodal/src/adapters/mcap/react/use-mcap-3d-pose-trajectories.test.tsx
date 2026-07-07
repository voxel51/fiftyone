import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMcap3dViewStateSnapshot,
  resetMcap3dViewStateForTests,
} from "./mcap-3d-view-state";
import { useMcap3dPoseTrajectories } from "./use-mcap-3d-pose-trajectories";

vi.mock("./mcap-pose-trajectories-context", () => ({
  useMcapPoseTrajectoriesContext: () => new Map(),
}));

beforeEach(() => {
  resetMcap3dViewStateForTests();
});

afterEach(() => {
  cleanup();
});

type TrajectoriesProps = Parameters<typeof useMcap3dPoseTrajectories>[0];

describe("useMcap3dPoseTrajectories view-state carry-over", () => {
  it("seeds frame overrides from the restore for frameless streams", () => {
    const { result } = renderHook(useMcap3dPoseTrajectories, {
      initialProps: trajectoriesProps({
        restore: { "/odom": "frame_x" },
      }),
    });

    expect(result.current.trajectoryFrameOverrides).toEqual({
      "/odom": "frame_x",
    });
    // The stream has no frame of its own, so the carried override wins.
    expect(result.current.trajectoryFrameByTopic.get("/odom")).toBe("frame_x");
  });

  it("defaults to no overrides without a restore and mirrors changes to the store", () => {
    const { result } = renderHook(useMcap3dPoseTrajectories, {
      initialProps: trajectoriesProps({}),
    });

    expect(result.current.trajectoryFrameOverrides).toEqual({});
    expect(getMcap3dViewStateSnapshot().trajectoryFrameOverrides).toEqual({});

    act(() => {
      result.current.setTrajectoryFrameOverrides({ "/odom": "map" });
    });
    expect(getMcap3dViewStateSnapshot().trajectoryFrameOverrides).toEqual({
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
    poseTopics: ["/odom"],
    sceneAnnotationTopics: [],
    ...overrides,
  };
}
