/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NTSC-style sample: 120 frames at 30000/1001 fps, duration 4.004s. The
// engine's seek/step clamp is inclusive of `duration`, so the playhead can
// rest exactly there — the conversion must not report a frame past the last.
const FPS = 30000 / 1001;
const TOTAL_FRAMES = 120;
const DURATION = TOTAL_FRAMES / FPS;

const { source } = vi.hoisted(() => ({
  source: {
    committed: 0,
    frameRate: undefined as number | undefined,
    totalFrameCount: undefined as number | undefined,
    frameTable: null as { timesSec: number[] } | null,
  },
}));

// Keep the real `frameAt` — the clamp under test lives in the interplay
// between it and the frame count this hook resolves; only the playhead
// source is stubbed.
vi.mock("@fiftyone/playback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/playback")>()),
  useCurrentTime: () => source.committed,
}));

vi.mock("@fiftyone/state", () => ({
  useModalSample: () => ({
    frameRate: source.frameRate,
    sample: { metadata: { total_frame_count: source.totalFrameCount } },
  }),
}));

// The accessor falls back to the dataset's dynamic-group target frame rate
// through recoil; the native-video path under test only reads the sample's
// own frame rate.
vi.mock("./accessors", () => ({
  useModalSampleFrameRate: (sample?: { frameRate?: number }) =>
    sample?.frameRate,
}));

// The surface provides the table only on the html strategy; the hook just
// reads the context accessor.
vi.mock("./frameTableContext", () => ({
  useFrameTable: () => source.frameTable,
}));

import { useCurrentFrame } from "./useCurrentFrame";

beforeEach(() => {
  source.frameTable = null;
});

describe("useCurrentFrame", () => {
  it("converts the playhead to a 1-indexed frame", () => {
    source.committed = 0;
    source.frameRate = FPS;
    source.totalFrameCount = TOTAL_FRAMES;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(1);
  });

  it("clamps a playhead resting at duration to the last real frame", () => {
    source.committed = DURATION;
    source.frameRate = FPS;
    source.totalFrameCount = TOTAL_FRAMES;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(TOTAL_FRAMES);
  });

  it("stays unclamped when the sample has no frame count", () => {
    source.committed = DURATION;
    source.frameRate = FPS;
    source.totalFrameCount = undefined;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(TOTAL_FRAMES + 1);
  });

  it("returns -1 without a frame rate", () => {
    source.committed = 1;
    source.frameRate = undefined;
    source.totalFrameCount = TOTAL_FRAMES;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(-1);
  });
});

describe("useCurrentFrame frame-table numbering", () => {
  // A 30fps source with two dropped frames: presentation runs 0, 1/30, 2/30,
  // then jumps to 5/30, 6/30 — so pictures 4-5 sit where the clock's
  // arithmetic says frames 6-7 live. Frame N means the N-th stored picture.
  const TABLE_FPS = 30;
  const GAPPED = {
    timesSec: [0, 1 / TABLE_FPS, 2 / TABLE_FPS, 5 / TABLE_FPS, 6 / TABLE_FPS],
  };

  it("numbers by the table, not time × fps, inside a dropped-frame gap", () => {
    // 3/30s is inside the gap: the picture on glass is still the 3rd stored
    // frame, while clock math (the null-table fallback below) reports 4.
    source.committed = 3 / TABLE_FPS;
    source.frameRate = TABLE_FPS;
    source.totalFrameCount = GAPPED.timesSec.length;
    source.frameTable = GAPPED;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(3);
  });

  it("falls back to time × fps numbering without a table", () => {
    source.committed = 3 / TABLE_FPS;
    source.frameRate = TABLE_FPS;
    source.totalFrameCount = GAPPED.timesSec.length;
    source.frameTable = null;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(4);
  });

  it("clamps a table frame to the sample's frame count", () => {
    source.committed = 6 / TABLE_FPS;
    source.frameRate = TABLE_FPS;
    source.totalFrameCount = 4;
    source.frameTable = GAPPED;

    const { result } = renderHook(() => useCurrentFrame());
    expect(result.current).toBe(4);
  });
});
