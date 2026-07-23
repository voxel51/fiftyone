import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackProvider } from "./PlaybackProvider";
import {
  createTimelineDisplayConversion,
  useTimelineDisplay,
} from "./timeline-display";
import {
  useLoopEnd,
  useLoopStart,
  usePlayhead,
  useStepInterval,
} from "./use-playback-state";
import type { TimelineMode } from "./types";

const wrap =
  (
    config: {
      duration?: number;
      mode?: TimelineMode;
      stepInterval?: number;
    } = {},
  ) =>
  ({ children }: { children: React.ReactNode }) => (
    <PlaybackProvider {...config}>{children}</PlaybackProvider>
  );

describe("createTimelineDisplayConversion", () => {
  it("duration mode: identity conversion, no scrub quantization", () => {
    const c = createTimelineDisplayConversion({ kind: "duration" });
    expect(c.toDisplay(12.5)).toBe(12.5);
    expect(c.fromDisplay(12.5)).toBe(12.5);
    expect(c.quantizeDuringScrub).toBe(false);
  });

  it("duration mode: fromDisplay accepts a Date as seconds-since-epoch/1000 fallback", () => {
    const c = createTimelineDisplayConversion({ kind: "duration" });
    const d = new Date(5000);
    expect(c.fromDisplay(d)).toBe(5);
  });

  it("sequence mode: converts seconds <-> 0-indexed frame number", () => {
    const c = createTimelineDisplayConversion({ kind: "sequence", fps: 30 });
    expect(c.toDisplay(0)).toBe(0);
    expect(c.toDisplay(1)).toBe(30);
    expect(c.toDisplay(1 / 30)).toBe(1);
    expect(c.fromDisplay(30)).toBeCloseTo(1);
    expect(c.fromDisplay(0)).toBe(0);
    expect(c.quantizeDuringScrub).toBe(true);
  });

  it("sequence mode: fromDisplay rounds fractional frames defensively", () => {
    const c = createTimelineDisplayConversion({ kind: "sequence", fps: 10 });
    // frame 2.5 doesn't exist -> rounds to frame 3 (Math.round ties toward +Infinity)
    expect(c.fromDisplay(2.5)).toBeCloseTo(0.3);
  });

  it("absolute mode: converts seconds <-> Date via the epoch anchor", () => {
    const epochAnchorMs = 1_700_000_000_000;
    const c = createTimelineDisplayConversion({
      kind: "absolute",
      epochAnchorMs,
    });
    expect(c.toDisplay(0)).toEqual(new Date(epochAnchorMs));
    expect(c.toDisplay(10)).toEqual(new Date(epochAnchorMs + 10_000));
    expect(c.fromDisplay(new Date(epochAnchorMs + 10_000))).toBeCloseTo(10);
    expect(c.fromDisplay(epochAnchorMs + 10_000)).toBeCloseTo(10);
    expect(c.quantizeDuringScrub).toBe(false);
  });
});

describe("useTimelineDisplay", () => {
  afterEach(() => cleanup());

  it("defaults to duration mode when the provider doesn't configure one", () => {
    const { result } = renderHook(() => useTimelineDisplay(), {
      wrapper: wrap({ duration: 10 }),
    });
    expect(result.current.mode).toEqual({ kind: "duration" });
    expect(result.current.toDisplay(4)).toBe(4);
  });

  it("sequence mode derives the fallback step interval from fps unless overridden", () => {
    const { result: derived } = renderHook(() => useStepInterval(), {
      wrapper: wrap({ duration: 10, mode: { kind: "sequence", fps: 24 } }),
    });
    expect(derived.current).toBeCloseTo(1 / 24);

    const { result: overridden } = renderHook(() => useStepInterval(), {
      wrapper: wrap({
        duration: 10,
        mode: { kind: "sequence", fps: 24 },
        stepInterval: 1 / 12,
      }),
    });
    expect(overridden.current).toBeCloseTo(1 / 12);
  });

  it("seekDisplay converts through fromDisplay and drives the real playhead", () => {
    const { result } = renderHook(
      () => ({
        display: useTimelineDisplay(),
        playhead: usePlayhead(),
      }),
      { wrapper: wrap({ duration: 10, mode: { kind: "sequence", fps: 10 } }) },
    );

    act(() => {
      result.current.display.seekDisplay(5); // frame 5 @ 10fps -> 0.5s
    });

    expect(result.current.playhead).toBeCloseTo(0.5);
  });

  it("setLoopDisplay converts display-domain bounds and calls the real setLoop", () => {
    const epochAnchorMs = 1_700_000_000_000;
    const { result } = renderHook(
      () => ({
        display: useTimelineDisplay(),
        loopStart: useLoopStart(),
        loopEnd: useLoopEnd(),
      }),
      {
        wrapper: wrap({
          duration: 100,
          mode: { kind: "absolute", epochAnchorMs },
        }),
      },
    );

    act(() => {
      result.current.display.setLoopDisplay(
        new Date(epochAnchorMs + 10_000),
        new Date(epochAnchorMs + 20_000),
      );
    });

    expect(result.current.loopStart).toBeCloseTo(10);
    expect(result.current.loopEnd).toBeCloseTo(20);
  });
});
