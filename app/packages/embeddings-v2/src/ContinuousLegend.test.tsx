// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContinuousLegend, formatRampValue } from "./ContinuousLegend";
import { buildColors, rampCss, type PlotPalette } from "./colors";

afterEach(cleanup);

const PALETTE: PlotPalette = {
  classes: [],
  ramp: [
    [38, 102, 230],
    [255, 166, 0],
  ],
};

describe("formatRampValue", () => {
  it("shows floats to three significant digits and integers verbatim", () => {
    expect(formatRampValue(0.512345)).toBe("0.512");
    expect(formatRampValue(0.0312)).toBe("0.0312");
    // High-cardinality int fields render continuous; their bounds must
    // not be rounded like floats
    expect(formatRampValue(12345)).toBe((12345).toLocaleString());
  });
});

describe("ContinuousLegend", () => {
  // The legend's gradient and the plot's point colors must share one
  // ramp; buildColors is what actually colors the points
  it("draws the same ramp buildColors paints with", () => {
    const column = {
      style: "continuous" as const,
      values: new Float32Array([0, 1]),
    };
    const rgb = buildColors(column, PALETTE, { min: 0, max: 1 });
    const css = (offset: number) =>
      `rgb(${Math.round(rgb[offset] * 255)}, ${Math.round(
        rgb[offset + 1] * 255,
      )}, ${Math.round(rgb[offset + 2] * 255)})`;

    expect(rampCss(PALETTE, 0)).toBe(css(0));
    expect(rampCss(PALETTE, 1)).toBe(css(3));
  });

  it("renders nothing without bounds (all values missing)", () => {
    const { container } = render(
      <ContinuousLegend
        field="uniqueness"
        meta={{ style: "continuous", min: null, max: null }}
        palette={PALETTE}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
