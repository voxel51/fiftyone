import { describe, expect, it } from "vitest";

import {
  plotSeriesDisplayName,
  plotTileDisplayTitle,
} from "./plot-series-display";

const SOURCE_NAMES = new Map([["14", "/odom"]]);
const SERIES = { fieldPath: "twist.linear.x", stream: "14" };

describe("plot series display", () => {
  it("renders source names while retaining canonical series bindings", () => {
    expect(plotSeriesDisplayName(SERIES, SOURCE_NAMES)).toBe(
      "/odom.twist.linear.x",
    );
    expect(plotTileDisplayTitle([SERIES], SOURCE_NAMES)).toBe(
      "/odom.twist.linear.x",
    );
  });

  it("does not expose an unresolved canonical id", () => {
    expect(plotSeriesDisplayName(SERIES, new Map())).toBe(
      "Unknown source.twist.linear.x",
    );
  });

  it("uses a compact title for multiple series", () => {
    expect(
      plotTileDisplayTitle(
        [SERIES, { fieldPath: "pose.x", stream: "15" }],
        SOURCE_NAMES,
      ),
    ).toBe("Plot (2)");
  });
});
