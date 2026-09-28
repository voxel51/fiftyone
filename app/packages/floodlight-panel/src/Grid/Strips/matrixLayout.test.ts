import { describe, expect, test } from "vitest";
import {
  columnLeft,
  columnWidth,
  columnWindow,
  matrixGeometry,
  rowHeadWidth,
} from "./matrixLayout";

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

describe("matrixGeometry", () => {
  const rows = [{ count: 1234, label: "motorcycle", value: "motorcycle" }];

  test("insets rows and header by Floodlight's gutter, sharing one head width", () => {
    // 1000px body: rows are 1000 - 2 × 14 = 972 wide; 136px head; 836 track
    expect(matrixGeometry(1000, 120, rows, 10)).toEqual({
      colWidth: 240,
      gutter: 14,
      headWidth: 136,
      rowWidth: 972,
      trackWidth: 836,
    });
  });

  test("header columns and cells share every edge, scrolled or not", () => {
    const geometry = matrixGeometry(1000, 120, rows, 10);
    // the header lays columns out after its gutter margin and the corner
    const header = (c: number, x: number) =>
      geometry.gutter + geometry.headWidth + c * geometry.colWidth - x;
    // Floodlight places a row after its section's 14px padding
    const cell = (c: number, x: number) =>
      14 + geometry.headWidth + c * geometry.colWidth - x;

    for (const x of [0, 300]) {
      for (const c of [0, 1, 5]) {
        expect(header(c, x)).toBe(cell(c, x));
        expect(header(c + 1, x)).toBe(cell(c + 1, x));
        expect(columnLeft(geometry, c, x)).toBe(cell(c, x));
      }
    }
    expect(columnLeft(geometry, 0, 0)).toBe(150);
    expect(columnLeft(geometry, 1, 0)).toBe(390);
    expect(columnLeft(geometry, 2, 300)).toBe(330);
  });

  test("columns fill the rows' real width when few", () => {
    // 836 / 4 = 209, which fits the rows, not the 28px wider body
    expect(matrixGeometry(1000, 60, rows, 4).colWidth).toBe(209);
  });
});
