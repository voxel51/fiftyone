import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useInterpolatedSceneUpdateFrames } from "./use-interpolated-scene-updates";

const useOptionalPlayhead = vi.hoisted(() => vi.fn(() => 0));
const dataStream = vi.hoisted(() => ({
  getTimelineIndex: () => ({
    nearestTick: () => 0n,
    secToNs: () => 0n,
  }),
  getTopicCache: () => undefined,
  sourceKey: "test-source",
  subscribeToTopic: () => () => undefined,
}));

vi.mock("./use-optional-playhead", () => ({ useOptionalPlayhead }));
vi.mock("./mcap-data-stream-context", () => ({
  useMcapDataStream: () => dataStream,
}));

afterEach(() => {
  cleanup();
  useOptionalPlayhead.mockClear();
});

describe("useInterpolatedSceneUpdateFrames", () => {
  it("does not subscribe to RAF playhead updates without annotation topics", () => {
    renderHook(() =>
      useInterpolatedSceneUpdateFrames({
        frames: [],
        interpolate: true,
        topics: [],
      }),
    );

    expect(useOptionalPlayhead).toHaveBeenLastCalledWith(false);
  });

  it("subscribes to RAF playhead updates for smooth annotation playback", () => {
    renderHook(() =>
      useInterpolatedSceneUpdateFrames({
        frames: [],
        interpolate: true,
        topics: ["/annotations"],
      }),
    );

    expect(useOptionalPlayhead).toHaveBeenLastCalledWith(true);
  });

  it("does not subscribe to RAF playhead updates in as-recorded mode", () => {
    renderHook(() =>
      useInterpolatedSceneUpdateFrames({
        frames: [],
        interpolate: false,
        topics: ["/annotations"],
      }),
    );

    expect(useOptionalPlayhead).toHaveBeenLastCalledWith(false);
  });
});
