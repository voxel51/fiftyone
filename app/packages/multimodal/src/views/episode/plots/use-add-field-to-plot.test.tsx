import { TilingProvider, useTiling, type TilingTile } from "@fiftyone/tiling";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAtomValue } from "jotai";
import React from "react";
import type { MosaicNode } from "react-mosaic-component";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  plotTileResetZoomRevisionAtom,
  plotTileSeriesAtom,
} from "./plot-tile-state";
import { TILE_TYPE } from "../tiles/tile-types";
import { useAddFieldToPlot } from "./use-add-field-to-plot";

vi.mock("./PlotTile", () => ({ default: () => null }));

const Probe: React.FC = () => {
  const addFieldToPlot = useAddFieldToPlot();
  const { focusedTileId, tiles } = useTiling();
  const resetZoomRevisions = useAtomValue(plotTileResetZoomRevisionAtom);
  const series = useAtomValue(plotTileSeriesAtom);

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
          resetZoomRevisions,
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

describe("useAddFieldToPlot", () => {
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
        "plot-1": tile(TILE_TYPE.PLOT),
        "plot-2": tile(TILE_TYPE.PLOT),
        "raw-1": tile(TILE_TYPE.RAW),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "add x" }));

    expect(probeState()).toMatchObject({
      focusedTileId: "plot-2",
      resetZoomRevisions: { "plot-2": 1 },
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
        "plot-1": tile(TILE_TYPE.PLOT),
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
        "plot-1": TILE_TYPE.PLOT,
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
        "plot-1": TILE_TYPE.PLOT,
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

interface ProbeState {
  readonly focusedTileId: string | null;
  readonly resetZoomRevisions: Record<string, number>;
  readonly series: Record<
    string,
    readonly { readonly fieldPath: string; readonly stream: string }[]
  >;
  readonly types: Record<string, string>;
}

function probeState(): ProbeState {
  const probe = screen.getByTestId("probe");
  const parsed: unknown = JSON.parse(probe.textContent ?? "{}");
  if (!isProbeState(parsed)) {
    throw new Error("probe rendered an invalid state payload");
  }
  return parsed;
}

function isProbeState(value: unknown): value is ProbeState {
  return (
    isUnknownRecord(value) &&
    (typeof value.focusedTileId === "string" || value.focusedTileId === null) &&
    isNumberRecord(value.resetZoomRevisions) &&
    isSeriesRecord(value.series) &&
    isStringRecord(value.types)
  );
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isUnknownRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "number")
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isUnknownRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isSeriesRecord(value: unknown): value is ProbeState["series"] {
  if (!isUnknownRecord(value)) return false;
  return Object.values(value).every((candidate) => {
    if (!Array.isArray(candidate)) return false;
    const entries: unknown[] = candidate;
    return entries.every(
      (entry) =>
        isUnknownRecord(entry) &&
        typeof entry.fieldPath === "string" &&
        typeof entry.stream === "string",
    );
  });
}

function tile(type: string): TilingTile {
  return {
    render: () => null,
    title: type,
    type,
  };
}
