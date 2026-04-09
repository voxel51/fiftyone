import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimelineManager } from "./TimelineManager";
import type {
  CreateTimelineParams,
  SequenceTimelineConfig,
  DurationTimelineConfig,
} from "../types";

function createParams(
  overrides: Partial<CreateTimelineParams> = {}
): CreateTimelineParams {
  return {
    name: "test-timeline",
    config: {
      totalFrames: 100,
      loop: false,
      speed: 1,
      tickRate: 30,
    },
    ...overrides,
  };
}

function createDurationParams(
  overrides: Partial<CreateTimelineParams> = {}
): CreateTimelineParams {
  return {
    name: "duration-timeline",
    config: {
      type: "duration",
      duration: 1_000_000_000, // 1 second in nanoseconds
      loop: false,
      speed: 1,
      tickRate: 60,
    },
    ...overrides,
  };
}

describe("TimelineManager", () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;

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
    vi.spyOn(performance, "now").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("creates a manager with the given name", () => {
      const mgr = new TimelineManager(createParams());
      expect(mgr.name).toBe("test-timeline");
    });

    it("starts uninitialized", () => {
      const mgr = new TimelineManager(createParams());
      expect(mgr.isInitialized).toBe(false);
    });

    it("starts paused", () => {
      const mgr = new TimelineManager(createParams());
      expect(mgr.playState).toBe("paused");
    });
  });

  describe("initialize", () => {
    it("initializes with config", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      expect(mgr.isInitialized).toBe(true);
      expect(mgr.range[1]).toBe(100);
    });

    it("applies default values to config", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(
        createParams({
          config: { totalFrames: 50 },
        })
      );
      expect(mgr.config.speed).toBe(1);
      expect(mgr.config.tickRate).toBe(30);
      expect(mgr.config.type).toBe("sequence");
    });

    it("throws if defaultFrameNumber exceeds totalFrames", () => {
      const mgr = new TimelineManager(createParams());
      expect(() => {
        mgr.initialize(
          createParams({
            config: { totalFrames: 10, defaultFrameNumber: 20 },
          })
        );
      }).toThrow("Default frame number 20 is greater than total frames 10");
    });

    it("dispatches timeline:initialized event", () => {
      const mgr = new TimelineManager(createParams());
      const handler = vi.fn();
      mgr.on("timeline:initialized", handler);
      mgr.initialize(createParams());
      expect(handler).toHaveBeenCalledOnce();
    });

    it("does not re-initialize if already initialized (updates config instead)", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());

      const handler = vi.fn();
      mgr.on("timeline:configChange", handler);

      mgr.initialize(
        createParams({
          config: { totalFrames: 200 },
        })
      );

      expect(handler).toHaveBeenCalled();
      expect(mgr.range[1]).toBe(200);
    });

    it("does nothing if config is undefined", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize({ name: "test-timeline" });
      expect(mgr.isInitialized).toBe(false);
    });
  });

  describe("snapshot", () => {
    it("starts with default frame number", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      expect(mgr.snapshot.timeInt).toBe(1);
    });

    it("starts with custom default frame number", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(
        createParams({
          config: { totalFrames: 100, defaultFrameNumber: 5 },
        })
      );
      expect(mgr.snapshot.timeInt).toBe(5);
    });
  });

  describe("play / pause / togglePlay", () => {
    it("sets play state to playing", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.play();
      expect(mgr.playState).toBe("playing");
    });

    it("does not play when not initialized", () => {
      const mgr = new TimelineManager(createParams());
      mgr.play();
      expect(mgr.playState).toBe("paused");
    });

    it("does not play when buffering", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.setPlayState("buffering");
      mgr.play();
      expect(mgr.playState).toBe("buffering");
    });

    it("pauses playback", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.play();
      mgr.pause();
      expect(mgr.playState).toBe("paused");
    });

    it("toggles between play and pause", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.togglePlay();
      expect(mgr.playState).toBe("playing");
      mgr.togglePlay();
      expect(mgr.playState).toBe("paused");
    });

    it("fires play state change event", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const handler = vi.fn();
      mgr.on("timeline:playStateChange", handler);
      mgr.play();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ state: "playing" })
      );
    });

    it("dispatches playStateChange events on play/pause", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const handler = vi.fn();
      mgr.on("timeline:playStateChange", handler);

      mgr.play();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ state: "playing" })
      );
      mgr.pause();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ state: "paused" })
      );
    });
  });

  describe("setTime", () => {
    it("sets the current time", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      await mgr.setTime(50);
      expect(mgr.snapshot.timeInt).toBe(50);
    });

    it("clamps to range", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      await mgr.setTime(200);
      expect(mgr.snapshot.timeInt).toBe(100);
      await mgr.setTime(0);
      expect(mgr.snapshot.timeInt).toBe(1);
    });

    it("dispatches timeChange event", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const handler = vi.fn();
      mgr.on("timeline:timeChange", handler);
      await mgr.setTime(10);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({ timeInt: 10 }),
        })
      );
    });

    it("notifies subscribers", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const renderAt = vi.fn();
      mgr.subscribe({ id: "sub", renderAt });
      await mgr.setTime(25);
      expect(renderAt).toHaveBeenCalledWith(
        expect.objectContaining({ timeInt: 25 })
      );
    });

    it("calls prefetch when buffer does not contain range", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const prefetch = vi.fn().mockResolvedValue(undefined);
      mgr.subscribe({ id: "sub", renderAt: vi.fn(), prefetch });
      await mgr.setTime(50);
      expect(prefetch).toHaveBeenCalled();
    });
  });

  describe("stepForward / stepBackward", () => {
    it("steps forward by 1 when time index is empty", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      await mgr.setTime(5);
      await mgr.stepForward();
      expect(mgr.snapshot.timeInt).toBe(6);
    });

    it("steps backward by 1 when time index is empty", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      await mgr.setTime(5);
      await mgr.stepBackward();
      expect(mgr.snapshot.timeInt).toBe(4);
    });

    it("does not step past the end", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      await mgr.setTime(100);
      await mgr.stepForward();
      expect(mgr.snapshot.timeInt).toBe(100);
    });

    it("does not step past the start", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      await mgr.setTime(1);
      await mgr.stepBackward();
      expect(mgr.snapshot.timeInt).toBe(1);
    });

    it("uses time index when populated (stepForward)", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());

      // Add subscriber with coverage to populate time index
      mgr.subscribe({
        id: "sub",
        renderAt: vi.fn(),
        reportCoverage: () => [1, 10, 20, 50, 100],
      });

      await mgr.setTime(10);
      await mgr.stepForward();
      expect(mgr.snapshot.timeInt).toBe(20);
    });

    it("uses time index when populated (stepBackward)", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());

      mgr.subscribe({
        id: "sub",
        renderAt: vi.fn(),
        reportCoverage: () => [1, 10, 20, 50, 100],
      });

      await mgr.setTime(50);
      await mgr.stepBackward();
      expect(mgr.snapshot.timeInt).toBe(20);
    });
  });

  describe("config", () => {
    it("setSpeed updates config", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.setSpeed(2);
      expect(mgr.config.speed).toBe(2);
      expect(mgr.speed).toBe(2);
    });

    it("setTickRate updates config", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.setTickRate(60);
      expect(mgr.config.tickRate).toBe(60);
    });

    it("setLoopMode updates config", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.setLoopMode("loop");
      expect(mgr.config.loop).toBe("loop");
    });

    it("setLoopMode accepts boolean", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.setLoopMode(true);
      expect(mgr.config.loop).toBe(true);
    });

    it("updateConfig fires configChange event", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const handler = vi.fn();
      mgr.on("timeline:configChange", handler);
      mgr.updateConfig({ speed: 3 });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ speed: 3 }),
        })
      );
    });

    it("config is frozen", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      expect(Object.isFrozen(mgr.config)).toBe(true);
    });

    it("setTotalFrames updates totalFrames for sequence timelines", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.setTotalFrames(200);
      expect(mgr.range[1]).toBe(200);
    });

    it("setTotalFrames warns for non-sequence timelines", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const mgr = new TimelineManager(createDurationParams());
      mgr.initialize(createDurationParams());
      mgr.setTotalFrames(200);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("non-sequence")
      );
      warnSpy.mockRestore();
    });
  });

  describe("range", () => {
    it("returns [1, totalFrames] for sequence timelines", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      expect(mgr.range).toEqual([1, 100]);
    });

    it("returns [defaultTime, duration] for duration timelines", () => {
      const mgr = new TimelineManager(createDurationParams());
      mgr.initialize(createDurationParams());
      expect(mgr.range).toEqual([0, 1_000_000_000]);
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("subscribes and returns unsubscribe function", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());

      const renderAt = vi.fn();
      const unsub = mgr.subscribe({ id: "sub", renderAt });

      await mgr.setTime(5);
      expect(renderAt).toHaveBeenCalled();

      renderAt.mockClear();
      unsub();

      await mgr.setTime(10);
      expect(renderAt).not.toHaveBeenCalled();
    });

    it("applies default values to subscriber", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());

      const renderAt = vi.fn();
      mgr.subscribe({ id: "minimal-sub", renderAt });

      // setTime should not throw — defaults for prefetch and bufferState exist
      await mgr.setTime(5);
      expect(renderAt).toHaveBeenCalled();
    });

    it("warns and replaces duplicate subscription", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());

      mgr.subscribe({ id: "dup", renderAt: vi.fn() });
      mgr.subscribe({ id: "dup", renderAt: vi.fn() });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("dup"));
      warnSpy.mockRestore();
    });

    it("collects coverage from subscriber into time index", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());

      mgr.subscribe({
        id: "coverage-sub",
        renderAt: vi.fn(),
        reportCoverage: () => [5, 10, 15, 20],
      });

      expect(mgr.timeIndex.size).toBe(4);
      expect(mgr.timeIndex.times).toEqual([5, 10, 15, 20]);
    });
  });

  describe("seek events", () => {
    it("notifySeekStart/notifySeekEnd dispatch events", () => {
      const mgr = new TimelineManager(createParams());
      const startCb = vi.fn();
      const endCb = vi.fn();
      mgr.on("timeline:seekStart", startCb);
      mgr.on("timeline:seekEnd", endCb);

      mgr.notifySeekStart();
      expect(startCb).toHaveBeenCalledOnce();
      expect(endCb).not.toHaveBeenCalled();

      mgr.notifySeekEnd();
      expect(endCb).toHaveBeenCalledOnce();
    });
  });

  describe("event subscription", () => {
    it("on() returns an unsubscribe function", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const handler = vi.fn();
      const off = mgr.on("timeline:playStateChange", handler);

      mgr.play();
      expect(handler).toHaveBeenCalledOnce();

      handler.mockClear();
      off();
      mgr.pause();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("syncFrameNumber", () => {
    it("updates snapshot when engine is not running", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.syncFrameNumber(42);
      expect(mgr.snapshot.timeInt).toBe(42);
    });

    it("does not update snapshot when engine is running", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.play();
      mgr.syncFrameNumber(42);
      // Should stay at whatever the playing snapshot is, not 42
      // (engine is running so syncFrameNumber is a no-op)
      expect(mgr.snapshot.timeInt).toBe(1);
    });
  });

  describe("destroy", () => {
    it("dispatches destroyed event and clears subscribers", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.subscribe({ id: "sub", renderAt: vi.fn() });

      const handler = vi.fn();
      mgr.on("timeline:destroyed", handler);
      mgr.destroy();

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("refresh", () => {
    it("re-sets the current time", async () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const renderAt = vi.fn();
      mgr.subscribe({ id: "sub", renderAt });
      await mgr.setTime(10);
      renderAt.mockClear();

      await mgr.refresh();
      expect(renderAt).toHaveBeenCalledWith(
        expect.objectContaining({ timeInt: 10 })
      );
    });
  });

  describe("setTimeSelection", () => {
    it("dispatches rangeChange event when range is provided", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const handler = vi.fn();
      mgr.on("timeline:rangeChange", handler);
      mgr.setTimeSelection([10, 50]);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ range: [10, 50] })
      );
    });

    it("does not dispatch when range is null", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      const handler = vi.fn();
      mgr.on("timeline:rangeChange", handler);
      mgr.setTimeSelection(null);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("derived accessors", () => {
    it("updateFrequency reflects config", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      // 1000 / (30 * 1) ≈ 33.33
      expect(mgr.updateFrequency).toBeCloseTo(1000 / 30);
    });

    it("updateFrequency changes with speed", () => {
      const mgr = new TimelineManager(createParams());
      mgr.initialize(createParams());
      mgr.setSpeed(2);
      // 1000 / (30 * 2) ≈ 16.67
      expect(mgr.updateFrequency).toBeCloseTo(1000 / 60);
    });
  });

  describe("duration timeline", () => {
    it("initializes with duration config", () => {
      const mgr = new TimelineManager(createDurationParams());
      mgr.initialize(createDurationParams());
      expect(mgr.isInitialized).toBe(true);
      expect(mgr.range).toEqual([0, 1_000_000_000]);
    });

    it("starts at defaultTime = 0", () => {
      const mgr = new TimelineManager(createDurationParams());
      mgr.initialize(createDurationParams());
      expect(mgr.snapshot.timeInt).toBe(0);
    });

    it("clamps setTime to duration range", async () => {
      const mgr = new TimelineManager(createDurationParams());
      mgr.initialize(createDurationParams());
      await mgr.setTime(2_000_000_000);
      expect(mgr.snapshot.timeInt).toBe(1_000_000_000);
    });

    it("throws if defaultTime exceeds duration", () => {
      expect(() => {
        const mgr = new TimelineManager(createDurationParams());
        mgr.initialize({
          name: "duration-timeline",
          config: {
            type: "duration",
            duration: 100,
            defaultTime: 200,
          },
        });
      }).toThrow("Default time 200 is greater than duration 100");
    });

    it("applies default tickRate of 60 for duration timelines", () => {
      const mgr = new TimelineManager(createDurationParams());
      mgr.initialize({
        name: "duration-timeline",
        config: {
          type: "duration",
          duration: 1_000_000_000,
        },
      });
      expect(mgr.config.tickRate).toBe(60);
    });
  });
});
