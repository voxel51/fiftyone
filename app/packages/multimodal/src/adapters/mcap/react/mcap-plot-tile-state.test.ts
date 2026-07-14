import { describe, expect, it } from "vitest";
import {
  MCAP_PLOT_SERIES_PALETTE,
  addMcapPlotSeriesToTile,
  nextPlotSeriesColor,
} from "./mcap-plot-tile-state";

describe("nextPlotSeriesColor", () => {
  it("assigns the first palette slot to the first series", () => {
    expect(nextPlotSeriesColor([])).toBe(MCAP_PLOT_SERIES_PALETTE[0]);
  });

  it("skips colors already in use so identity stays stable", () => {
    expect(
      nextPlotSeriesColor([
        {
          color: MCAP_PLOT_SERIES_PALETTE[0],
          fieldPath: "a",
          topic: "/t",
        },
        {
          color: MCAP_PLOT_SERIES_PALETTE[2],
          fieldPath: "b",
          topic: "/t",
        },
      ]),
    ).toBe(MCAP_PLOT_SERIES_PALETTE[1]);
  });

  it("reuses a freed slot after a series is removed", () => {
    const current = MCAP_PLOT_SERIES_PALETTE.slice(1).map((color, index) => ({
      color,
      fieldPath: `f${index}`,
      topic: "/t",
    }));
    expect(nextPlotSeriesColor(current)).toBe(MCAP_PLOT_SERIES_PALETTE[0]);
  });

  it("wraps deterministically once every slot is used", () => {
    const current = MCAP_PLOT_SERIES_PALETTE.map((color, index) => ({
      color,
      fieldPath: `f${index}`,
      topic: "/t",
    }));
    expect(nextPlotSeriesColor(current)).toBe(
      MCAP_PLOT_SERIES_PALETTE[
        current.length % MCAP_PLOT_SERIES_PALETTE.length
      ],
    );
  });
});

describe("addMcapPlotSeriesToTile", () => {
  it("adds a new series to an empty tile", () => {
    expect(addMcapPlotSeriesToTile({}, "plot-1", "/odom", "speed")).toEqual({
      "plot-1": [
        {
          color: MCAP_PLOT_SERIES_PALETTE[0],
          fieldPath: "speed",
          topic: "/odom",
        },
      ],
    });
  });

  it("keeps existing series and assigns the next available color", () => {
    const previous = {
      "plot-1": [
        {
          color: MCAP_PLOT_SERIES_PALETTE[2],
          fieldPath: "speed",
          topic: "/odom",
        },
      ],
    };

    expect(
      addMcapPlotSeriesToTile(previous, "plot-1", "/odom", "accel"),
    ).toEqual({
      "plot-1": [
        previous["plot-1"][0],
        {
          color: MCAP_PLOT_SERIES_PALETTE[0],
          fieldPath: "accel",
          topic: "/odom",
        },
      ],
    });
  });

  it("does not duplicate an existing topic and field path", () => {
    const previous = {
      "plot-1": [
        {
          color: MCAP_PLOT_SERIES_PALETTE[0],
          fieldPath: "speed",
          topic: "/odom",
        },
      ],
    };

    expect(addMcapPlotSeriesToTile(previous, "plot-1", "/odom", "speed")).toBe(
      previous,
    );
  });
});
