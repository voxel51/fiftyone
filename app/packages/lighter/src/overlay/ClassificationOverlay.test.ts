/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrawStyle, RenderMeta } from "../types";
import { ClassificationOverlay } from "./ClassificationOverlay";

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

const make = (id: string, label: Record<string, unknown>) =>
  new ClassificationOverlay({
    id,
    field: "field",
    label: label as ClassificationOverlay["label"],
  });

const drawnText = (overlay: ClassificationOverlay) => {
  const renderer = makeRendererMock();
  overlay.render(renderer as any, STYLE, makeMeta());
  return renderer.drawText.mock.calls[0] as unknown as [
    string,
    unknown,
    { fontStyle?: string; offset?: { bottom?: number } },
  ];
};

beforeEach(() => {
  ClassificationOverlay._resetRegistry();
});

afterEach(() => {
  ClassificationOverlay._resetRegistry();
});

describe("ClassificationOverlay", () => {
  describe("Classification", () => {
    it("draws the class name and confidence", () => {
      const [text] = drawnText(
        make("a", { _cls: "Classification", label: "cat", confidence: 0.9 }),
      );
      expect(text).toBe("cat 0.9");
    });

    it("draws the placeholder when the class name is missing", () => {
      const [text, , opts] = drawnText(make("a", { _cls: "Classification" }));
      expect(text).toBe("select classification...");
      expect(opts.fontStyle).toBe("italic");
    });

    it("reports Classification in tooltip info", () => {
      const o = make("a", { _cls: "Classification", label: "cat" });
      expect(o.getTooltipInfo()?.type).toBe("Classification");
    });
  });

  describe("Regression", () => {
    it("draws the value and confidence", () => {
      const [text] = drawnText(
        make("a", { _cls: "Regression", value: 0.42, confidence: 0.9 }),
      );
      expect(text).toBe("0.42 0.9");
    });

    it("draws just the value when confidence is missing", () => {
      const [text, , opts] = drawnText(
        make("a", { _cls: "Regression", value: 17 }),
      );
      expect(text).toBe("17");
      expect(opts.fontStyle).toBe("normal");
    });

    it("treats zero as a value, not as missing", () => {
      const [text, , opts] = drawnText(
        make("a", { _cls: "Regression", value: 0 }),
      );
      expect(text).toBe("0");
      expect(opts.fontStyle).toBe("normal");
    });

    it("draws a placeholder when the value is null", () => {
      const [text, , opts] = drawnText(
        make("a", { _cls: "Regression", value: null }),
      );
      expect(text).toBe("no value");
      expect(opts.fontStyle).toBe("italic");
    });

    it("reports Regression in tooltip info", () => {
      const o = make("a", { _cls: "Regression", value: 0.42 });
      const info = o.getTooltipInfo();
      expect(info?.type).toBe("Regression");
      expect(info?.field).toBe("field");
      expect(info?.label?.value).toBe(0.42);
    });
  });

  describe("stack", () => {
    it("orders classifications and regressions by their chip text", () => {
      const channel = "ch1";
      const cls = make("a", { _cls: "Classification", label: "cat" });
      const reg = make("b", { _cls: "Regression", value: 3.5 });
      cls.setEventChannel(channel);
      reg.setEventChannel(channel);

      // "3.5" sorts before "cat"
      expect(drawnText(reg)[2].offset).toMatchObject({ bottom: 0 });
      expect(drawnText(cls)[2].offset).toMatchObject({ bottom: 1 });
    });
  });
});
