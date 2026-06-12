/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  SegmentationTool,
  SegmentationToolMode,
  SegmentationToolShape,
  type SegmentationToolState,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import { describe, expect, it } from "vitest";
import { buildBrushCursor } from "./buildBrushCursor";

const makeState = (
  overrides: Partial<SegmentationToolState> = {}
): SegmentationToolState => ({
  active: true,
  size: 16,
  cursorSize: 32,
  tool: SegmentationTool.Brush,
  shape: SegmentationToolShape.Circle,
  mode: SegmentationToolMode.Add,
  ...overrides,
});

/** Pulls the percent-encoded SVG body out of the cursor URL for inspection. */
const decodeSvg = (cursor: string): string => {
  const match = cursor.match(
    /^url\("data:image\/svg\+xml,([^"]+)"\) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?), crosshair$/
  );
  if (!match) throw new Error(`Unexpected cursor format: ${cursor}`);
  return decodeURIComponent(match[1]);
};

describe("buildBrushCursor", () => {
  describe("non-brush tools short-circuit to a CSS keyword", () => {
    it("returns 'default' for Select", () => {
      expect(buildBrushCursor(makeState({ tool: SegmentationTool.Select }))).toBe(
        "default"
      );
    });

    it("returns 'crosshair' for Pen", () => {
      expect(buildBrushCursor(makeState({ tool: SegmentationTool.Pen }))).toBe(
        "crosshair"
      );
    });

    it("returns 'crosshair' for AI", () => {
      expect(buildBrushCursor(makeState({ tool: SegmentationTool.AI }))).toBe(
        "crosshair"
      );
    });
  });

  describe("circle brush", () => {
    it("renders a circle, centers the hotspot, and ends with the crosshair fallback", () => {
      const cursor = buildBrushCursor(
        makeState({
          tool: SegmentationTool.Brush,
          shape: SegmentationToolShape.Circle,
          mode: SegmentationToolMode.Add,
          cursorSize: 32,
        })
      );

      // svgSize = cursorSize + 2*pad = 36, hotspot = center = half + pad = 18.
      expect(cursor).toMatch(/^url\("data:image\/svg\+xml,/);
      expect(cursor).toMatch(/ 18 18, crosshair$/);

      const svg = decodeSvg(cursor);
      expect(svg).toContain('width="36"');
      expect(svg).toContain('height="36"');
      expect(svg).toContain("<circle ");
      expect(svg).not.toContain("<rect ");
      expect(svg).toContain('cx="18"');
      expect(svg).toContain('cy="18"');
      expect(svg).toContain('r="16"');
    });

    it("Add mode uses black as the dashed-stroke color and emits no slash", () => {
      const svg = decodeSvg(
        buildBrushCursor(
          makeState({
            tool: SegmentationTool.Brush,
            shape: SegmentationToolShape.Circle,
            mode: SegmentationToolMode.Add,
          })
        )
      );

      expect(svg).toContain('stroke="black"');
      expect(svg).not.toContain('stroke="red"');
      expect(svg).not.toContain("<line ");
    });

    it("Remove mode uses red and adds a diagonal slash line", () => {
      const svg = decodeSvg(
        buildBrushCursor(
          makeState({
            tool: SegmentationTool.Brush,
            shape: SegmentationToolShape.Circle,
            mode: SegmentationToolMode.Remove,
          })
        )
      );

      expect(svg).toContain('stroke="red"');
      expect(svg).toContain("<line ");
      // Slash uses 45° diagonal across the circle (half * SQRT1_2 from center).
      expect(svg).toMatch(/<line x1="\d+(?:\.\d+)?"/);
    });
  });

  describe("square brush", () => {
    it("renders a rect, places the slash edge-to-edge in Remove mode", () => {
      const remove = decodeSvg(
        buildBrushCursor(
          makeState({
            tool: SegmentationTool.Brush,
            shape: SegmentationToolShape.Square,
            mode: SegmentationToolMode.Remove,
            cursorSize: 32,
          })
        )
      );

      expect(remove).toContain("<rect ");
      expect(remove).not.toContain("<circle ");
      // Slash goes from (pad, pad+size) → (pad+size, pad) = (2, 34) → (34, 2).
      expect(remove).toContain('x1="2"');
      expect(remove).toContain('y1="34"');
      expect(remove).toContain('x2="34"');
      expect(remove).toContain('y2="2"');
    });

    it("renders only a rect with no slash in Add mode", () => {
      const add = decodeSvg(
        buildBrushCursor(
          makeState({
            tool: SegmentationTool.Brush,
            shape: SegmentationToolShape.Square,
            mode: SegmentationToolMode.Add,
          })
        )
      );

      expect(add).toContain("<rect ");
      expect(add).not.toContain("<line ");
      expect(add).toContain('stroke="black"');
    });
  });

  describe("size scaling", () => {
    it("scales SVG width/height and hotspot with cursorSize", () => {
      const small = decodeSvg(
        buildBrushCursor(
          makeState({ tool: SegmentationTool.Brush, cursorSize: 4 })
        )
      );
      const large = decodeSvg(
        buildBrushCursor(
          makeState({ tool: SegmentationTool.Brush, cursorSize: 100 })
        )
      );

      // svgSize = cursorSize + 4 (pad on each side).
      expect(small).toContain('width="8"');
      expect(small).toContain('height="8"');
      expect(large).toContain('width="104"');
      expect(large).toContain('height="104"');

      const smallHotspot = buildBrushCursor(
        makeState({ tool: SegmentationTool.Brush, cursorSize: 4 })
      );
      const largeHotspot = buildBrushCursor(
        makeState({ tool: SegmentationTool.Brush, cursorSize: 100 })
      );
      expect(smallHotspot).toMatch(/ 4 4, crosshair$/);
      expect(largeHotspot).toMatch(/ 52 52, crosshair$/);
    });
  });
});
