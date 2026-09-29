import { describe, expect, test } from "vitest";
import { intersects, nearestSurvivor, withoutPaint } from "./relayout";

const box = (left: number, top: number, width = 10, height = 10) => ({
  height,
  left,
  top,
  width,
});

describe("withoutPaint", () => {
  test.each([
    ["size layout paint", "size layout"],
    ["paint", "none"],
    ["strict", "size layout style"],
    ["content", "layout style"],
    ["layout", "layout"],
    ["none", "none"],
  ])("%s becomes %s", (contain, expected) => {
    expect(withoutPaint(contain)).toBe(expected);
  });
});

describe("intersects", () => {
  const viewport = box(0, 0, 100, 100);

  test("a tile overlapping the viewport intersects it", () => {
    expect(intersects(box(95, 95), viewport)).toBe(true);
  });

  test("a tile touching only the viewport's edge does not", () => {
    expect(intersects(box(100, 0), viewport)).toBe(false);
    expect(intersects(box(0, -10), viewport)).toBe(false);
  });
});

describe("nearestSurvivor", () => {
  const order = ["a", "b", "c", "d"];

  test("takes the next surviving item", () => {
    expect(nearestSurvivor(order, "b", new Set(["b", "c"]))).toBe("d");
  });

  test("falls back to the previous item at the end", () => {
    expect(nearestSurvivor(order, "d", new Set(["d"]))).toBe("c");
  });

  test("has nothing when every item is removed or the anchor is unknown", () => {
    expect(nearestSurvivor(order, "a", new Set(order))).toBeUndefined();
    expect(nearestSurvivor(order, "x", new Set())).toBeUndefined();
  });
});
