import { describe, expect, test } from "vitest";
import {
  depthTransform,
  flyTransform,
  frontBox,
  invert,
  layerRect,
  layerStep,
} from "./stackLayout";

// a 212 × 136 cell: step 7, reserve 4 × 7 = 28, pad 6
const box = frontBox(212, 136);

describe("stackLayout", () => {
  test("reserves room above and right of the front box for four layers", () => {
    expect(layerStep(136)).toBe(7);
    expect(box).toEqual({ left: 6, top: 34, width: 172, height: 96 });
  });

  test("fits a wide item to the box width, on the bottom edge", () => {
    expect(layerRect(box, 2)).toEqual({
      left: 6,
      top: 44,
      width: 172,
      height: 86,
    });
  });

  test("fits a tall item to the box height, on the left edge", () => {
    expect(layerRect(box, 0.5)).toEqual({
      left: 6,
      top: 34,
      width: 48,
      height: 96,
    });
  });

  test("fits a square item to the box height", () => {
    expect(layerRect(box, 1)).toEqual({
      left: 6,
      top: 34,
      width: 96,
      height: 96,
    });
  });

  test("treats a missing aspect ratio as square", () => {
    expect(layerRect(box, Number.NaN)).toEqual(layerRect(box, 1));
    expect(layerRect(box, 0)).toEqual(layerRect(box, 1));
  });

  test("depth shrinks a layer toward its own top-right corner", () => {
    const rect = layerRect(box, 1);
    const t = depthTransform(2, rect, 7);
    expect(t.sx).toBeCloseTo(0.9);
    expect(t.sy).toBeCloseTo(0.9);
    // the top-right corner moves 14px right and 14px up
    expect(t.x + rect.width * t.sx - rect.width).toBeCloseTo(14);
    expect(t.y).toBe(-14);
    expect(depthTransform(0, rect, 7)).toEqual({ x: 0, y: -0, sx: 1, sy: 1 });
  });

  test("the fly-out grows a layer about its center", () => {
    const rect = layerRect(box, 2);
    const t = flyTransform(rect);
    expect(t.x + (rect.width * t.sx) / 2).toBeCloseTo(rect.width / 2);
    expect(t.y + (rect.height * t.sy) / 2).toBeCloseTo(rect.height / 2);
  });

  test("invert maps an element's rect onto another", () => {
    expect(
      invert(
        { left: 10, top: 20, width: 50, height: 25 },
        { left: 110, top: 220, width: 100, height: 100 },
      ),
    ).toEqual({ x: -100, y: -200, sx: 0.5, sy: 0.25 });
  });
});
