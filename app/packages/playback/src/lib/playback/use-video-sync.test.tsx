import { act, cleanup, renderHook } from "@testing-library/react";
import { useAtomValue } from "jotai";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentTimeAtom,
  isPlayingAtom,
  playheadAtom,
} from "./atoms";
import { PlaybackProvider, usePlaybackStore } from "./PlaybackProvider";
import { useVideoSync } from "./use-video-sync";

interface FakeVideo {
  currentTime: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _fire(event: string): void;
}

function makeVideo(initialTime = 0): FakeVideo {
  const listeners = new Map<string, EventListener[]>();
  const video: FakeVideo = {
    currentTime: initialTime,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, fn: EventListener) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
    }),
    removeEventListener: vi.fn((event: string, fn: EventListener) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(event, arr.filter((f) => f !== fn));
    }),
    _fire(event: string) {
      for (const fn of listeners.get(event) ?? []) fn(new Event(event));
    },
  };
  return video;
}

function renderSync(video: FakeVideo | null, duration = 10) {
  const videoRef = {
    current: video,
  } as React.RefObject<HTMLVideoElement | null>;

  return renderHook(
    () => {
      const store = usePlaybackStore();
      useVideoSync(videoRef);
      return {
        store,
        isPlaying: useAtomValue(isPlayingAtom, { store }),
        playhead: useAtomValue(playheadAtom, { store }),
        currentTime: useAtomValue(currentTimeAtom, { store }),
      };
    },
    {
      wrapper: ({ children }) => (
        <PlaybackProvider duration={duration} stepInterval={1 / 30}>
          {children}
        </PlaybackProvider>
      ),
    }
  );
}

describe("useVideoSync", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("play / pause driving", () => {
    it("calls video.play() when isPlayingAtom becomes true", async () => {
      const video = makeVideo();
      const { result } = renderSync(video);
      // The effect runs on mount with isPlaying=false, calling pause() once.
      // Clear those initial calls before testing the state transition.
      video.play.mockClear();
      video.pause.mockClear();

      await act(async () => {
        result.current.store.set(isPlayingAtom, true);
      });

      expect(video.play).toHaveBeenCalledTimes(1);
      expect(video.pause).not.toHaveBeenCalled();
    });

    it("calls video.pause() when isPlayingAtom becomes false after playing", async () => {
      const video = makeVideo();
      const { result } = renderSync(video);

      await act(async () => {
        result.current.store.set(isPlayingAtom, true);
      });
      // Clear after play so we isolate the pause call.
      video.pause.mockClear();

      await act(async () => {
        result.current.store.set(isPlayingAtom, false);
      });

      expect(video.pause).toHaveBeenCalledTimes(1);
    });

    it("does nothing when the video ref is null", async () => {
      // Should not throw — the effect guard exits early on null.
      const { result } = renderSync(null);
      await act(async () => {
        result.current.store.set(isPlayingAtom, true);
      });
      // No error thrown; nothing to assert beyond that.
    });
  });

  describe("playhead → video seek", () => {
    it("seeks the video when playhead diverges beyond the tolerance (0.15s)", () => {
      const video = makeVideo(0);
      const { result } = renderSync(video);

      act(() => {
        result.current.store.set(playheadAtom, 5);
      });

      // video.currentTime should be updated to 5 (delta = 5 > 0.15)
      expect(video.currentTime).toBe(5);
    });

    it("does not seek when the delta is within the tolerance", () => {
      const video = makeVideo(0);
      const { result } = renderSync(video);

      act(() => {
        // 0.1 < SEEK_TOLERANCE_S (0.15) → no seek
        result.current.store.set(playheadAtom, 0.1);
      });

      expect(video.currentTime).toBe(0);
    });

    it("does not seek when the ref is null", () => {
      const { result } = renderSync(null);
      // Should not throw
      act(() => {
        result.current.store.set(playheadAtom, 5);
      });
    });
  });

  describe("video → atoms sync", () => {
    it("updates playhead and currentTime atoms when timeupdate fires", () => {
      const video = makeVideo(0);
      const { result } = renderSync(video);

      act(() => {
        video.currentTime = 3.5;
        video._fire("timeupdate");
      });

      expect(result.current.playhead).toBe(3.5);
      expect(result.current.currentTime).toBe(3.5);
    });

    it("sets isPlayingAtom to false when the ended event fires", () => {
      const video = makeVideo(0);
      const { result } = renderSync(video);

      act(() => {
        result.current.store.set(isPlayingAtom, true);
      });
      act(() => {
        video._fire("ended");
      });

      expect(result.current.isPlaying).toBe(false);
      expect(video.pause).toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("removes timeupdate and ended listeners when unmounted", () => {
      const video = makeVideo();
      const { unmount } = renderSync(video);

      act(() => unmount());

      expect(video.removeEventListener).toHaveBeenCalledWith(
        "timeupdate",
        expect.any(Function)
      );
      expect(video.removeEventListener).toHaveBeenCalledWith(
        "ended",
        expect.any(Function)
      );
    });
  });
});
