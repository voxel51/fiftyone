import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimelineState } from "./use-timeline-state";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTimelineState", () => {
  describe("initial state", () => {
    it("starts at time 0, not playing", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      expect(result.current.currentTime).toBe(0);
      expect(result.current.isPlaying).toBe(false);
    });

    it("sets viewStart/viewEnd to 0 and duration", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      expect(result.current.viewStart).toBe(0);
      expect(result.current.viewEnd).toBe(10);
    });

    it("sets loopStart/loopEnd to 0 and duration by default", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      expect(result.current.loopStart).toBe(0);
      expect(result.current.loopEnd).toBe(10);
    });

    it("respects defaultLoopStart and defaultLoopEnd", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, defaultLoopStart: 2, defaultLoopEnd: 8 })
      );
      expect(result.current.loopStart).toBe(2);
      expect(result.current.loopEnd).toBe(8);
    });
  });

  describe("seek", () => {
    it("sets currentTime to the given value", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      act(() => result.current.seek(5));
      expect(result.current.currentTime).toBe(5);
    });

    it("clamps below 0", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      act(() => result.current.seek(-3));
      expect(result.current.currentTime).toBe(0);
    });

    it("clamps above duration", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      act(() => result.current.seek(99));
      expect(result.current.currentTime).toBe(10);
    });
  });

  describe("stepForward / stepBack", () => {
    it("stepForward advances by 1/fps", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, fps: 10 })
      );
      act(() => result.current.stepForward());
      expect(result.current.currentTime).toBeCloseTo(0.1);
    });

    it("stepBack retreats by 1/fps", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, fps: 10 })
      );
      act(() => {
        result.current.seek(1);
        result.current.stepBack();
      });
      expect(result.current.currentTime).toBeCloseTo(0.9);
    });

    it("stepBack clamps at 0", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, fps: 10 })
      );
      act(() => result.current.stepBack());
      expect(result.current.currentTime).toBe(0);
    });

    it("stepForward clamps at duration", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, fps: 10 })
      );
      act(() => result.current.seek(10));
      act(() => result.current.stepForward());
      expect(result.current.currentTime).toBe(10);
    });
  });

  describe("play / pause", () => {
    it("advances currentTime on each interval tick while playing", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, fps: 10 })
      );
      act(() => result.current.play());
      act(() => vi.advanceTimersByTime(200)); // 2 frames at 10 fps
      expect(result.current.currentTime).toBeGreaterThan(0);
    });

    it("does not advance time while paused", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, fps: 10 })
      );
      act(() => vi.advanceTimersByTime(500));
      expect(result.current.currentTime).toBe(0);
    });

    it("wraps back to loopStart when reaching loopEnd", () => {
      const { result } = renderHook(() =>
        useTimelineState({
          duration: 10,
          fps: 10,
          defaultLoopStart: 0,
          defaultLoopEnd: 0.2,
        })
      );
      act(() => result.current.play());
      act(() => vi.advanceTimersByTime(300)); // 3 frames — past loopEnd=0.2
      expect(result.current.currentTime).toBeLessThan(0.2);
    });

    it("play sets isPlaying to true", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      act(() => result.current.play());
      expect(result.current.isPlaying).toBe(true);
    });

    it("pause sets isPlaying to false", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      act(() => {
        result.current.play();
        result.current.pause();
      });
      expect(result.current.isPlaying).toBe(false);
    });

    it("play resets currentTime to loopStart when time is before loop", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, defaultLoopStart: 3, defaultLoopEnd: 8 })
      );
      // time=0 is before loopStart=3
      act(() => result.current.play());
      expect(result.current.currentTime).toBe(3);
    });

    it("play resets currentTime to loopStart when time is at or past loopEnd", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, defaultLoopStart: 3, defaultLoopEnd: 8 })
      );
      act(() => result.current.seek(9));
      act(() => result.current.play());
      expect(result.current.currentTime).toBe(3);
    });

    it("play keeps currentTime when already within loop range", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10, defaultLoopStart: 3, defaultLoopEnd: 8 })
      );
      act(() => result.current.seek(5));
      act(() => result.current.play());
      expect(result.current.currentTime).toBe(5);
    });
  });

  describe("setView", () => {
    it("updates viewStart and viewEnd", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      act(() => result.current.setView(2, 7));
      expect(result.current.viewStart).toBe(2);
      expect(result.current.viewEnd).toBe(7);
    });
  });

  describe("setLoop", () => {
    it("updates loopStart and loopEnd", () => {
      const { result } = renderHook(() =>
        useTimelineState({ duration: 10 })
      );
      act(() => result.current.setLoop(1, 9));
      expect(result.current.loopStart).toBe(1);
      expect(result.current.loopEnd).toBe(9);
    });
  });
});
