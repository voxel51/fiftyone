import { cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackProvider } from "./PlaybackProvider";
import {
  useCurrentTime,
  useDuration,
  useIsBuffering,
  useIsPlaying,
  useLoopEnd,
  useLoopStart,
  usePlayhead,
  useSeekEvent,
  useSpeed,
  useStepInterval,
  useViewEnd,
  useViewStart,
} from "./use-playback-state";

const wrap =
  (config: {
    duration?: number;
    stepInterval?: number;
    defaultLoopStart?: number;
    defaultLoopEnd?: number;
    defaultSpeed?: number;
  } = {}) =>
  ({ children }: { children: React.ReactNode }) => (
    <PlaybackProvider {...config}>{children}</PlaybackProvider>
  );

describe("use-playback-state wrappers", () => {
  afterEach(() => cleanup());

  it("usePlayhead starts at 0", () => {
    const { result } = renderHook(() => usePlayhead(), {
      wrapper: wrap({ duration: 10 }),
    });
    expect(result.current).toBe(0);
  });

  it("useCurrentTime starts at 0", () => {
    const { result } = renderHook(() => useCurrentTime(), {
      wrapper: wrap({ duration: 10 }),
    });
    expect(result.current).toBe(0);
  });

  it("useIsPlaying starts false", () => {
    const { result } = renderHook(() => useIsPlaying(), {
      wrapper: wrap({ duration: 10 }),
    });
    expect(result.current).toBe(false);
  });

  it("useIsBuffering starts false", () => {
    const { result } = renderHook(() => useIsBuffering(), {
      wrapper: wrap({ duration: 10 }),
    });
    expect(result.current).toBe(false);
  });

  it("useDuration reflects the provider fallback", () => {
    const { result } = renderHook(() => useDuration(), {
      wrapper: wrap({ duration: 7 }),
    });
    expect(result.current).toBe(7);
  });

  it("useStepInterval reflects the provider fallback", () => {
    const { result } = renderHook(() => useStepInterval(), {
      wrapper: wrap({ duration: 7, stepInterval: 1 / 24 }),
    });
    expect(result.current).toBeCloseTo(1 / 24);
  });

  it("useViewStart/useViewEnd start at 0 and duration respectively", () => {
    const { result } = renderHook(
      () => ({ start: useViewStart(), end: useViewEnd() }),
      { wrapper: wrap({ duration: 12 }) }
    );
    expect(result.current.start).toBe(0);
    expect(result.current.end).toBe(12);
  });

  it("useLoopStart / useLoopEnd reflect default loop bounds", () => {
    const { result } = renderHook(
      () => ({ start: useLoopStart(), end: useLoopEnd() }),
      {
        wrapper: wrap({
          duration: 10,
          defaultLoopStart: 2,
          defaultLoopEnd: 8,
        }),
      }
    );
    expect(result.current.start).toBe(2);
    expect(result.current.end).toBe(8);
  });

  it("useSpeed reflects the default speed", () => {
    const { result } = renderHook(() => useSpeed(), {
      wrapper: wrap({ duration: 10, defaultSpeed: 2 }),
    });
    expect(result.current).toBe(2);
  });

  it("useSeekEvent starts null", () => {
    const { result } = renderHook(() => useSeekEvent(), {
      wrapper: wrap({ duration: 10 }),
    });
    expect(result.current).toBeNull();
  });
});
