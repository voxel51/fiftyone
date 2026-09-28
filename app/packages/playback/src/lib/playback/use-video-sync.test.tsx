import { act, cleanup, renderHook } from "@testing-library/react";
import { useAtomValue } from "jotai";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isBufferingAtom,
  isPlayingAtom,
  seekEventAtom,
  speedAtom,
} from "./atoms";
import { PlaybackProvider, usePlaybackStore } from "./PlaybackProvider";
import { getMasterMuted, setMasterMuted } from "./store-access";
import { useVideoSync } from "./use-video-sync";

interface FakeVideo {
  currentTime: number;
  playbackRate: number;
  muted: boolean;
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
    playbackRate: 1,
    muted: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, fn: EventListener) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
    }),
    removeEventListener: vi.fn((event: string, fn: EventListener) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(
        event,
        arr.filter((f) => f !== fn),
      );
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
      };
    },
    {
      wrapper: ({ children }) => (
        <PlaybackProvider duration={duration} stepInterval={1 / 30}>
          {children}
        </PlaybackProvider>
      ),
    },
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

  describe("seek events → video", () => {
    it("seeks the video when a seek event fires", () => {
      const video = makeVideo(0);
      const { result } = renderSync(video);

      act(() => {
        result.current.store.set(seekEventAtom, { time: 5, seq: 1 });
      });

      expect(video.currentTime).toBe(5);
    });

    it("does not seek when the ref is null", () => {
      const { result } = renderSync(null);
      // Should not throw — the subscription guard exits early on null.
      act(() => {
        result.current.store.set(seekEventAtom, { time: 5, seq: 1 });
      });
    });
  });

  describe("ended handling", () => {
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

  describe("speed → playbackRate", () => {
    it("applies the current speed on mount", () => {
      const video = makeVideo();
      video.playbackRate = 3;
      renderSync(video);

      // the engine's default, pushed onto an element that was out of step
      expect(video.playbackRate).toBe(1);
    });

    it("follows speed changes", () => {
      const video = makeVideo();
      const { result } = renderSync(video);

      act(() => {
        result.current.store.set(speedAtom, 2);
      });

      // with a clock source registered the engine runs no `dt` arithmetic —
      // the element's rate is the only thing speed can act on
      expect(video.playbackRate).toBe(2);
    });

    it("does not throw when the ref is null", () => {
      const { result } = renderSync(null);
      act(() => {
        result.current.store.set(speedAtom, 2);
      });
    });

    it("re-applies the speed after the element loads a new source", () => {
      const video = makeVideo();
      const { result } = renderSync(video);

      act(() => {
        result.current.store.set(speedAtom, 2);
      });
      expect(video.playbackRate).toBe(2);

      // the media load algorithm resets the rate to defaultPlaybackRate on
      // every load, and the element is reused across samples
      video.playbackRate = 1;
      act(() => video._fire("loadstart"));

      expect(video.playbackRate).toBe(2);
    });
  });

  describe("autoplay-policy fallback", () => {
    /** A play() that is refused the way an unmuted element is refused. */
    function refusePlay(video: FakeVideo, times = 1) {
      let refusals = times;
      video.play.mockImplementation(() => {
        if (refusals-- > 0) {
          return Promise.reject(
            Object.assign(new Error("blocked"), { name: "NotAllowedError" }),
          );
        }
        return Promise.resolve(undefined);
      });
    }

    it("mutes and retries so the picture still plays", async () => {
      const video = makeVideo();
      const { result } = renderSync(video);
      // the surface is unmuted (see `useVideoElementAudio`); the policy
      // refuses it before a user gesture
      setMasterMuted(result.current.store, false);
      video.muted = false;
      refusePlay(video);
      video.play.mockClear();

      await act(async () => {
        result.current.store.set(isPlayingAtom, true);
      });

      expect(video.muted).toBe(true);
      expect(getMasterMuted(result.current.store)).toBe(true);
      // once refused, once retried with sound given up
      expect(video.play).toHaveBeenCalledTimes(2);
    });

    it("gives up rather than looping when a muted element is still refused", async () => {
      const video = makeVideo();
      const { result } = renderSync(video);
      video.muted = true;
      refusePlay(video, 5);
      video.play.mockClear();

      await act(async () => {
        result.current.store.set(isPlayingAtom, true);
      });

      // nothing left to concede — no retry, and no mute state to rewrite
      expect(video.play).toHaveBeenCalledTimes(1);
    });

    it("does not start the element when playing was cancelled mid-refusal", async () => {
      const video = makeVideo();
      const { result } = renderSync(video);
      setMasterMuted(result.current.store, false);
      video.muted = false;

      // hold the refusal open so the state can change before it settles
      let refuse: () => void = () => undefined;
      video.play.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            refuse = () =>
              reject(
                Object.assign(new Error("blocked"), {
                  name: "NotAllowedError",
                }),
              );
          }),
      );

      act(() => {
        result.current.store.set(isPlayingAtom, true);
      });
      video.play.mockClear();

      // the engine's barrier raises buffering while a blocking stream loads
      act(() => {
        result.current.store.set(isBufferingAtom, true);
      });

      await act(async () => {
        refuse();
      });

      // with this element registered as the clock source, retrying here
      // would advance the playhead past a barrier meant to hold it
      expect(video.play).not.toHaveBeenCalled();
    });

    it("leaves audio alone when play fails for some other reason", async () => {
      const video = makeVideo();
      const { result } = renderSync(video);
      setMasterMuted(result.current.store, false);
      video.muted = false;
      video.play.mockImplementation(() =>
        Promise.reject(
          Object.assign(new Error("decode"), { name: "NotSupportedError" }),
        ),
      );
      video.play.mockClear();

      await act(async () => {
        result.current.store.set(isPlayingAtom, true);
      });

      expect(video.muted).toBe(false);
      expect(getMasterMuted(result.current.store)).toBe(false);
      expect(video.play).toHaveBeenCalledTimes(1);
    });
  });

  describe("cleanup", () => {
    it("removes the ended listener when unmounted", () => {
      const video = makeVideo();
      const { unmount } = renderSync(video);

      act(() => unmount());

      expect(video.removeEventListener).toHaveBeenCalledWith(
        "ended",
        expect.any(Function),
      );
    });
  });
});
