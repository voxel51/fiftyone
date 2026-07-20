import { TilingProvider, useTiling, type TilingTile } from "@fiftyone/tiling";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAtomValue } from "jotai";
import React from "react";
import type { MosaicNode } from "react-mosaic-component";
import { afterEach, describe, expect, it, vi } from "vitest";
import { episodePlotTileSeriesAtom } from "./episode-plot-tile-state";
import { EPISODE_TILE_TYPE } from "./episode-tile-types";
import { useAddEpisodeFieldToPlot } from "./use-add-episode-field-to-plot";

vi.mock("./EpisodePlotTile", () => ({ default: () => null }));

const Probe: React.FC = () => {
  const addFieldToPlot = useAddEpisodeFieldToPlot();
  const { focusedTileId, tiles } = useTiling();
  const series = useAtomValue(episodePlotTileSeriesAtom);

  return (
    <>
      <button
        onClick={() => addFieldToPlot("/odom", "twist.linear.x")}
        type="button"
      >
        add x
      </button>
      <button
        onClick={() => {
          addFieldToPlot("/odom", "twist.linear.x");
          addFieldToPlot("/odom", "twist.linear.x");
        }}
        type="button"
      >
        add x twice
      </button>
      <span data-testid="probe">
        {JSON.stringify({
          focusedTileId,
          series,
          types: Object.fromEntries(
            Object.entries(tiles).map(([id, tile]) => [id, tile.type]),
          ),
        })}
      </span>
    </>
  );
};

afterEach(() => {
  cleanup();
});

describe("useAddEpisodeFieldToPlot", () => {
  it("adds to the first existing plot tile in layout order and focuses it", () => {
    renderProbe({
      initialLayout: {
        direction: "row",
        first: "raw-1",
        second: {
          direction: "column",
          first: "plot-2",
          second: "plot-1",
        },
      },
      initialTiles: {
        "plot-1": tile(EPISODE_TILE_TYPE.PLOT),
        "plot-2": tile(EPISODE_TILE_TYPE.PLOT),
        "raw-1": tile(EPISODE_TILE_TYPE.RAW),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "add x" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "plot-2",
      series: {
        "plot-2": [
          {
            fieldPath: "twist.linear.x",
            stream: "/odom",
          },
        ],
      },
    });
  });

  it("does not duplicate a field already plotted on the target tile", () => {
    renderProbe({
      initialLayout: "plot-1",
      initialTiles: {
        "plot-1": tile(EPISODE_TILE_TYPE.PLOT),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "add x" }));
    fireEvent.click(screen.getByRole("button", { name: "add x" }));

    expect(probeState().series["plot-1"]).toHaveLength(1);
  });

  it("creates and focuses a plot tile when none exists", () => {
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "add x" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "plot-1",
      series: {
        "plot-1": [
          {
            fieldPath: "twist.linear.x",
            stream: "/odom",
          },
        ],
      },
      types: {
        "plot-1": EPISODE_TILE_TYPE.PLOT,
      },
    });
  });

  it("reuses a freshly created plot tile across same-tick calls", () => {
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "add x twice" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "plot-1",
      series: {
        "plot-1": [
          {
            fieldPath: "twist.linear.x",
            stream: "/odom",
          },
        ],
      },
      types: {
        "plot-1": EPISODE_TILE_TYPE.PLOT,
      },
    });
  });
});

function renderProbe({
  initialLayout,
  initialTiles,
}: {
  readonly initialLayout?: MosaicNode<string> | null;
  readonly initialTiles?: Record<string, TilingTile>;
} = {}) {
  return render(
    <TilingProvider initialLayout={initialLayout} initialTiles={initialTiles}>
      <Probe />
    </TilingProvider>,
  );
}

function probeState(): {
  readonly focusedTileId: string | null;
  readonly series: Record<
    string,
    readonly { readonly fieldPath: string; readonly stream: string }[]
  >;
  readonly types: Record<string, string>;
} {
  const probe = screen.getByTestId("probe");
  return JSON.parse(probe.textContent ?? "{}");
}

function tile(type: string): TilingTile {
  return {
    render: () => null,
    title: type,
    type,
  };
}
