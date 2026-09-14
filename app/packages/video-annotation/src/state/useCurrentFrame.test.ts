import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// NTSC-style sample: 120 frames at 30000/1001 fps, duration 4.004s. The
// engine's seek/step clamp is inclusive of `duration`, so the playhead can
// rest exactly there — the conversion must not report a frame past the last.
const FPS = 30000 / 1001;
const TOTAL_FRAMES = 120;
const DURATION = TOTAL_FRAMES / FPS;

const { source } = vi.hoisted(() => ({
  source: {
    playhead: 0,
    frameRate: undefined as number | undefined,
    totalFrameCount: undefined as number | undefined,
  },
}));

// Keep the real `frameAt` — the clamp under test lives in the interplay
// between it and the frame count this hook resolves; only the playhead
// source is stubbed.
vi.mock("@fiftyone/playback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/playback")>()),
  usePlayhead: () => source.playhead,
}));

vi.mock("@fiftyone/state", () => ({
  useModalSample: () => ({
    frameRate: source.frameRate,
    sample: { metadata: { total_frame_count: source.totalFrameCount } },
  }),
}));

import { useCurrentFrame } from "./useCurrentFrame";

describe("useCurrentFrame", () => {
  it("converts the playhead to a 1-indexed frame", () => {
    source.playhead = 0;
    source.frameRate = FPS;
    source.totalFrameCount = TOTAL_FRAMES;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(1);
  });

  it("clamps a playhead resting at duration to the last real frame", () => {
    source.playhead = DURATION;
    source.frameRate = FPS;
    source.totalFrameCount = TOTAL_FRAMES;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(TOTAL_FRAMES);
  });

  it("stays unclamped when the sample has no frame count", () => {
    source.playhead = DURATION;
    source.frameRate = FPS;
    source.totalFrameCount = undefined;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(TOTAL_FRAMES + 1);
  });

  it("returns -1 without a frame rate", () => {
    source.playhead = 1;
    source.frameRate = undefined;
    source.totalFrameCount = TOTAL_FRAMES;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(-1);
  });
});
