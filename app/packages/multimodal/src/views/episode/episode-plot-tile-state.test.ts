import { describe, expect, it } from "vitest";
import {
  EPISODE_PLOT_SERIES_PALETTE,
  addEpisodePlotSeriesToTile,
  nextPlotSeriesColor,
} from "./episode-plot-tile-state";

describe("nextPlotSeriesColor", () => {
  it("assigns the first palette slot to the first series", () => {
    expect(nextPlotSeriesColor([])).toBe(EPISODE_PLOT_SERIES_PALETTE[0]);
  });

  it("skips colors already in use so identity stays stable", () => {
    expect(
      nextPlotSeriesColor([
        {
          color: EPISODE_PLOT_SERIES_PALETTE[0],
          fieldPath: "a",
          stream: "/t",
        },
        {
          color: EPISODE_PLOT_SERIES_PALETTE[2],
          fieldPath: "b",
          stream: "/t",
        },
      ]),
    ).toBe(EPISODE_PLOT_SERIES_PALETTE[1]);
  });

  it("reuses a freed slot after a series is removed", () => {
    const current = EPISODE_PLOT_SERIES_PALETTE.slice(1).map(
      (color, index) => ({
        color,
        fieldPath: `f${index}`,
        stream: "/t",
      }),
    );
    expect(nextPlotSeriesColor(current)).toBe(EPISODE_PLOT_SERIES_PALETTE[0]);
  });

  it("wraps deterministically once every slot is used", () => {
    const current = EPISODE_PLOT_SERIES_PALETTE.map((color, index) => ({
      color,
      fieldPath: `f${index}`,
      stream: "/t",
    }));
    expect(nextPlotSeriesColor(current)).toBe(
      EPISODE_PLOT_SERIES_PALETTE[
        current.length % EPISODE_PLOT_SERIES_PALETTE.length
      ],
    );
  });
});

describe("addEpisodePlotSeriesToTile", () => {
  it("adds a new series to an empty tile", () => {
    expect(addEpisodePlotSeriesToTile({}, "plot-1", "/odom", "speed")).toEqual({
      "plot-1": [
        {
          color: EPISODE_PLOT_SERIES_PALETTE[0],
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
          color: EPISODE_PLOT_SERIES_PALETTE[2],
          fieldPath: "speed",
          stream: "/odom",
        },
      ],
    };

    expect(
      addEpisodePlotSeriesToTile(previous, "plot-1", "/odom", "accel"),
    ).toEqual({
      "plot-1": [
        previous["plot-1"][0],
        {
          color: EPISODE_PLOT_SERIES_PALETTE[0],
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
          color: EPISODE_PLOT_SERIES_PALETTE[0],
          fieldPath: "speed",
          stream: "/odom",
        },
      ],
    };

    expect(
      addEpisodePlotSeriesToTile(previous, "plot-1", "/odom", "speed"),
    ).toBe(previous);
  });
});
