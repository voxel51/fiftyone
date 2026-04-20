import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeIndex } from "./TimeIndex";
import { createInitialSnapshot } from "./TimeSnapshot";
import { PlaybackEngine, type PlaybackEngineOptions } from "./PlaybackEngine";
import type {
  DurationTimelineConfig,
  Subscriber,
  SequenceTimelineConfig,
  TimelineConfig,
  TimeSnapshot,
  TimeRange,
} from "../types";

function createMockOptions(
  overrides: Partial<PlaybackEngineOptions> = {}
): PlaybackEngineOptions {
  const config: SequenceTimelineConfig = {
    totalFrames: 100,
    type: "sequence",
    speed: 1,
    tickRate: 30,
    loop: false,
  };

  return {
    getConfig: () => config,
    getRange: () => [1, 100] as const,
    getSnapshot: () => createInitialSnapshot("test", 1),
    getPlayState: () => "playing",
    getSubscribers: () => new Map(),
    getTimeIndex: () => new TimeIndex(),
    commitSnapshot: vi.fn(),
    onPlayStateChange: vi.fn(),
    onBufferRequest: vi.fn(),
    timelineName: "test",
    timelineType: "sequence",
    ...overrides,
  };
}

describe("PlaybackEngine", () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let mockNow: number;

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    mockNow = 0;

    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => {
        const id = nextRafId++;
        rafCallbacks.set(id, cb);
        return id;
      })
    );

    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => {
        rafCallbacks.delete(id);
      })
    );

    vi.spyOn(performance, "now").mockImplementation(() => mockNow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushRaf(advanceMs = 50) {
    mockNow += advanceMs;
    const cbs = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    for (const cb of cbs) {
      cb(mockNow);
    }
  }

  describe("start / stop / isRunning", () => {
    it("starts in stopped state", () => {
      const engine = new PlaybackEngine(createMockOptions());
      expect(engine.isRunning).toBe(false);
    });

    it("starts the rAF loop", () => {
      const engine = new PlaybackEngine(createMockOptions());
      engine.start();
      expect(engine.isRunning).toBe(true);
      expect(requestAnimationFrame).toHaveBeenCalledOnce();
    });

    it("does not double-start", () => {
      const engine = new PlaybackEngine(createMockOptions());
      engine.start();
      engine.start();
      expect(requestAnimationFrame).toHaveBeenCalledOnce();
    });

    it("stops the rAF loop", () => {
      const engine = new PlaybackEngine(createMockOptions());
      engine.start();
      engine.stop();
      expect(engine.isRunning).toBe(false);
      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it("does not error when stopping while already stopped", () => {
      const engine = new PlaybackEngine(createMockOptions());
      engine.stop();
      expect(engine.isRunning).toBe(false);
    });
  });

  describe("destroy", () => {
    it("stops the engine", () => {
      const engine = new PlaybackEngine(createMockOptions());
      engine.start();
      engine.destroy();
      expect(engine.isRunning).toBe(false);
    });
  });

  describe("tick — sequence timeline", () => {
    it("advances frame by 1 per tick", () => {
      let currentSnapshot = createInitialSnapshot("test", 1);
      const commitSnapshot = vi.fn((snap: TimeSnapshot) => {
        currentSnapshot = snap;
      });

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => currentSnapshot,
          commitSnapshot,
        })
      );

      engine.start();
      flushRaf(50); // enough time to exceed updateInterval (1000/30 ≈ 33ms)

      expect(commitSnapshot).toHaveBeenCalledTimes(1);
      const committed = commitSnapshot.mock.calls[0][0] as TimeSnapshot;
      expect(committed.timeInt).toBe(2);
    });

    it("skips tick when not enough time has elapsed", () => {
      const commitSnapshot = vi.fn();
      const engine = new PlaybackEngine(createMockOptions({ commitSnapshot }));

      engine.start();
      flushRaf(10); // less than 33ms interval

      expect(commitSnapshot).not.toHaveBeenCalled();
    });

    it("notifies all subscribers on commit", () => {
      let currentSnapshot = createInitialSnapshot("test", 1);
      const renderAt = vi.fn();
      const subs = new Map<string, Subscriber>();
      subs.set("sub1", { id: "sub1", renderAt });

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => currentSnapshot,
          getSubscribers: () => subs,
          commitSnapshot: (snap) => {
            currentSnapshot = snap;
          },
        })
      );

      engine.start();
      flushRaf(50);

      expect(renderAt).toHaveBeenCalledOnce();
      expect(renderAt.mock.calls[0][0].timeInt).toBe(2);
    });
  });

  describe("tick — duration timeline", () => {
    it("uses real elapsed time for duration playback without speeding up the draw interval", () => {
      let currentSnapshot = createInitialSnapshot("test", 0);
      const commitSnapshot = vi.fn((snap: TimeSnapshot) => {
        currentSnapshot = snap;
      });
      const config: DurationTimelineConfig = {
        type: "duration",
        duration: 1_000_000_000,
        speed: 2,
        tickRate: 60,
        loop: false,
      };

      const engine = new PlaybackEngine(
        createMockOptions({
          getConfig: () => config,
          getRange: () => [0, 1_000_000_000] as const,
          getSnapshot: () => currentSnapshot,
          commitSnapshot,
          timelineType: "duration",
        })
      );

      engine.start();
      flushRaf(10);
      expect(commitSnapshot).not.toHaveBeenCalled();

      flushRaf(10);
      expect(commitSnapshot).toHaveBeenCalledTimes(1);
      expect(commitSnapshot.mock.calls[0][0].timeInt).toBe(40_000_000);
    });
  });

  describe("end-of-range behavior", () => {
    it("pauses at end when loop is disabled", () => {
      const onPlayStateChange = vi.fn();

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => createInitialSnapshot("test", 100),
          getRange: () => [1, 100] as const,
          onPlayStateChange,
          getConfig: () => ({
            totalFrames: 100,
            loop: false,
            speed: 1,
            tickRate: 30,
          }),
        })
      );

      engine.start();
      flushRaf(50);

      expect(onPlayStateChange).toHaveBeenCalledWith("paused");
      expect(engine.isRunning).toBe(false);
    });

    it("wraps to start when loop is enabled", () => {
      let currentSnapshot = createInitialSnapshot("test", 100);
      const commitSnapshot = vi.fn((snap: TimeSnapshot) => {
        currentSnapshot = snap;
      });

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => currentSnapshot,
          getRange: () => [1, 100] as const,
          commitSnapshot,
          getConfig: () => ({
            totalFrames: 100,
            loop: true,
            speed: 1,
            tickRate: 30,
          }),
        })
      );

      engine.start();
      flushRaf(50);

      expect(commitSnapshot).toHaveBeenCalled();
      const committed = commitSnapshot.mock.calls[0][0] as TimeSnapshot;
      expect(committed.timeInt).toBe(1);
    });

    it("wraps when loop mode is 'loop' string", () => {
      let currentSnapshot = createInitialSnapshot("test", 100);
      const commitSnapshot = vi.fn((snap: TimeSnapshot) => {
        currentSnapshot = snap;
      });

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => currentSnapshot,
          getRange: () => [1, 100] as const,
          commitSnapshot,
          getConfig: () => ({
            totalFrames: 100,
            loop: "loop" as const,
            speed: 1,
            tickRate: 30,
          }),
        })
      );

      engine.start();
      flushRaf(50);

      const committed = commitSnapshot.mock.calls[0][0] as TimeSnapshot;
      expect(committed.timeInt).toBe(1);
    });
  });

  describe("two-phase commit — critical subscribers", () => {
    it("enters buffering when a critical subscriber reports non-ready", () => {
      const onPlayStateChange = vi.fn();
      const onBufferRequest = vi.fn();
      const prefetch = vi.fn();

      const subs = new Map<string, Subscriber>();
      subs.set("critical-sub", {
        id: "critical-sub",
        renderAt: vi.fn(),
        bufferState: () => "loading",
        prefetch,
        capabilities: { critical: true },
      });

      let currentSnapshot = createInitialSnapshot("test", 1);

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => currentSnapshot,
          getSubscribers: () => subs,
          onPlayStateChange,
          onBufferRequest,
        })
      );

      engine.start();
      flushRaf(50);

      expect(onPlayStateChange).toHaveBeenCalledWith("buffering");
      expect(onBufferRequest).toHaveBeenCalled();
      expect(prefetch).toHaveBeenCalled();
    });

    it("proceeds when all critical subscribers report ready", () => {
      const commitSnapshot = vi.fn();

      const subs = new Map<string, Subscriber>();
      subs.set("critical-sub", {
        id: "critical-sub",
        renderAt: vi.fn(),
        bufferState: () => "ready",
        capabilities: { critical: true },
      });

      let currentSnapshot = createInitialSnapshot("test", 1);

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => currentSnapshot,
          getSubscribers: () => subs,
          commitSnapshot: (snap) => {
            currentSnapshot = snap;
            commitSnapshot(snap);
          },
        })
      );

      engine.start();
      flushRaf(50);

      expect(commitSnapshot).toHaveBeenCalled();
    });

    it("returns to playing after buffering resolves", () => {
      const onPlayStateChange = vi.fn();
      let currentPlayState: "playing" | "buffering" = "playing";
      let readiness: "loading" | "ready" = "loading";

      const subs = new Map<string, Subscriber>();
      subs.set("critical-sub", {
        id: "critical-sub",
        renderAt: vi.fn(),
        bufferState: () => readiness,
        prefetch: vi.fn(() => {
          readiness = "ready";
          return Promise.resolve();
        }),
        capabilities: { critical: true },
      });

      let currentSnapshot = createInitialSnapshot("test", 1);

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => currentSnapshot,
          getPlayState: () => currentPlayState,
          getSubscribers: () => subs,
          commitSnapshot: (snap) => {
            currentSnapshot = snap;
          },
          onPlayStateChange: (state) => {
            onPlayStateChange(state);
            if (state === "playing" || state === "buffering") {
              currentPlayState = state;
            }
          },
        })
      );

      engine.start();
      flushRaf(50);
      expect(onPlayStateChange).toHaveBeenCalledWith("buffering");

      flushRaf(50);
      expect(onPlayStateChange).toHaveBeenCalledWith("playing");
    });

    it("does not block on non-critical subscriber reporting loading", () => {
      const commitSnapshot = vi.fn();

      const subs = new Map<string, Subscriber>();
      subs.set("non-critical-sub", {
        id: "non-critical-sub",
        renderAt: vi.fn(),
        bufferState: () => "loading",
        capabilities: { critical: false },
      });

      let currentSnapshot = createInitialSnapshot("test", 1);

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => currentSnapshot,
          getSubscribers: () => subs,
          commitSnapshot: (snap) => {
            currentSnapshot = snap;
            commitSnapshot(snap);
          },
        })
      );

      engine.start();
      flushRaf(50);

      // Should proceed — subscriber is not critical
      expect(commitSnapshot).toHaveBeenCalled();
    });
  });

  describe("subscriber error handling", () => {
    it("catches errors from subscriber renderAt without crashing", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const subs = new Map<string, Subscriber>();
      subs.set("bad-sub", {
        id: "bad-sub",
        renderAt: () => {
          throw new Error("subscriber error");
        },
      });

      let currentSnapshot = createInitialSnapshot("test", 1);
      const commitSnapshot = vi.fn((snap: TimeSnapshot) => {
        currentSnapshot = snap;
      });

      const engine = new PlaybackEngine(
        createMockOptions({
          getSnapshot: () => currentSnapshot,
          getSubscribers: () => subs,
          commitSnapshot,
        })
      );

      engine.start();
      flushRaf(50);

      expect(commitSnapshot).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("bad-sub"),
        expect.any(Error)
      );

      errorSpy.mockRestore();
    });
  });
});
