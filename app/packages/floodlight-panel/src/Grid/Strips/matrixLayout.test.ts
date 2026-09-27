import { describe, expect, test } from "vitest";
import { columnWidth, columnWindow, rowHeadWidth } from "./matrixLayout";

describe("columnWindow", () => {
  // 8 columns of 150px in view, out of 100
  const window = (x: number, overscan?: number) =>
    columnWindow(x, 1200, 150, 100, overscan);

  test("mounts the columns in view plus one past each edge", () => {
    expect(window(0)).toEqual({ start: 0, end: 9 });
    expect(window(0, 0)).toEqual({ start: 0, end: 8 });
    expect(window(450)).toEqual({ start: 2, end: 12 });
  });

  test("counts partly visible columns", () => {
    expect(window(1575, 0)).toEqual({ start: 10, end: 19 });
    expect(window(1575)).toEqual({ start: 9, end: 20 });
  });

  test("clamps at the far edge and to the column count", () => {
    expect(window(100 * 150 - 1200)).toEqual({ start: 91, end: 100 });
    expect(columnWindow(0, 1200, 150, 3)).toEqual({ start: 0, end: 3 });
  });

  test("mounts nothing before the track is measured", () => {
    expect(columnWindow(0, 0, 150, 100)).toEqual({ start: 0, end: 0 });
    expect(columnWindow(0, 1200, 150, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe("matrix sizes", () => {
  test("columns fill a wide track and keep a minimum when many", () => {
    expect(columnWidth(120, 1200, 4)).toBe(300);
    expect(columnWidth(120, 1200, 100)).toBe(240);
  });

  test("the row header fits the longest label within bounds", () => {
    const row = (label: string, count: number) => ({
      count,
      label,
      value: label,
    });
    expect(rowHeadWidth([row("cat", 5)])).toBe(96);
    expect(rowHeadWidth([row("a much longer label", 12345)])).toBe(192);
    expect(rowHeadWidth([row("motorcycle", 1234)])).toBe(136);
  });
});
