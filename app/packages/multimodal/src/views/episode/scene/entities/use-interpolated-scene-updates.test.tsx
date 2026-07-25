import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SceneUpdateVisualization } from "../../../../ir/index";
import type { StreamPlaybackFrame } from "../../playback/use-stream-values";
import { useInterpolatedSceneUpdateFrames } from "./use-interpolated-scene-updates";

const useOptionalPlayhead = vi.hoisted(() => vi.fn(() => 0));
const sceneHistory = vi.hoisted(() => new Map());
const dataStream = vi.hoisted(() => ({
  getStreamCache: () => undefined,
  getTimelineIndex: () => ({
    nearestTick: () => 0n,
    secToNs: () => 0n,
  }),
  sourceKey: "test-source",
  subscribeToStream: () => () => undefined,
}));

vi.mock("../../playback/use-optional-playhead", () => ({
  useOptionalPlayhead,
}));
vi.mock("../../playback/data-stream-context", () => ({
  useDataStream: () => dataStream,
}));
vi.mock("./scene-update-history-context", () => ({
  useSceneUpdateHistoryContext: () => sceneHistory,
}));

afterEach(() => {
  cleanup();
  sceneHistory.clear();
  useOptionalPlayhead.mockClear();
});

describe("useInterpolatedSceneUpdateFrames", () => {
  it("does not subscribe to RAF playhead updates without annotation streams", () => {
    renderHook(() =>
      useInterpolatedSceneUpdateFrames({
        frames: [],
        interpolate: true,
        streams: [],
      }),
    );

    expect(useOptionalPlayhead).toHaveBeenLastCalledWith(false);
  });

  it("subscribes to RAF playhead updates for annotation interpolation", () => {
    renderHook(() =>
      useInterpolatedSceneUpdateFrames({
        frames: [],
        interpolate: true,
        streams: ["/annotations"],
      }),
    );

    expect(useOptionalPlayhead).toHaveBeenLastCalledWith(true);
  });

  it("does not subscribe to RAF playhead updates when interpolation is disabled", () => {
    renderHook(() =>
      useInterpolatedSceneUpdateFrames({
        frames: [],
        interpolate: false,
        streams: ["/annotations"],
      }),
    );

    expect(useOptionalPlayhead).toHaveBeenLastCalledWith(false);
  });

  it("uses a progressive history prefix only after it covers the target", () => {
    const historicalUpdate = sceneUpdate(["persisted"]);
    const fallback = playbackFrame(sceneUpdate([]), 5n);
    sceneHistory.set("/annotations", {
      deltas: [{ timeNs: 1n, update: historicalUpdate }],
      loadedThroughNs: 5n,
      status: "loading",
    });
    const covered = renderHook(() =>
      useInterpolatedSceneUpdateFrames({
        frames: [fallback],
        interpolate: false,
        streams: ["/annotations"],
      }),
    );
    expect(covered.result.current[0]?.frame.entities).toHaveLength(1);
    covered.unmount();

    sceneHistory.set("/annotations", {
      deltas: [{ timeNs: 1n, update: historicalUpdate }],
      loadedThroughNs: 4n,
      status: "loading",
    });
    const uncovered = renderHook(() =>
      useInterpolatedSceneUpdateFrames({
        frames: [fallback],
        interpolate: false,
        streams: ["/annotations"],
      }),
    );
    expect(uncovered.result.current[0]?.frame.entities).toHaveLength(0);
  });
});

function sceneUpdate(entityIds: readonly string[]): SceneUpdateVisualization {
  return {
    deletions: [],
    entities: entityIds.map((id) => ({ id })),
    kind: "scene-update",
  } as unknown as SceneUpdateVisualization;
}

function playbackFrame(
  frame: SceneUpdateVisualization,
  timeNs: bigint,
): StreamPlaybackFrame<SceneUpdateVisualization> {
  return {
    ageNs: 0n,
    contentTimeNs: timeNs,
    frame,
    requestedTimeNs: timeNs,
  };
}
