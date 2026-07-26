import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bufferedRangesAtom,
  currentTimeAtom,
  durationAtom,
  isBufferingAtom,
  isPlayPendingAtom,
  isPlayingAtom,
  loopEndAtom,
  loopStartAtom,
  playheadAtom,
  seekEventAtom,
  speedAtom,
  stepIntervalAtom,
  viewEndAtom,
  viewStartAtom,
} from "./atoms";
import {
  PlaybackProvider,
  useMode,
  usePlayback,
  usePlaybackStore,
} from "./PlaybackProvider";
import {
  bumpStreamRangesVersion,
  setBufferedRanges,
  setSeekFetchDebounceMs,
} from "./store-access";
import type { PlaybackStream, TimelineMode } from "./types";
import { MAX_SPEED } from "../constants";

interface RenderOpts {
  duration?: number;
  defaultLoopStart?: number;
  defaultLoopEnd?: number;
  snapToFrameOnSettle?: boolean;
  seekFetchDebounceMs?: number;
}

function renderEngine(opts: RenderOpts = {}) {
  const {
    duration = 10,
    defaultLoopStart,
    defaultLoopEnd,
    snapToFrameOnSettle,
    seekFetchDebounceMs,
  } = opts;
  return renderHook(
    () => {
      const store = usePlaybackStore();
      return {
        api: usePlayback(),
        store,
        // Playback atoms live on the PlaybackProvider's store; target it
        // explicitly so reads still work after we stopped mounting a
        // Jotai `<Provider>` for the playback store.
        playhead: useAtomValue(playheadAtom, { store }),
        currentTime: useAtomValue(currentTimeAtom, { store }),
        isPlaying: useAtomValue(isPlayingAtom, { store }),
        isPlayPending: useAtomValue(isPlayPendingAtom, { store }),
        isBuffering: useAtomValue(isBufferingAtom, { store }),
      };
    },
    {
      wrapper: ({ children }) => (
        <PlaybackProvider
          duration={duration}
          stepInterval={1 / 30}
          defaultLoopStart={defaultLoopStart}
          defaultLoopEnd={defaultLoopEnd}
          snapToFrameOnSettle={snapToFrameOnSettle}
          seekFetchDebounceMs={seekFetchDebounceMs}
        >
          {children}
        </PlaybackProvider>
      ),
    },
  );
}

/**
 * Makes a stream that is always ready / always loading / always missing.
 * The test selects the readiness so we can assert how the engine reacts.
 */
function readyStream(id: string): PlaybackStream {
  return { id, blocking: true, bufferState: () => "ready" };
}
function loadingStream(id: string): PlaybackStream {
  return { id, blocking: true, bufferState: () => "loading" };
}

