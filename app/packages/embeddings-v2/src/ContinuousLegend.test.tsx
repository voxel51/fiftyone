// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ContinuousLegend,
  formatRampValue,
  gradientCss,
} from "./ContinuousLegend";
import { buildColors, rampCss, type Colorscale } from "./colors";

afterEach(cleanup);

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
    const rgb = buildColors(column, [], { min: 0, max: 1 });
    const css = (offset: number) =>
      `rgb(${Math.round(rgb[offset] * 255)}, ${Math.round(
        rgb[offset + 1] * 255,
      )}, ${Math.round(rgb[offset + 2] * 255)})`;

    expect(rampCss(0)).toBe(css(0));
    expect(rampCss(1)).toBe(css(3));
  });

  it("labels the ends of the domain it was given, not the data's bounds", () => {
    // A zero-centered read widens the domain to ±10 so the scale's middle
    // is zero; the labels have to name the values those ends actually got
    const { getByText, queryByText } = render(
      <ContinuousLegend
        field="steering"
        meta={{ style: "continuous", min: -4, max: 10 }}
        colorscale={[[0, 0, 0]]}
        domain={[-10, 10]}
      />,
    );
    getByText("-10");
    getByText("10");
    getByText("0");
    expect(queryByText("-4")).toBeNull();
  });

  it("labels the data's bounds without a domain override", () => {
    const { getByText, queryByText } = render(
      <ContinuousLegend
        field="steering"
        meta={{ style: "continuous", min: -4, max: 10 }}
        colorscale={[[0, 0, 0]]}
      />,
    );
    getByText("-4");
    getByText("10");
    // No zero anchor to point at: the scale spans min..max
    expect(queryByText("0")).toBeNull();
  });

  it("renders nothing without bounds (all values missing)", () => {
    // Bails out before the colorscale is ever read, so its value is
    // irrelevant here — a placeholder, not a case being covered
    const { container } = render(
      <ContinuousLegend
        field="uniqueness"
        meta={{ style: "continuous", min: null, max: null }}
        colorscale={[[0, 0, 0]]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("gradientCss", () => {
  it("places every stop instead of just the endpoints", () => {
    // A 3+ stop colorscale (e.g. viridis) sampled only at the ends would
    // wash out its middle stops; every stop must appear at its own
    // position, blending between them the same way buildColors does
    const colorscale: Colorscale = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    expect(gradientCss(colorscale)).toBe(
      "rgb(255, 0, 0) 0%, rgb(0, 255, 0) 50%, rgb(0, 0, 255) 100%",
    );
  });

  it("falls back to the default ramp for an empty colorscale, without crashing", () => {
    expect(gradientCss([])).toBe(`${rampCss(0)}, ${rampCss(1)}`);
  });
});
