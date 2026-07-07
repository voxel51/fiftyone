import { describe, expect, it } from "vitest";
import { buildColumns, colorsFromLabels } from "./columns";
import type { EmbeddingPoint } from "./types";

const point = (
  x: number,
  y: number,
  z?: number,
  label: string | null = null,
): EmbeddingPoint => ({ id: `${x},${y},${z ?? ""}`, x, y, z, label });

describe("buildColumns", () => {
  it("builds flat columns with zeroed zs", () => {
    const cols = buildColumns([point(1, 2), point(-3, 4)]);
    expect(cols.n).toBe(2);
    expect(cols.hasZ).toBe(false);
    expect(Array.from(cols.xs)).toEqual([1, -3]);
    expect(Array.from(cols.ys)).toEqual([2, 4]);
    expect(Array.from(cols.zs)).toEqual([0, 0]);
  });

  it("detects z when any point carries one", () => {
    const cols = buildColumns([point(0, 0), point(1, 1, 5)]);
    expect(cols.hasZ).toBe(true);
    expect(Array.from(cols.zs)).toEqual([0, 5]);
  });

  it("ignores z entirely when flattenZ is set", () => {
    const cols = buildColumns([point(0, 0, 5), point(1, 1, -2)], true);
    expect(cols.hasZ).toBe(false);
    expect(Array.from(cols.zs)).toEqual([0, 0]);
    expect(cols.zMin).toBe(0);
    expect(cols.zMax).toBe(0);
  });

  it("accumulates bounds in the same pass", () => {
    const cols = buildColumns([point(-1, 10, 3), point(7, -2, -4)]);
    expect(cols.xMin).toBe(-1);
    expect(cols.xMax).toBe(7);
    expect(cols.yMin).toBe(-2);
    expect(cols.yMax).toBe(10);
    expect(cols.zMin).toBe(-4);
    expect(cols.zMax).toBe(3);
  });

  it("interns labels in first-seen order, null included", () => {
    const cols = buildColumns([
      point(0, 0, undefined, "cat"),
      point(1, 1, undefined, null),
      point(2, 2, undefined, "dog"),
      point(3, 3, undefined, "cat"),
    ]);
    expect(cols.labelKeys).toEqual(["cat", "null", "dog"]);
    expect(Array.from(cols.labelIndex)).toEqual([0, 1, 2, 0]);
  });

  it("keeps ids aligned with point order", () => {
    const cols = buildColumns([point(1, 2), point(3, 4)]);
    expect(cols.ids).toEqual(["1,2,", "3,4,"]);
  });
});

describe("colorsFromLabels", () => {
  it("parses hex to rgb in [0, 1]", () => {
    const cols = buildColumns([point(0, 0, undefined, "a")]);
    const colors = colorsFromLabels(cols, ["#ffa500"]);
    expect(colors[0]).toBeCloseTo(1);
    expect(colors[1]).toBeCloseTo(165 / 255);
    expect(colors[2]).toBeCloseTo(0);
  });

  it("cycles the palette past its length", () => {
    const cols = buildColumns([
      point(0, 0, undefined, "a"),
      point(1, 1, undefined, "b"),
      point(2, 2, undefined, "c"),
    ]);
    const colors = colorsFromLabels(cols, ["#ff0000", "#00ff00"]);
    // Third label wraps back to the first palette entry
    expect(Array.from(colors.slice(6, 9))).toEqual([1, 0, 0]);
  });

  it("expands one rgb triplet per point", () => {
    const cols = buildColumns([
      point(0, 0, undefined, "a"),
      point(1, 1, undefined, "a"),
    ]);
    const colors = colorsFromLabels(cols, ["#0000ff"]);
    expect(colors.length).toBe(6);
    expect(Array.from(colors)).toEqual([0, 0, 1, 0, 0, 1]);
  });
});