describe("PlaybackProvider engine actions", () => {
  afterEach(() => cleanup());

  describe("seek", () => {
    it("clamps time to [0, duration]", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.seek(50));
      expect(result.current.playhead).toBe(10);
      act(() => result.current.api.seek(-5));
      expect(result.current.playhead).toBe(0);
    });

    it("updates the visual playhead immediately", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.seek(3.5));
      expect(result.current.playhead).toBe(3.5);
    });

    it("commits currentTime when no blocking streams are registered", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.seek(4));
      expect(result.current.currentTime).toBe(4);
    });

    it("commits currentTime when all blocking streams are ready", () => {
      const { result } = renderEngine({ duration: 10 });
      let unsub!: () => void;
      act(() => {
        unsub = result.current.api.registerStream(readyStream("cam"));
        result.current.api.subscribeStream("cam");
      });
      act(() => result.current.api.seek(4));
      expect(result.current.currentTime).toBe(4);
      act(() => unsub());
    });

    it("does NOT commit currentTime when an active blocking stream is not ready", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => {
        result.current.api.registerStream(loadingStream("cam"));
        result.current.api.subscribeStream("cam");
      });
      act(() => result.current.api.seek(4));
      expect(result.current.playhead).toBe(4);
      // Stream is loading → no commit; currentTime stays at 0.
      expect(result.current.currentTime).toBe(0);
    });

    it("DOES commit when a registered blocking stream has no subscribers (dormant)", () => {
      const { result } = renderEngine({ duration: 10 });
      // Registered but never subscribed → dormant → engine skips it.
      act(() => {
        result.current.api.registerStream(loadingStream("cam"));
      });
      act(() => result.current.api.seek(4));
      expect(result.current.currentTime).toBe(4);
    });

    it("ignores non-blocking streams in the readiness check", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => {
        result.current.api.registerStream({
          id: "ann",
          blocking: false,
          bufferState: () => "missing",
        });
        result.current.api.subscribeStream("ann");
      });
      act(() => result.current.api.seek(4));
      expect(result.current.currentTime).toBe(4);
    });
  });

  describe("paused settle loop", () => {
    // Drive requestAnimationFrame manually so the settle loop is
    // deterministic. flushFrame() runs whatever the engine has queued.
    function withManualRaf(body: (flushFrame: () => void) => void): void {
      const queue: FrameRequestCallback[] = [];
      const rafSpy = vi
        .spyOn(globalThis, "requestAnimationFrame")
        .mockImplementation((cb) => {
          queue.push(cb);
          return queue.length;
        });
      const cafSpy = vi
        .spyOn(globalThis, "cancelAnimationFrame")
        .mockImplementation(() => {});
      const flushFrame = () => {
        const cbs = queue.splice(0, queue.length);
        act(() => cbs.forEach((cb) => cb(0)));
      };
      try {
        body(flushFrame);
      } finally {
        rafSpy.mockRestore();
        cafSpy.mockRestore();
      }
    }

    it("raises isBuffering and commits a paused seek once a stream becomes ready", () => {
      withManualRaf((flushFrame) => {
        const { result } = renderEngine({ duration: 10 });
        let state: "loading" | "ready" = "loading";
        act(() => {
          result.current.api.registerStream({
            id: "cam",
            blocking: true,
            bufferState: () => state,
          });
          result.current.api.subscribeStream("cam");
        });

        // Seek into an unbuffered region while paused: playhead moves, but
        // the frame can't commit yet.
        act(() => result.current.api.seek(4));
        expect(result.current.playhead).toBe(4);
        expect(result.current.currentTime).toBe(0);
        expect(result.current.isPlaying).toBe(false);
        expect(result.current.isBuffering).toBe(true);

        // Settle loop keeps polling while the stream is still loading.
        flushFrame();
        expect(result.current.currentTime).toBe(0);
        expect(result.current.isBuffering).toBe(true);

        // Stream finishes buffering → the next settle frame commits,
        // without the user ever hitting play.
        state = "ready";
        flushFrame();
        expect(result.current.currentTime).toBe(4);
        expect(result.current.isBuffering).toBe(false);
      });
    });

    it("prefetch-nudges the buffering stream while paused", () => {
      withManualRaf((flushFrame) => {
        const { result } = renderEngine({ duration: 10 });
        const prefetch = vi.fn();
        act(() => {
          result.current.api.registerStream({
            id: "cam",
            blocking: true,
            bufferState: () => "missing",
            prefetch,
          });
          result.current.api.subscribeStream("cam");
        });

        // A paused seek must kick the stream to fetch — otherwise a stream
        // that only fetches via this nudge (e.g. the ImaVid image stream)
        // would never load the seeked frame until play.
        act(() => result.current.api.seek(4));
        expect(prefetch).toHaveBeenCalled();
        expect(result.current.isBuffering).toBe(true);

        prefetch.mockClear();
        flushFrame();
        expect(prefetch).toHaveBeenCalled();
      });
    });

    it("stepForward / stepBack mirror readiness into isBuffering", () => {
      let ready = false;
      const { result } = renderEngine({ duration: 10 });
      act(() => {
        result.current.api.registerStream({
          id: "cam",
          blocking: true,
          bufferState: () => (ready ? "ready" : "loading"),
        });
        result.current.api.subscribeStream("cam");
      });

      act(() => result.current.api.stepForward());
      expect(result.current.isBuffering).toBe(true);

      ready = true;
      act(() => result.current.api.stepBack());
      expect(result.current.isBuffering).toBe(false);
    });
  });

  describe("stepForward / stepBack", () => {
    it("stepForward advances the playhead by stepInterval", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.stepForward());
      // stepInterval = 1/30 ≈ 0.0333
      expect(result.current.playhead).toBeCloseTo(1 / 30, 5);
    });

    it("stepForward clamps at duration", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.seek(10));
      act(() => result.current.api.stepForward());
      expect(result.current.playhead).toBe(10);
    });

    it("stepBack subtracts stepInterval", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.seek(5));
      act(() => result.current.api.stepBack());
      expect(result.current.playhead).toBeCloseTo(5 - 1 / 30, 5);
    });

    it("stepBack clamps at 0", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.stepBack());
      expect(result.current.playhead).toBe(0);
    });

    it("snaps to frame boundaries from a mid-frame playhead", () => {
      const { result } = renderEngine({ duration: 10 });
      // Land between frame 30 (start 29/30) and frame 31 (start 30/30 = 1).
      act(() => result.current.api.seek(0.99));
      act(() => result.current.api.stepForward());
      // Displayed frame at t=0.99 is 30 (zero-indexed K=29); forward → K=30.
      expect(result.current.playhead).toBeCloseTo(30 / 30, 5);

      act(() => result.current.api.seek(0.99));
      act(() => result.current.api.stepBack());
      // back from displayed frame 30 → frame 29 (K=28).
      expect(result.current.playhead).toBeCloseTo(28 / 30, 5);
    });
  });

  describe("play / pause", () => {
    it("play sets isPlaying true", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.play());
      expect(result.current.isPlaying).toBe(true);
    });

    it("pause sets isPlaying false", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.play());
      act(() => result.current.api.pause());
      expect(result.current.isPlaying).toBe(false);
    });

    it("play resets the playhead to loopStart when it sits outside the loop", () => {
      const { result } = renderEngine({
        duration: 10,
        defaultLoopStart: 3,
        defaultLoopEnd: 7,
      });
      act(() => result.current.api.seek(9));
      expect(result.current.playhead).toBe(9);
      act(() => result.current.api.play());
      expect(result.current.playhead).toBe(3);
    });

    it("play leaves the playhead alone when it's already inside the loop", () => {
      const { result } = renderEngine({
        duration: 10,
        defaultLoopStart: 3,
        defaultLoopEnd: 7,
      });
      act(() => result.current.api.seek(5));
      act(() => result.current.api.play());
      expect(result.current.playhead).toBe(5);
    });

    it("queues play until a stream's startup buffer window is covered", () => {
      let ranges: Array<[number, number]> = [[0, 0.05]];
      const prefetch = vi.fn();
      const { result } = renderEngine({ duration: 10 });

      act(() => {
        result.current.api.registerStream({
          id: "mcap",
          blocking: true,
          lookaheadSeconds: 0.3,
          startupBufferSeconds: 0.3,
          bufferState: (time) =>
            ranges.some(([start, end]) => time >= start && time < end)
              ? "ready"
              : "missing",
          bufferedRanges: () => ranges,
          prefetch,
        });
        result.current.api.subscribeStream("mcap");
      });

      act(() => result.current.api.play());
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.isPlayPending).toBe(true);
      expect(result.current.isBuffering).toBe(true);
      expect(prefetch).toHaveBeenCalledWith([0, 0.3]);

      act(() => {
        ranges = [[0, 0.3]];
        setBufferedRanges(result.current.store, ranges);
      });
      expect(result.current.isPlaying).toBe(true);
      expect(result.current.isPlayPending).toBe(false);
      expect(result.current.isBuffering).toBe(false);
    });

    it("retries queued play when a private stream range changes", () => {
      let placementRanges: Array<[number, number]> = [[0, 0.05]];
      const dataRanges: Array<[number, number]> = [[0, 10]];
      const { result } = renderEngine({ duration: 10 });

      act(() => {
        result.current.api.registerStream({
          id: "data",
          blocking: true,
          bufferState: () => "ready",
          bufferedRanges: () => dataRanges,
        });
        result.current.api.registerStream({
          id: "placement",
          blocking: true,
          startupBufferSeconds: 0.3,
          bufferState: () => "ready",
          bufferedRanges: () => placementRanges,
        });
        result.current.api.subscribeStream("data");
        result.current.api.subscribeStream("placement");
        setBufferedRanges(result.current.store, dataRanges);
      });

      act(() => result.current.api.play());
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.isPlayPending).toBe(true);

      act(() => {
        placementRanges = [[0, 0.3]];
        bumpStreamRangesVersion(result.current.store);
      });
      expect(result.current.isPlaying).toBe(true);
      expect(result.current.isPlayPending).toBe(false);
      expect(result.current.store.get(bufferedRangesAtom)).toBe(dataRanges);
    });

    it("bounds how long startup coverage may hold a ready current frame", async () => {
      vi.useFakeTimers();
      try {
        const ranges: Array<[number, number]> = [[0, 0.05]];
        const { result } = renderEngine({ duration: 10 });

        act(() => {
          result.current.api.registerStream({
            id: "mcap",
            blocking: true,
            startupBufferSeconds: 3,
            startupBufferMaxWaitSeconds: 1,
            bufferState: () => "ready",
            bufferedRanges: () => ranges,
          });
          result.current.api.subscribeStream("mcap");
          result.current.api.play();
        });

        expect(result.current.isPlayPending).toBe(true);
        await act(() => vi.advanceTimersByTimeAsync(999));
        expect(result.current.isPlaying).toBe(false);

        await act(() => vi.advanceTimersByTimeAsync(1));
        expect(result.current.isPlaying).toBe(true);
        expect(result.current.isPlayPending).toBe(false);
        expect(result.current.isBuffering).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps the startup deadline stable across wall-clock changes", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
        const ranges: Array<[number, number]> = [[0, 0.05]];
        const { result } = renderEngine({ duration: 10 });

        act(() => {
          result.current.api.registerStream({
            id: "mcap",
            blocking: true,
            startupBufferSeconds: 3,
            startupBufferMaxWaitSeconds: 1,
            bufferState: () => "ready",
            bufferedRanges: () => ranges,
          });
          result.current.api.subscribeStream("mcap");
          result.current.api.play();
        });

        vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
        act(() => bumpStreamRangesVersion(result.current.store));
        expect(result.current.isPlayPending).toBe(true);
        expect(result.current.isPlaying).toBe(false);

        await act(() => vi.advanceTimersByTimeAsync(1_000));
        expect(result.current.isPlaying).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not bypass an unready current frame after the startup deadline", async () => {
      vi.useFakeTimers();
      try {
        let currentReady = false;
        const ranges: Array<[number, number]> = [];
        const { result } = renderEngine({ duration: 10 });

        act(() => {
          result.current.api.registerStream({
            id: "mcap",
            blocking: true,
            startupBufferSeconds: 3,
            startupBufferMaxWaitSeconds: 0.1,
            bufferState: () => (currentReady ? "ready" : "missing"),
            bufferedRanges: () => ranges,
          });
          result.current.api.subscribeStream("mcap");
          result.current.api.play();
        });

        await act(() => vi.advanceTimersByTimeAsync(100));
        expect(result.current.isPlaying).toBe(false);
        expect(result.current.isPlayPending).toBe(true);

        act(() => {
          currentReady = true;
          bumpStreamRangesVersion(result.current.store);
        });
        expect(result.current.isPlaying).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("advances through distinct blocking-stream startup deadlines", async () => {
      vi.useFakeTimers();
      try {
        const { result } = renderEngine({ duration: 10 });
        const ranges: Array<[number, number]> = [[0, 0.05]];

        act(() => {
          for (const [id, maxWaitSeconds] of [
            ["fast-deadline", 0.1],
            ["slow-deadline", 0.2],
          ] as const) {
            result.current.api.registerStream({
              id,
              blocking: true,
              startupBufferSeconds: 3,
              startupBufferMaxWaitSeconds: maxWaitSeconds,
              bufferState: () => "ready",
              bufferedRanges: () => ranges,
            });
            result.current.api.subscribeStream(id);
          }
          result.current.api.play();
        });

        await act(() => vi.advanceTimersByTimeAsync(100));
        expect(result.current.isPlaying).toBe(false);
        expect(result.current.isPlayPending).toBe(true);

        await act(() => vi.advanceTimersByTimeAsync(100));
        expect(result.current.isPlaying).toBe(true);
        expect(result.current.isPlayPending).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("starts immediately when the startup buffer window is already covered", () => {
      const ranges: Array<[number, number]> = [[0, 0.3]];
      const prefetch = vi.fn();
      const { result } = renderEngine({ duration: 10 });

      act(() => {
        result.current.api.registerStream({
          id: "mcap",
          blocking: true,
          lookaheadSeconds: 0.3,
          startupBufferSeconds: 0.3,
          bufferState: (time) =>
            ranges.some(([start, end]) => time >= start && time < end)
              ? "ready"
              : "missing",
          bufferedRanges: () => ranges,
          prefetch,
        });
        result.current.api.subscribeStream("mcap");
      });

      act(() => result.current.api.play());
      expect(result.current.isPlaying).toBe(true);
      expect(result.current.isPlayPending).toBe(false);
      expect(result.current.isBuffering).toBe(false);
      expect(prefetch).not.toHaveBeenCalled();
    });

    it("starts when a ticked stream's buffered range begins just after the seek time", () => {
      const nativeStep = 1 / 30;
      const seekTime = 10.26;
      const firstBufferedTick = 10 + 8 * nativeStep;
      const startupSeconds = 0.3;
      const ranges: Array<[number, number]> = [
        [firstBufferedTick, seekTime + startupSeconds],
      ];
      const prefetch = vi.fn();
      const { result } = renderEngine({ duration: 20 });

      act(() => {
        result.current.api.registerStream({
          id: "mcap",
          blocking: true,
          nativeStepSeconds: nativeStep,
          lookaheadSeconds: startupSeconds,
          startupBufferSeconds: startupSeconds,
          bufferState: (time) =>
            time >= firstBufferedTick - nativeStep / 2 && time < ranges[0][1]
              ? "ready"
              : "missing",
          bufferedRanges: () => ranges,
          prefetch,
        });
        result.current.api.subscribeStream("mcap");
      });

      act(() => result.current.api.seek(seekTime));
      act(() => result.current.api.play());

      expect(result.current.isPlaying).toBe(true);
      expect(result.current.isPlayPending).toBe(false);
      expect(result.current.isBuffering).toBe(false);
      expect(prefetch).not.toHaveBeenCalled();
    });

    it("queues play when no duration or active stream is known yet", () => {
      const { result } = renderEngine({ duration: 0 });

      act(() => result.current.api.play());
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.isPlayPending).toBe(true);
      expect(result.current.isBuffering).toBe(true);

      act(() => {
        result.current.api.registerStream({
          id: "mcap",
          blocking: true,
          duration: 10,
          bufferState: () => "ready",
        });
      });
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.isPlayPending).toBe(true);

      act(() => result.current.api.subscribeStream("mcap"));
      expect(result.current.isPlaying).toBe(true);
      expect(result.current.isPlayPending).toBe(false);
      expect(result.current.isBuffering).toBe(false);
    });

    it("pause cancels a queued play request before playback starts", () => {
      const ranges: Array<[number, number]> = [[0, 0.05]];
      const { result } = renderEngine({ duration: 10 });

      act(() => {
        result.current.api.registerStream({
          id: "mcap",
          blocking: true,
          lookaheadSeconds: 0.3,
          startupBufferSeconds: 0.3,
          bufferState: (time) =>
            ranges.some(([start, end]) => time >= start && time < end)
              ? "ready"
              : "missing",
          bufferedRanges: () => ranges,
        });
        result.current.api.subscribeStream("mcap");
      });

      act(() => result.current.api.play());
      expect(result.current.isPlayPending).toBe(true);

      act(() => result.current.api.pause());
      expect(result.current.isPlaying).toBe(false);
      expect(result.current.isPlayPending).toBe(false);
      expect(result.current.isBuffering).toBe(false);
    });
  });

  describe("snapToFrameOnSettle", () => {
    // stepInterval = 1/30; frame K starts at K/30. 0.52s sits inside frame 15
    // ([0.5, 0.5333)), so the displayed-frame start is 0.5.
    const MID_FRAME = 0.52;
    const FRAME_START = 0.5;

    it("pause snaps the playhead to the displayed frame start when enabled", () => {
      const { result } = renderEngine({ snapToFrameOnSettle: true });
      act(() => result.current.api.seek(MID_FRAME));
      expect(result.current.playhead).toBe(MID_FRAME);
      act(() => result.current.api.pause());
      expect(result.current.playhead).toBeCloseTo(FRAME_START, 5);
      // The committed time follows so per-frame consumers re-read the frame.
      expect(result.current.currentTime).toBeCloseTo(FRAME_START, 5);
    });

    it("pause leaves a mid-frame playhead untouched when disabled (continuous)", () => {
      const { result } = renderEngine();
      act(() => result.current.api.seek(MID_FRAME));
      act(() => result.current.api.pause());
      expect(result.current.playhead).toBe(MID_FRAME);
    });

    it("snapPlayheadToFrame is a no-op when disabled", () => {
      const { result } = renderEngine();
      act(() => result.current.api.seek(MID_FRAME));
      act(() => result.current.api.snapPlayheadToFrame());
      expect(result.current.playhead).toBe(MID_FRAME);
    });

    it("snapPlayheadToFrame aligns the playhead when enabled", () => {
      const { result } = renderEngine({ snapToFrameOnSettle: true });
      act(() => result.current.api.seek(MID_FRAME));
      act(() => result.current.api.snapPlayheadToFrame());
      expect(result.current.playhead).toBeCloseTo(FRAME_START, 5);
    });

    it("leaves an already-aligned playhead exactly in place (no drift)", () => {
      const { result } = renderEngine({ snapToFrameOnSettle: true });
      act(() => result.current.api.seek(FRAME_START));
      act(() => result.current.api.pause());
      expect(result.current.playhead).toBe(FRAME_START);
    });

    describe("seekSnapped (mid-drag scrub path)", () => {
      // Continuous-time targets that all sit within half a frame of
      // anchor 15 (0.5s) at step = 1/30 (half-step ≈ 0.0167). With
      // nearest-anchor snap on, every one rounds to 0.5; with snapping
      // off, each target is preserved exactly (no quantization).
      const SUBFRAME_TARGETS = [0.501, 0.508, 0.515];

      it("snaps every mid-drag target to the displayed frame start when enabled", () => {
        const { result } = renderEngine({ snapToFrameOnSettle: true });
        for (const t of SUBFRAME_TARGETS) {
          act(() => result.current.api.seekSnapped(t));
          expect(result.current.playhead).toBeCloseTo(FRAME_START, 5);
        }
        // currentTime tracks the snapped value too (no blocking stream gate).
        expect(result.current.currentTime).toBeCloseTo(FRAME_START, 5);
      });

      it("passes through continuous time when snapping is disabled", () => {
        const { result } = renderEngine();
        for (const t of SUBFRAME_TARGETS) {
          act(() => result.current.api.seekSnapped(t));
          expect(result.current.playhead).toBe(t);
        }
      });

      it("clamps the target to [0, duration] before snapping", () => {
        const { result } = renderEngine({
          duration: 10,
          snapToFrameOnSettle: true,
        });
        act(() => result.current.api.seekSnapped(-5));
        expect(result.current.playhead).toBe(0);
        act(() => result.current.api.seekSnapped(999));
        // 10s is already a frame boundary at 1/30 step (300 frames).
        expect(result.current.playhead).toBeCloseTo(10, 5);
      });

      it("crossing frame boundaries during a drag advances the playhead in discrete jumps", () => {
        const { result } = renderEngine({ snapToFrameOnSettle: true });
        // Nearest-anchor snap at step = 1/30:
        //   0.51 * 30 = 15.3 → round 15 → snap to 15/30.
        act(() => result.current.api.seekSnapped(0.51));
        expect(result.current.playhead).toBeCloseTo(15 / 30, 5);
        //   0.54 * 30 = 16.2 → round 16 → snap to 16/30.
        act(() => result.current.api.seekSnapped(0.54));
        expect(result.current.playhead).toBeCloseTo(16 / 30, 5);
        //   0.52 * 30 = 15.6 → round 16 → snap to 16/30 (rounds toward
        //   the nearer anchor; no dead-band on either side).
        act(() => result.current.api.seekSnapped(0.52));
        expect(result.current.playhead).toBeCloseTo(16 / 30, 5);
      });

      describe("symmetric nearest-frame snap", () => {
        const STEP = 1 / 30;
        const T = (n: number) => n * STEP;

        it("target within a quarter-step of the current anchor stays put", () => {
          const { result } = renderEngine({ snapToFrameOnSettle: true });
          // Settle on T(5).
          act(() => result.current.api.seekSnapped(T(5)));
          expect(result.current.playhead).toBeCloseTo(T(5), 5);
          // A target a quarter-step past T(5) is still nearest to T(5).
          act(() => result.current.api.seekSnapped(T(5) + STEP * 0.25));
          expect(result.current.playhead).toBeCloseTo(T(5), 5);
        });

        it("dragging forward by exactly one frame width advances one frame", () => {
          const { result } = renderEngine({ snapToFrameOnSettle: true });
          act(() => result.current.api.seekSnapped(T(5)));
          // Cursor at T(5) + STEP = T(6) → round → snap to T(6).
          act(() => result.current.api.seekSnapped(T(5) + STEP));
          expect(result.current.playhead).toBeCloseTo(T(6), 5);
        });

        it("dragging backward by exactly one frame width retreats one frame", () => {
          const { result } = renderEngine({ snapToFrameOnSettle: true });
          act(() => result.current.api.seekSnapped(T(5)));
          // Cursor at T(5) - STEP = T(4) → round → snap to T(4). Symmetric
          // counterpart of the forward case; no per-direction asymmetry.
          act(() => result.current.api.seekSnapped(T(5) - STEP));
          expect(result.current.playhead).toBeCloseTo(T(4), 5);
        });

        it("dragging forward by half a frame width snaps to the next anchor", () => {
          // JS Math.round ties toward +Infinity, so an exact half-step
          // forward tips to the upper anchor. Validates the visual-symmetry
          // story: a sub-frame forward gesture that crosses the cell
          // midpoint commits to the next anchor.
          const { result } = renderEngine({ snapToFrameOnSettle: true });
          act(() => result.current.api.seekSnapped(T(5)));
          act(() => result.current.api.seekSnapped(T(5) + STEP * 0.5));
          expect(result.current.playhead).toBeCloseTo(T(6), 5);
        });

        it("dragging backward by half a frame width does not move the playhead", () => {
          // Half-step backward sits exactly on a tie. JS Math.round
          // rounds half UP (toward +Infinity), so -1.5 → -1 → snap back
          // to the current anchor. Net effect: a half-frame backward
          // gesture is treated as no movement. Acceptable — at the exact
          // midpoint the tie has to go one way, and "forward bias" is
          // perceptually invisible at sub-frame mouse precision.
          const { result } = renderEngine({ snapToFrameOnSettle: true });
          act(() => result.current.api.seekSnapped(T(5)));
          act(() => result.current.api.seekSnapped(T(5) - STEP * 0.5));
          expect(result.current.playhead).toBeCloseTo(T(5), 5);
        });

        it("forward and backward thresholds are identical in absolute seconds", () => {
          // From the same starting anchor, advancing by +delta and retreating
          // by -delta must produce mirror-image behavior for any delta == STEP.
          const renderFwd = renderEngine({ snapToFrameOnSettle: true });
          act(() => renderFwd.result.current.api.seekSnapped(T(5)));
          act(() => renderFwd.result.current.api.seekSnapped(T(5) + STEP));
          const fwdDelta = renderFwd.result.current.playhead - T(5);

          const renderBack = renderEngine({ snapToFrameOnSettle: true });
          act(() => renderBack.result.current.api.seekSnapped(T(5)));
          act(() => renderBack.result.current.api.seekSnapped(T(5) - STEP));
          const backDelta = T(5) - renderBack.result.current.playhead;

          expect(fwdDelta).toBeCloseTo(backDelta, 5);
          expect(fwdDelta).toBeCloseTo(STEP, 5);
        });

        it("big forward jump past multiple anchors snaps to the landing frame", () => {
          const { result } = renderEngine({ snapToFrameOnSettle: true });
          act(() => result.current.api.seekSnapped(T(5)));
          act(() => result.current.api.seekSnapped(T(10)));
          expect(result.current.playhead).toBeCloseTo(T(10), 5);
        });

        it("big backward jump past multiple anchors snaps to the landing frame", () => {
          const { result } = renderEngine({ snapToFrameOnSettle: true });
          act(() => result.current.api.seekSnapped(T(10)));
          act(() => result.current.api.seekSnapped(T(3)));
          expect(result.current.playhead).toBeCloseTo(T(3), 5);
        });
      });
    });
  });

  describe("setView / setLoop / setSpeed", () => {
    it("setView writes both viewStart and viewEnd", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.setView(2, 7));
      expect(result.current.store.get(viewStartAtom)).toBe(2);
      expect(result.current.store.get(viewEndAtom)).toBe(7);
    });

    it("setLoop writes both loopStart and loopEnd", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.setLoop(1, 6));
      expect(result.current.store.get(loopStartAtom)).toBe(1);
      expect(result.current.store.get(loopEndAtom)).toBe(6);
    });

    it("setLoop clamps out-of-range bounds to [0, duration]", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.setLoop(-2, 20));
      expect(result.current.store.get(loopStartAtom)).toBe(0);
      expect(result.current.store.get(loopEndAtom)).toBe(10);
    });

    it("setLoop rejects inverted / collapsed windows (end <= start)", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.setLoop(2, 7));
      act(() => result.current.api.setLoop(8, 4));
      expect(result.current.store.get(loopStartAtom)).toBe(2);
      expect(result.current.store.get(loopEndAtom)).toBe(7);
    });

    it("setSpeed writes the speed atom", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.setSpeed(2));
      expect(result.current.store.get(speedAtom)).toBe(2);
    });

    it("setSpeed rejects NaN, Infinity, 0, and negative values", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.setSpeed(3));
      const before = result.current.store.get(speedAtom);
      act(() => result.current.api.setSpeed(NaN));
      act(() => result.current.api.setSpeed(Infinity));
      act(() => result.current.api.setSpeed(0));
      act(() => result.current.api.setSpeed(-1));
      expect(result.current.store.get(speedAtom)).toBe(before);
    });

    it("setSpeed clamps values above MAX_SPEED to the ceiling", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => result.current.api.setSpeed(MAX_SPEED + 100));
      expect(result.current.store.get(speedAtom)).toBe(MAX_SPEED);
    });
  });

  describe("registerStream / duration recompute", () => {
    it("durationAtom uses the provider's fallback when no stream provides one", () => {
      const { result } = renderEngine({ duration: 10 });
      expect(result.current.store.get(durationAtom)).toBe(10);
    });

    it("updates durationAtom to the max of registered streams' durations", () => {
      const { result } = renderEngine({ duration: 5 });
      let unsub!: () => void;
      act(() => {
        unsub = result.current.api.registerStream({
          id: "long",
          blocking: true,
          duration: 25,
          bufferState: () => "ready",
        });
      });
      expect(result.current.store.get(durationAtom)).toBe(25);
      act(() => unsub());
    });

    it("falls back to the next-best duration after an unregister", () => {
      const { result } = renderEngine({ duration: 5 });
      let unsubLong!: () => void;
      let unsubShort!: () => void;
      act(() => {
        unsubLong = result.current.api.registerStream({
          id: "long",
          blocking: true,
          duration: 30,
          bufferState: () => "ready",
        });
        unsubShort = result.current.api.registerStream({
          id: "short",
          blocking: true,
          duration: 12,
          bufferState: () => "ready",
        });
      });
      expect(result.current.store.get(durationAtom)).toBe(30);
      act(() => unsubLong());
      expect(result.current.store.get(durationAtom)).toBe(12);
      act(() => unsubShort());
      expect(result.current.store.get(durationAtom)).toBe(5);
    });

    it("keeps viewEnd / loopEnd tracking duration as long as they haven't been customized", () => {
      const { result } = renderEngine({ duration: 5 });
      // viewEnd and loopEnd were initialized to 5.
      expect(result.current.store.get(viewEndAtom)).toBe(5);
      expect(result.current.store.get(loopEndAtom)).toBe(5);

      act(() => {
        result.current.api.registerStream({
          id: "long",
          blocking: true,
          duration: 25,
          bufferState: () => "ready",
        });
      });
      // Both should auto-track the new duration since they were sitting at
      // the previous duration value (signalling the user hadn't customized).
      expect(result.current.store.get(viewEndAtom)).toBe(25);
      expect(result.current.store.get(loopEndAtom)).toBe(25);
    });

    it("stops auto-tracking once the user has customized view/loop", () => {
      const { result } = renderEngine({ duration: 5 });
      act(() => result.current.api.setView(0, 3));
      act(() => result.current.api.setLoop(0, 3));
      act(() => {
        result.current.api.registerStream({
          id: "long",
          blocking: true,
          duration: 25,
          bufferState: () => "ready",
        });
      });
      // User customized → engine should NOT clobber their values.
      expect(result.current.store.get(viewEndAtom)).toBe(3);
      expect(result.current.store.get(loopEndAtom)).toBe(3);
    });

    it("invokes registerStream's returned cleanup to deregister", () => {
      const { result } = renderEngine({ duration: 10 });
      let unsub!: () => void;
      act(() => {
        unsub = result.current.api.registerStream({
          id: "tmp",
          blocking: true,
          duration: 30,
          bufferState: () => "ready",
        });
      });
      expect(result.current.store.get(durationAtom)).toBe(30);
      act(() => unsub());
      expect(result.current.store.get(durationAtom)).toBe(10);
    });

    it("a stale cleanup does not unregister a newer stream with the same id", () => {
      const { result } = renderEngine({ duration: 5 });
      const streamA: PlaybackStream = {
        id: "cam",
        blocking: true,
        duration: 30,
        bufferState: () => "ready",
      };
      const streamB: PlaybackStream = {
        id: "cam",
        blocking: true,
        duration: 42,
        bufferState: () => "ready",
      };
      let unsubA!: () => void;
      act(() => {
        unsubA = result.current.api.registerStream(streamA);
      });
      // Replace the registration with a newer instance under the same id.
      act(() => {
        result.current.api.registerStream(streamB);
      });
      expect(result.current.store.get(durationAtom)).toBe(42);
      // Old cleanup must NOT yank the newer stream.
      act(() => unsubA());
      expect(result.current.store.get(durationAtom)).toBe(42);
    });
  });

  describe("subscribeStream", () => {
    it("is reference-counted — second subscribe + one unsubscribe keeps it active", () => {
      const { result } = renderEngine({ duration: 10 });
      const stream = loadingStream("cam");
      let unsubA!: () => void;
      let unsubB!: () => void;
      act(() => {
        result.current.api.registerStream(stream);
        unsubA = result.current.api.subscribeStream("cam");
        unsubB = result.current.api.subscribeStream("cam");
      });
      // Two subscribers → still active.
      act(() => unsubA());
      // Should still block seek's commit (B is alive).
      act(() => result.current.api.seek(4));
      expect(result.current.playhead).toBe(4);
      expect(result.current.currentTime).toBe(0); // still blocked
      act(() => unsubB());
      // Both gone → dormant. New seek should now commit.
      act(() => result.current.api.seek(6));
      expect(result.current.currentTime).toBe(6);
    });

    it("the cleanup function is idempotent for the same subscriber", () => {
      const { result } = renderEngine({ duration: 10 });
      let unsub!: () => void;
      act(() => {
        result.current.api.registerStream(readyStream("cam"));
        unsub = result.current.api.subscribeStream("cam");
      });
      // Calling cleanup twice shouldn't throw.
      act(() => unsub());
      expect(() => act(() => unsub())).not.toThrow();
    });
  });

  describe("stepInterval derived from streams", () => {
    it("uses the provider's stepInterval prop when no stream declares a native step", () => {
      const { result } = renderEngine({ duration: 10 });
      expect(result.current.store.get(stepIntervalAtom)).toBeCloseTo(1 / 30, 6);
    });

    it("falls back to 1/30 when neither prop nor stream provides a step", () => {
      const { result } = renderHook(() => ({ store: usePlaybackStore() }), {
        wrapper: ({ children }) => (
          <PlaybackProvider>{children}</PlaybackProvider>
        ),
      });
      expect(result.current.store.get(stepIntervalAtom)).toBeCloseTo(1 / 30, 6);
    });

    it("adopts a registered stream's nativeStepSeconds", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => {
        result.current.api.registerStream({
          id: "fast",
          blocking: false,
          nativeStepSeconds: 1 / 100,
          bufferState: () => "ready",
        });
      });
      expect(result.current.store.get(stepIntervalAtom)).toBeCloseTo(
        1 / 100,
        6,
      );
    });

    it("picks the smallest nativeStepSeconds across streams", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => {
        result.current.api.registerStream({
          id: "slow",
          blocking: false,
          nativeStepSeconds: 0.1,
          bufferState: () => "ready",
        });
        result.current.api.registerStream({
          id: "fast",
          blocking: false,
          nativeStepSeconds: 0.01,
          bufferState: () => "ready",
        });
      });
      expect(result.current.store.get(stepIntervalAtom)).toBeCloseTo(0.01, 6);
    });

    it("reverts to the fallback once all native-step streams unregister", () => {
      const { result } = renderEngine({ duration: 10 });
      let unsub!: () => void;
      act(() => {
        unsub = result.current.api.registerStream({
          id: "fast",
          blocking: false,
          nativeStepSeconds: 0.01,
          bufferState: () => "ready",
        });
      });
      expect(result.current.store.get(stepIntervalAtom)).toBeCloseTo(0.01, 6);
      act(() => unsub());
      expect(result.current.store.get(stepIntervalAtom)).toBeCloseTo(1 / 30, 6);
    });

    it("ignores streams without a nativeStepSeconds", () => {
      const { result } = renderEngine({ duration: 10 });
      act(() => {
        result.current.api.registerStream({
          id: "unstepped",
          blocking: false,
          bufferState: () => "ready",
        });
      });
      // No step declared → still the provider fallback.
      expect(result.current.store.get(stepIntervalAtom)).toBeCloseTo(1 / 30, 6);
    });
  });

  describe("timeline mode", () => {
    // useMode()'s value must stay fixed for the provider's lifetime — the
    // engine's stepInterval fallback is captured once at mount (see
    // usePlaybackEngine's mount-scoped store useMemo), so a `mode` prop
    // change without a remount must NOT update what useMode() returns;
    // otherwise consumers would see a new display domain while the engine's
    // mode-dependent state stays stale. Callers that need a new mode must
    // remount the provider (e.g. keyed on the resolved mode).
    it("freezes the resolved mode at mount despite a later prop change", () => {
      function Probe({ onRender }: { onRender: (m: TimelineMode) => void }) {
        onRender(useMode());
        return null;
      }
      const seen: TimelineMode[] = [];
      const { rerender } = render(
        <PlaybackProvider duration={10} mode={{ kind: "sequence", fps: 30 }}>
          <Probe onRender={(m) => seen.push(m)} />
        </PlaybackProvider>,
      );
      expect(seen.at(-1)).toEqual({ kind: "sequence", fps: 30 });

      rerender(
        <PlaybackProvider duration={10} mode={{ kind: "sequence", fps: 60 }}>
          <Probe onRender={(m) => seen.push(m)} />
        </PlaybackProvider>,
      );
      expect(seen.at(-1)).toEqual({ kind: "sequence", fps: 30 });

      rerender(
        <PlaybackProvider
          duration={10}
          mode={{ kind: "absolute", epochAnchorMs: 12345 }}
        >
          <Probe onRender={(m) => seen.push(m)} />
        </PlaybackProvider>,
      );
      expect(seen.at(-1)).toEqual({ kind: "sequence", fps: 30 });
    });

    it("falls back to duration mode when the mount-time fps is invalid", () => {
      const { result } = renderHook(() => useMode(), {
        wrapper: ({ children }) => (
          <PlaybackProvider duration={10} mode={{ kind: "sequence", fps: 0 }}>
            {children}
          </PlaybackProvider>
        ),
      });
      expect(result.current).toEqual({ kind: "duration" });
    });
  });

  describe("seek fetch debouncing", () => {
    it("emits every seek event immediately", () => {
      const { result } = renderEngine({ duration: 10 });
      const events: Array<{ seq: number; time: number }> = [];
      const unsubscribe = result.current.store.sub(seekEventAtom, () => {
        const event = result.current.store.get(seekEventAtom);
        if (event) events.push(event);
      });

      act(() => {
        result.current.api.seek(1);
        result.current.api.seek(2);
        result.current.api.seek(3);
      });

      expect(events.map(({ time }) => time)).toEqual([1, 2, 3]);
      unsubscribe();
    });

    it("defaults missing-data fetches to immediate admission", () => {
      const { result } = renderEngine({ duration: 10 });
      const prefetch = vi.fn();
      act(() => {
        result.current.api.registerStream({
          id: "remote",
          blocking: true,
          bufferState: () => "missing",
          prefetch,
        });
        result.current.api.subscribeStream("remote");
        result.current.api.seek(3);
      });

      expect(prefetch).toHaveBeenCalledWith([3, 6]);
    });

    it("coalesces only missing-data fetches around the latest seek target", () => {
      vi.useFakeTimers();
      try {
        const { result } = renderEngine({
          duration: 10,
          seekFetchDebounceMs: 100,
        });
        const prefetch = vi.fn();
        act(() => {
          result.current.api.registerStream({
            id: "remote",
            blocking: true,
            bufferState: () => "missing",
            prefetch,
          });
          result.current.api.subscribeStream("remote");
          result.current.api.seek(1);
          result.current.api.seek(2);
          result.current.api.seek(3);
        });

        expect(result.current.playhead).toBe(3);
        expect(prefetch).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(99));
        expect(prefetch).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(1));
        expect(prefetch).toHaveBeenCalledWith([3, 6]);
        expect(prefetch).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("commits buffered seeks synchronously despite a configured debounce", () => {
      const { result } = renderEngine({
        duration: 10,
        seekFetchDebounceMs: 100,
      });
      act(() => {
        result.current.api.registerStream(readyStream("cached"));
        result.current.api.subscribeStream("cached");
        result.current.api.seek(4);
      });

      expect(result.current.playhead).toBe(4);
      expect(result.current.currentTime).toBe(4);
    });

    it("lets long-lived clients update the fetch debounce at runtime", () => {
      vi.useFakeTimers();
      try {
        const { result } = renderEngine({ duration: 10 });
        const prefetch = vi.fn();
        act(() => {
          result.current.api.registerStream({
            id: "remote",
            blocking: true,
            bufferState: () => "missing",
            prefetch,
          });
          result.current.api.subscribeStream("remote");
          setSeekFetchDebounceMs(result.current.store, 50);
          result.current.api.seek(5);
        });

        expect(prefetch).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(50));
        expect(prefetch).toHaveBeenCalledWith([5, 8]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps frame steps on the immediate fetch path", () => {
      const { result } = renderEngine({
        duration: 10,
        seekFetchDebounceMs: 100,
      });
      const prefetch = vi.fn();
      act(() => {
        result.current.api.registerStream({
          id: "remote",
          blocking: true,
          bufferState: () => "missing",
          prefetch,
        });
        result.current.api.subscribeStream("remote");
        result.current.api.stepForward();
      });

      expect(prefetch).toHaveBeenCalledOnce();
    });
  });
});
