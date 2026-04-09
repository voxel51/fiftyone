import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We need to isolate the singleton between tests by re-importing
// the module fresh each time. We use vi.resetModules for this.

let timelineStore: typeof import("./TimelineStore")["timelineStore"];

describe("TimelineStore", () => {
  beforeEach(async () => {
    vi.resetModules();

    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((cb: FrameRequestCallback) => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(0);

    const mod = await import("./TimelineStore");
    timelineStore = mod.timelineStore;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getOrCreate", () => {
    it("creates a new timeline manager", () => {
      const mgr = timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 50 },
      });
      expect(mgr).toBeDefined();
      expect(mgr.name).toBe("test");
      expect(mgr.isInitialized).toBe(true);
    });

    it("returns existing manager on second call with same name", () => {
      const mgr1 = timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 50 },
      });
      const mgr2 = timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 100 },
      });
      expect(mgr1).toBe(mgr2);
      // Config should be updated
      expect(mgr2.range[1]).toBe(100);
    });

    it("dispatches store:timeline:added event", () => {
      const handler = vi.fn();
      timelineStore.on("store:timeline:added", handler);
      timelineStore.getOrCreate({
        name: "new-timeline",
        config: { totalFrames: 10 },
      });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ timeline: "new-timeline" })
      );
    });

    it("does not dispatch timelineAdded on second getOrCreate", () => {
      timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 10 },
      });

      const handler = vi.fn();
      timelineStore.on("store:timeline:added", handler);

      timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 20 },
      });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("get / has", () => {
    it("returns undefined for non-existent timeline", () => {
      expect(timelineStore.get("nonexistent")).toBeUndefined();
    });

    it("returns the manager after creation", () => {
      const mgr = timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 10 },
      });
      expect(timelineStore.get("test")).toBe(mgr);
    });

    it("has returns false for non-existent timeline", () => {
      expect(timelineStore.has("nonexistent")).toBe(false);
    });

    it("has returns true for existing timeline", () => {
      timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 10 },
      });
      expect(timelineStore.has("test")).toBe(true);
    });
  });

  describe("remove", () => {
    it("removes a timeline", () => {
      timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 10 },
      });
      timelineStore.remove("test");
      expect(timelineStore.has("test")).toBe(false);
      expect(timelineStore.get("test")).toBeUndefined();
    });

    it("dispatches store:timeline:removed event", () => {
      timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 10 },
      });
      const handler = vi.fn();
      timelineStore.on("store:timeline:removed", handler);
      timelineStore.remove("test");
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ timeline: "test" })
      );
    });

    it("does nothing for non-existent timeline", () => {
      const handler = vi.fn();
      timelineStore.on("store:timeline:removed", handler);
      timelineStore.remove("nonexistent");
      expect(handler).not.toHaveBeenCalled();
    });

    it("clears active timeline if removed timeline was active", () => {
      timelineStore.getOrCreate({
        name: "test",
        config: { totalFrames: 10 },
      });
      timelineStore.setActiveTimeline("test");
      expect(timelineStore.activeTimeline).toBe("test");

      const handler = vi.fn();
      timelineStore.on("store:timeline:activeTimelineChanged", handler);
      timelineStore.remove("test");

      expect(timelineStore.activeTimeline).toBeNull();
      expect(handler).toHaveBeenCalledWith({ name: null });
    });

    it("does not clear active timeline if different timeline is removed", () => {
      timelineStore.getOrCreate({
        name: "a",
        config: { totalFrames: 10 },
      });
      timelineStore.getOrCreate({
        name: "b",
        config: { totalFrames: 10 },
      });
      timelineStore.setActiveTimeline("a");

      timelineStore.remove("b");
      expect(timelineStore.activeTimeline).toBe("a");
    });
  });

  describe("setActiveTimeline / activeTimeline", () => {
    it("starts with null active timeline", () => {
      expect(timelineStore.activeTimeline).toBeNull();
    });

    it("sets and gets active timeline", () => {
      timelineStore.setActiveTimeline("my-timeline");
      expect(timelineStore.activeTimeline).toBe("my-timeline");
    });

    it("dispatches activeTimelineChanged event", () => {
      const handler = vi.fn();
      timelineStore.on("store:timeline:activeTimelineChanged", handler);
      timelineStore.setActiveTimeline("my-timeline");
      expect(handler).toHaveBeenCalledWith({ name: "my-timeline" });
    });

    it("does not dispatch if setting to same value", () => {
      timelineStore.setActiveTimeline("my-timeline");
      const handler = vi.fn();
      timelineStore.on("store:timeline:activeTimelineChanged", handler);
      timelineStore.setActiveTimeline("my-timeline");
      expect(handler).not.toHaveBeenCalled();
    });

    it("can set to null", () => {
      timelineStore.setActiveTimeline("my-timeline");
      timelineStore.setActiveTimeline(null);
      expect(timelineStore.activeTimeline).toBeNull();
    });
  });

  describe("on", () => {
    it("returns an unsubscribe function", () => {
      const handler = vi.fn();
      const unsub = timelineStore.on("store:timeline:added", handler);

      timelineStore.getOrCreate({
        name: "test1",
        config: { totalFrames: 10 },
      });
      expect(handler).toHaveBeenCalledOnce();

      handler.mockClear();
      unsub();

      timelineStore.getOrCreate({
        name: "test2",
        config: { totalFrames: 10 },
      });
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
