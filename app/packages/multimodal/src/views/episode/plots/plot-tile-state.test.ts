import { describe, expect, it } from "vitest";
import {
  PLOT_SERIES_PALETTE,
  addPlotSeriesToTile,
  nextPlotSeriesColor,
} from "./plot-tile-state";

describe("nextPlotSeriesColor", () => {
  it("assigns the first palette slot to the first series", () => {
    expect(nextPlotSeriesColor([])).toBe(PLOT_SERIES_PALETTE[0]);
  });

  it("skips colors already in use so identity stays stable", () => {
    expect(
      nextPlotSeriesColor([
        {
          color: PLOT_SERIES_PALETTE[0],
          fieldPath: "a",
          stream: "/t",
        },
        {
          color: PLOT_SERIES_PALETTE[2],
          fieldPath: "b",
          stream: "/t",
        },
      ]),
    ).toBe(PLOT_SERIES_PALETTE[1]);
  });

  it("reuses a freed slot after a series is removed", () => {
    const current = PLOT_SERIES_PALETTE.slice(1).map((color, index) => ({
      color,
      fieldPath: `f${index}`,
      stream: "/t",
    }));
    expect(nextPlotSeriesColor(current)).toBe(PLOT_SERIES_PALETTE[0]);
  });

  it("wraps deterministically once every slot is used", () => {
    const current = PLOT_SERIES_PALETTE.map((color, index) => ({
      color,
      fieldPath: `f${index}`,
      stream: "/t",
    }));
    expect(nextPlotSeriesColor(current)).toBe(
      PLOT_SERIES_PALETTE[current.length % PLOT_SERIES_PALETTE.length],
    );
  });
});

describe("addPlotSeriesToTile", () => {
  it("adds a new series to an empty tile", () => {
    expect(addPlotSeriesToTile({}, "plot-1", "/odom", "speed")).toEqual({
      "plot-1": [
        {
          color: PLOT_SERIES_PALETTE[0],
          fieldPath: "speed",
          stream: "/odom",
        },
      ],
    });
  });

  it("keeps existing series and assigns the next available color", () => {
    const previous = {
      "plot-1": [
        {
          color: PLOT_SERIES_PALETTE[2],
          fieldPath: "speed",
          stream: "/odom",
        },
      ],
    };

    expect(addPlotSeriesToTile(previous, "plot-1", "/odom", "accel")).toEqual({
      "plot-1": [
        previous["plot-1"][0],
        {
          color: PLOT_SERIES_PALETTE[0],
          fieldPath: "accel",
          stream: "/odom",
        },
      ],
    });
  });

  it("does not duplicate an existing stream and field path", () => {
    const previous = {
      "plot-1": [
        {
          color: PLOT_SERIES_PALETTE[0],
          fieldPath: "speed",
          stream: "/odom",
        },
      ],
    };

    expect(addPlotSeriesToTile(previous, "plot-1", "/odom", "speed")).toBe(
      previous,
    );
  });
});
