/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { TemporalLabel, TemporalOptions } from "@fiftyone/lighter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncTemporalOverlays } from "./useTemporalOverlaySync";

/**
 * Lightweight stand-in for TemporalOverlay. We only need to verify
 * that `label` is re-assigned on update + record construction args,
 * so this skips the real Lighter machinery entirely.
 */
class FakeOverlay {
  label: TemporalLabel;
  constructor(public opts: TemporalOptions) {
    this.label = opts.label;
  }
}

const makeScene = () => {
  const added: FakeOverlay[] = [];
  const removed: string[] = [];
  const byId = new Map<string, FakeOverlay>();
  return {
    added,
    removed,
    byId,
    addOverlay: vi.fn((o: FakeOverlay) => {
      added.push(o);
      byId.set(o.opts.id, o);
    }),
    removeOverlay: vi.fn((id: string) => {
      removed.push(id);
      byId.delete(id);
    }),
    getOverlay: vi.fn((id: string) => byId.get(id)),
  };
};

const td = (
  id: string,
  support: [number, number],
  extra: Record<string, unknown> = {}
) => ({
  _cls: "TemporalDetection",
  _id: id,
  label: "x",
  support,
  ...extra,
});

const field = (...detections: ReturnType<typeof td>[]) => ({
  _cls: "TemporalDetections",
  detections,
});

const createFake = (opts: TemporalOptions): FakeOverlay =>
  new FakeOverlay(opts);

