import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useInterpolatedSceneUpdateFrames } from "./use-interpolated-scene-updates";

const useOptionalPlayhead = vi.hoisted(() => vi.fn(() => 0));
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

afterEach(() => {
  cleanup();
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
});
