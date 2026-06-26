/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LABEL_ARCHETYPE_PRIORITY } from "../constants";
import type { DrawStyle, RenderMeta } from "../types";
import { TemporalOverlay, type TemporalLabel } from "./TemporalOverlay";

const makeLabel = (
  support: [number, number],
  overrides: Partial<TemporalLabel> = {},
): TemporalLabel => ({
  support,
  label: "running",
  confidence: 0.9,
  ...overrides,
});

const makeRendererMock = () => ({
  drawText: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 20 })),
  dispose: vi.fn(),
  hitTest: vi.fn(() => false),
  getBounds: vi.fn(() => undefined),
});

const makeMeta = (): RenderMeta => ({
  canonicalMediaBounds: { x: 0, y: 0, width: 800, height: 600 },
});

const STYLE: DrawStyle = { fillStyle: "#ff0000", strokeStyle: "#ff0000" };

const make = (
  id: string,
  support: [number, number],
  overrides: Partial<TemporalLabel> = {},
) =>
  new TemporalOverlay({
    id,
    field: "events",
    label: makeLabel(support, overrides),
  });

beforeEach(() => {
  TemporalOverlay._resetRegistry();
});

afterEach(() => {
  TemporalOverlay._resetRegistry();
});

describe("TemporalOverlay", () => {
  describe("time gate", () => {
    it("starts inactive before any setCurrentFrame call", () => {
      const o = make("a", [10, 20]);
      expect(o.isActive()).toBe(false);
    });

    it("becomes active when the frame enters the support range", () => {
      const o = make("a", [10, 20]);
      o.setCurrentFrame(15);
      expect(o.isActive()).toBe(true);
    });

    it("includes both inclusive support boundaries", () => {
      const o = make("a", [10, 20]);
      o.setCurrentFrame(10);
      expect(o.isActive()).toBe(true);
      o.setCurrentFrame(20);
      expect(o.isActive()).toBe(true);
    });

    it("is inactive one frame outside the support range on either side", () => {
      const o = make("a", [10, 20]);
      o.setCurrentFrame(9);
      expect(o.isActive()).toBe(false);
      o.setCurrentFrame(21);
      expect(o.isActive()).toBe(false);
    });

    it("marks dirty when crossing a support boundary", () => {
      const o = make("a", [10, 20]);
      o.setCurrentFrame(5);
      expect(o.getIsDirty()).toBe(false);

      // Crosses into support — should mark dirty.
      o.setCurrentFrame(10);
      expect(o.getIsDirty()).toBe(true);
    });

    it("does not re-mark dirty when frame moves within an unchanged active state", () => {
      const o = make("a", [10, 20]);
      o.setCurrentFrame(15);
      expect(o.getIsDirty()).toBe(true);
      o.markClean();

      o.setCurrentFrame(16);
      expect(o.getIsDirty()).toBe(false);
    });

    it("is idempotent — setting the same frame twice is a no-op", () => {
      const o = make("a", [10, 20]);
      o.setCurrentFrame(15);
      o.markClean();
      o.setCurrentFrame(15);
      expect(o.getIsDirty()).toBe(false);
    });

    it("re-gates when the label setter changes the support range", () => {
      const o = make("a", [10, 20]);
      o.setCurrentFrame(25);
      expect(o.isActive()).toBe(false);

      o.label = makeLabel([20, 30]);
      expect(o.isActive()).toBe(true);
    });
  });

  describe("active-stack registry", () => {
    it("ripples a dirty signal to active siblings (but not inactive ones) when active state flips", () => {
      const channel = "ch1";
      const a = make("a", [10, 20]);
      const b = make("b", [10, 20]);
      const c = make("c", [30, 40]);
      a.setEventChannel(channel);
      b.setEventChannel(channel);
      c.setEventChannel(channel);

      // Pre-activate b so it's already in the visible stack.
      b.setCurrentFrame(15);
      a.markClean();
      b.markClean();
      c.markClean();

      // a flips inactive → active. b is active, so its stack index may
      // shift; c stays inactive and renders nothing either way.
      a.setCurrentFrame(15);
      expect(a.getIsDirty()).toBe(true);
      expect(b.getIsDirty()).toBe(true);
      expect(c.getIsDirty()).toBe(false);
    });

    it("destroy removes the overlay and dirties surviving active siblings only", () => {
      const channel = "ch1";
      const a = make("a", [10, 20]);
      const b = make("b", [10, 20]);
      const c = make("c", [30, 40]);
      a.setEventChannel(channel);
      b.setEventChannel(channel);
      c.setEventChannel(channel);

      // b is active in the rendered stack alongside a; c is offscreen.
      a.setCurrentFrame(15);
      b.setCurrentFrame(15);
      a.markClean();
      b.markClean();
      c.markClean();

      a.destroy();
      // b's stack index shifts; c stays out of frame and skips re-render.
      expect(b.getIsDirty()).toBe(true);
      expect(c.getIsDirty()).toBe(false);
    });
  });

  describe("renderImpl", () => {
    it("disposes its container and skips drawing when inactive", () => {
      const o = make("a", [10, 20]);
      const renderer = makeRendererMock();
      o.render(renderer as any, STYLE, makeMeta());

      expect(renderer.dispose).toHaveBeenCalledWith("a");
      expect(renderer.drawText).not.toHaveBeenCalled();
    });

    it("draws the label + confidence when active", () => {
      const o = make("a", [10, 20], { label: "running", confidence: 0.9 });
      o.setCurrentFrame(15);
      const renderer = makeRendererMock();
      o.render(renderer as any, STYLE, makeMeta());

      expect(renderer.drawText).toHaveBeenCalledTimes(1);
      const [text] = renderer.drawText.mock.calls[0];
      expect(text).toBe("running 0.9");
    });

    it("draws just the label when confidence is missing", () => {
      const o = make("a", [10, 20], {
        label: "running",
        confidence: undefined,
      });
      o.setCurrentFrame(15);
      const renderer = makeRendererMock();
      o.render(renderer as any, STYLE, makeMeta());

      const [text] = renderer.drawText.mock.calls[0];
      expect(text).toBe("running");
    });

    it("uses the top-right corner of the canvas as the anchor", () => {
      const o = make("a", [10, 20]);
      o.setCurrentFrame(15);
      const renderer = makeRendererMock();
      const meta = makeMeta(); // x=0, y=0, width=800, height=600
      o.render(renderer as any, STYLE, meta);

      const [, pos, opts] = renderer.drawText.mock.calls[0];
      // Anchor at x = bounds.x + bounds.width = 800.
      expect(pos).toEqual({ x: 800, y: 0 });
      expect(opts.anchor).toMatchObject({
        horizontal: "right",
        vertical: "top",
      });
    });

    it("stack index counts only active siblings, sorted alphabetically by label", () => {
      const channel = "ch1";
      const a = make("a", [10, 20], { label: "alpha" });
      const b = make("b", [30, 40], { label: "beta" });
      const c = make("c", [10, 20], { label: "gamma" });
      a.setEventChannel(channel);
      b.setEventChannel(channel);
      c.setEventChannel(channel);

      // Frame 15: a + c active, b inactive.
      a.setCurrentFrame(15);
      c.setCurrentFrame(15);

      const renderA = makeRendererMock();
      const renderC = makeRendererMock();
      a.render(renderA as any, STYLE, makeMeta());
      c.render(renderC as any, STYLE, makeMeta());

      // Sorted alphabetically by label: alpha=0, gamma=1.
      expect(renderA.drawText.mock.calls[0][2].offset).toMatchObject({
        bottom: 0,
      });
      expect(renderC.drawText.mock.calls[0][2].offset).toMatchObject({
        bottom: 1,
      });
    });

    it("renders placeholder text when label is missing", () => {
      const o = make("a", [10, 20], { label: "" });
      o.setCurrentFrame(15);
      const renderer = makeRendererMock();
      o.render(renderer as any, STYLE, makeMeta());

      const [text, , opts] = renderer.drawText.mock.calls[0];
      expect(text).toBe("temporal detection");
      expect(opts.fontStyle).toBe("italic");
    });

    it("skips drawing when style is missing", () => {
      const o = make("a", [10, 20]);
      o.setCurrentFrame(15);
      const renderer = makeRendererMock();
      o.render(renderer as any, null, makeMeta());

      // Container is still disposed (cleanup of prior render), but no draw.
      expect(renderer.dispose).toHaveBeenCalledWith("a");
      expect(renderer.drawText).not.toHaveBeenCalled();
    });
  });

  describe("selection + tooltip", () => {
    it("reports the TEMPORAL_DETECTION selection priority", () => {
      const o = make("a", [10, 20]);
      expect(o.getSelectionPriority()).toBe(
        LABEL_ARCHETYPE_PRIORITY.TEMPORAL_DETECTION,
      );
    });

    it("toggleSelected flips the state and marks dirty", () => {
      const o = make("a", [10, 20]);
      expect(o.isSelected()).toBe(false);

      const result = o.toggleSelected();
      expect(result).toBe(true);
      expect(o.isSelected()).toBe(true);
      expect(o.getIsDirty()).toBe(true);
    });

    it("setSelected is a no-op when the state already matches", () => {
      const o = make("a", [10, 20]);
      o.setSelected(false);
      expect(o.getIsDirty()).toBe(false);
    });

    it("returns TemporalDetection in tooltip info", () => {
      const o = make("a", [10, 20]);
      const info = o.getTooltipInfo();
      expect(info?.type).toBe("TemporalDetection");
      expect(info?.field).toBe("events");
      expect(info?.label?.support).toEqual([10, 20]);
    });
  });

  describe("getOverlayType", () => {
    it("returns 'TemporalOverlay'", () => {
      expect(make("a", [10, 20]).getOverlayType()).toBe("TemporalOverlay");
    });
  });
});