const ALL_ACTIVE = new Set(["events", "highlights"]);

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncTemporalOverlays", () => {
  describe("add / update / remove", () => {
    it("adds an overlay for each TD on the active sample", () => {
      const scene = makeScene();
      const overlays = new Map();

      syncTemporalOverlays({
        scene,
        sample: { events: field(td("a", [1, 10]), td("b", [20, 30])) },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      expect(scene.added).toHaveLength(2);
      expect(overlays.size).toBe(2);
      expect(overlays.get("td-events-a")).toBeDefined();
      expect(overlays.get("td-events-b")).toBeDefined();
    });

    it("adopts an overlay already present on the scene under the same id (avoids double-add collision)", () => {
      const scene = makeScene();
      const overlays = new Map();

      // Pre-seed the scene with an overlay at our expected id — as if
      // useCreateAnnotationLabel created it first.
      const pre = new FakeOverlay({
        id: "td-events-a",
        field: "events",
        label: { support: [1, 10], label: "running" },
      });
      scene.byId.set("td-events-a", pre);

      syncTemporalOverlays({
        scene,
        sample: { events: field(td("a", [1, 10], { label: "running" })) },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      // No new overlay added — adopted the pre-existing one.
      expect(scene.addOverlay).not.toHaveBeenCalled();
      // But we tracked it locally and refreshed its label.
      expect(overlays.get("td-events-a")).toBe(pre);
    });

    it("does not re-add an overlay that already exists", () => {
      const scene = makeScene();
      const overlays = new Map();

      const sample = { events: field(td("a", [1, 10])) };

      syncTemporalOverlays({
        scene,
        sample,
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });
      scene.addOverlay.mockClear();

      syncTemporalOverlays({
        scene,
        sample,
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      expect(scene.addOverlay).not.toHaveBeenCalled();
    });

    it("updates an existing overlay's label in place when the TD's data changes", () => {
      const scene = makeScene();
      const overlays = new Map();

      syncTemporalOverlays({
        scene,
        sample: { events: field(td("a", [1, 10])) },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });
      const overlay = overlays.get("td-events-a") as FakeOverlay;

      syncTemporalOverlays({
        scene,
        sample: { events: field(td("a", [5, 25], { label: "renamed" })) },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      // Same overlay instance; label re-assigned with the new values.
      expect(overlays.get("td-events-a")).toBe(overlay);
      expect(overlay.label.support).toEqual([5, 25]);
      expect(overlay.label.label).toBe("renamed");
    });

    it("removes overlays whose TDs are no longer on the sample", () => {
      const scene = makeScene();
      const overlays = new Map();

      syncTemporalOverlays({
        scene,
        sample: { events: field(td("a", [1, 10]), td("b", [20, 30])) },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });
      scene.removeOverlay.mockClear();

      syncTemporalOverlays({
        scene,
        sample: { events: field(td("a", [1, 10])) },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      expect(scene.removeOverlay).toHaveBeenCalledWith("td-events-b");
      expect(overlays.has("td-events-b")).toBe(false);
      expect(overlays.has("td-events-a")).toBe(true);
    });

    it("removes every overlay when the sample becomes null", () => {
      const scene = makeScene();
      const overlays = new Map();

      syncTemporalOverlays({
        scene,
        sample: { events: field(td("a", [1, 10]), td("b", [20, 30])) },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });
      scene.removeOverlay.mockClear();

      syncTemporalOverlays({
        scene,
        sample: null,
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      expect(scene.removeOverlay).toHaveBeenCalledTimes(2);
      expect(overlays.size).toBe(0);
    });
  });

  describe("active field filter", () => {
    it("skips overlays for TD fields not in activePaths", () => {
      const scene = makeScene();
      const overlays = new Map();

      syncTemporalOverlays({
        scene,
        sample: {
          events: field(td("a", [1, 10])),
          highlights: field(td("b", [20, 30])),
        },
        activePaths: new Set(["events"]),
        overlays,
        create: createFake as never,
      });

      expect(overlays.has("td-events-a")).toBe(true);
      expect(overlays.has("td-highlights-b")).toBe(false);
    });

    it("removes existing overlays whose field becomes inactive", () => {
      const scene = makeScene();
      const overlays = new Map();

      syncTemporalOverlays({
        scene,
        sample: { events: field(td("a", [1, 10])) },
        activePaths: new Set(["events"]),
        overlays,
        create: createFake as never,
      });
      scene.removeOverlay.mockClear();

      syncTemporalOverlays({
        scene,
        sample: { events: field(td("a", [1, 10])) },
        activePaths: new Set(),
        overlays,
        create: createFake as never,
      });

      expect(scene.removeOverlay).toHaveBeenCalledWith("td-events-a");
      expect(overlays.has("td-events-a")).toBe(false);
    });
  });

  describe("filtering invalid entries", () => {
    it("skips TDs missing both _id and id", () => {
      const scene = makeScene();
      const overlays = new Map();

      const td = {
        _cls: "TemporalDetection",
        label: "x",
        support: [1, 10] as [number, number],
      };

      syncTemporalOverlays({
        scene,
        sample: {
          events: { _cls: "TemporalDetections", detections: [td] },
        },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      expect(overlays.size).toBe(0);
    });

    it("skips TDs with malformed support", () => {
      const scene = makeScene();
      const overlays = new Map();

      syncTemporalOverlays({
        scene,
        sample: {
          events: {
            _cls: "TemporalDetections",
            detections: [
              { _cls: "TemporalDetection", _id: "a" }, // no support
              {
                _cls: "TemporalDetection",
                _id: "b",
                support: [NaN, 10],
              },
              {
                _cls: "TemporalDetection",
                _id: "c",
                support: [20, 10], // inverted
              },
              {
                _cls: "TemporalDetection",
                _id: "d",
                support: [1] as unknown as [number, number], // wrong length
              },
            ],
          },
        },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      expect(overlays.size).toBe(0);
    });

    it("ignores fields whose `_cls` isn't TemporalDetections", () => {
      const scene = makeScene();
      const overlays = new Map();

      syncTemporalOverlays({
        scene,
        sample: {
          detections: { _cls: "Detections", detections: [] },
          metadata: { frame_rate: 30 },
          some_string: "hi",
        },
        activePaths: new Set(["detections", "metadata", "some_string"]),
        overlays,
        create: createFake as never,
      });

      expect(overlays.size).toBe(0);
    });
  });

  describe("multiple fields", () => {
    it("creates overlays across multiple active TD fields", () => {
      const scene = makeScene();
      const overlays = new Map();

      syncTemporalOverlays({
        scene,
        sample: {
          events: field(td("a", [1, 10])),
          highlights: field(td("b", [20, 30])),
        },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      expect(overlays.has("td-events-a")).toBe(true);
      expect(overlays.has("td-highlights-b")).toBe(true);
    });

    it("keys overlays by `td-<fieldPath>-<detectionId>` to avoid cross-field collisions", () => {
      const scene = makeScene();
      const overlays = new Map();

      // Same detectionId across two fields — overlays must be separate.
      syncTemporalOverlays({
        scene,
        sample: {
          events: field(td("a", [1, 10])),
          highlights: field(td("a", [20, 30])),
        },
        activePaths: ALL_ACTIVE,
        overlays,
        create: createFake as never,
      });

      expect(overlays.size).toBe(2);
      expect(overlays.has("td-events-a")).toBe(true);
      expect(overlays.has("td-highlights-a")).toBe(true);
    });
  });
});
