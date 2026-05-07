/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { MaskCanvas } from "./MaskCanvas";
import type { Rect } from "../types";

const WHITE = "#ffffff";

/**
 * Returns a small mask canvas already in editing mode, painted white over a
 * given world-space sub-rectangle. Skips the lazy decode path so tests run
 * synchronously against canvas pixels.
 */
const seedCanvas = (
  bounds: Rect,
  paintRect: Rect
): MaskCanvas => {
  const mc = new MaskCanvas();
  // A no-op paint dab to force the editing canvas into existence at our bounds.
  mc.paintAt(
    { x: bounds.x, y: bounds.y },
    bounds,
    {
      active: true,
      tool: "select" as never,
      shape: "circle" as never,
      mode: "add" as never,
      size: 0,
      cursorSize: 0,
    },
    { strokeStyle: WHITE }
  );
  // Get the underlying canvas via getPreviewSource and fill the requested
  // sub-rectangle directly (bypasses the line-interpolation and color logic).
  const canvas = mc.getPreviewSource() as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = WHITE;
  ctx.fillRect(
    Math.round(paintRect.x - bounds.x),
    Math.round(paintRect.y - bounds.y),
    Math.round(paintRect.width),
    Math.round(paintRect.height)
  );
  return mc;
};

describe("MaskCanvas.mergeFrom", () => {
  it("expands bounds to the union of target and source", () => {
    // target at (0,0,10x10) with a small painted square at (0,0,4x4)
    const targetBounds: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const target = seedCanvas(targetBounds, {
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });

    // source at (8,8,10x10) with a small painted square at (12,12,4x4)
    const sourceBounds: Rect = { x: 8, y: 8, width: 10, height: 10 };
    const source = seedCanvas(sourceBounds, {
      x: 12,
      y: 12,
      width: 4,
      height: 4,
    });

    const sourceCanvas = source.getPreviewSource() as HTMLCanvasElement;
    const newBounds = target.mergeFrom(sourceCanvas, sourceBounds, targetBounds);

    // Union: (0,0) → (18,18)
    expect(newBounds.x).toBe(0);
    expect(newBounds.y).toBe(0);
    expect(newBounds.width).toBeGreaterThanOrEqual(18);
    expect(newBounds.height).toBeGreaterThanOrEqual(18);
  });

  it("captures pre/post snapshots reachable via getPaintStrokeData", () => {
    const targetBounds: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const target = seedCanvas(targetBounds, {
      x: 0,
      y: 0,
      width: 4,
      height: 4,
    });

    const sourceBounds: Rect = { x: 8, y: 8, width: 10, height: 10 };
    const source = seedCanvas(sourceBounds, {
      x: 12,
      y: 12,
      width: 4,
      height: 4,
    });

    const sourceCanvas = source.getPreviewSource() as HTMLCanvasElement;
    target.mergeFrom(sourceCanvas, sourceBounds, targetBounds);

    const data = target.getPaintStrokeData();
    expect(data.beforeBounds).toEqual(targetBounds);
    expect(data.afterBounds).toBeDefined();
    expect(data.afterBounds?.width).toBeGreaterThan(targetBounds.width);
    expect(data.beforeSnapshot).toBeDefined();
    expect(data.afterSnapshot).toBeDefined();
  });

  it("handles a source fully contained within the target's bounds without expanding", () => {
    const targetBounds: Rect = { x: 0, y: 0, width: 20, height: 20 };
    const target = seedCanvas(targetBounds, {
      x: 0,
      y: 0,
      width: 5,
      height: 5,
    });

    const sourceBounds: Rect = { x: 10, y: 10, width: 5, height: 5 };
    const source = seedCanvas(sourceBounds, {
      x: 10,
      y: 10,
      width: 5,
      height: 5,
    });

    const sourceCanvas = source.getPreviewSource() as HTMLCanvasElement;
    const newBounds = target.mergeFrom(sourceCanvas, sourceBounds, targetBounds);

    // Source is inside target; bounds shouldn't grow.
    expect(newBounds.x).toBe(targetBounds.x);
    expect(newBounds.y).toBe(targetBounds.y);
    expect(newBounds.width).toBe(targetBounds.width);
    expect(newBounds.height).toBe(targetBounds.height);
  });
});
