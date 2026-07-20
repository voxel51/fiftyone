import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NumericStreamFields } from "../../ir";
import EpisodePlotTileSettings from "./EpisodePlotTileSettings";

const mockState = vi.hoisted(() => ({
  enumeration: {
    status: "ready" as "error" | "idle" | "loading" | "ready",
    streams: [] as readonly unknown[],
  },
  seriesConfigs: [] as readonly unknown[],
  toggleSeries: vi.fn(),
}));

vi.mock("./episode-numeric-series-context", () => ({
  useEpisodeNumericSeriesContext: () => ({
    ensureEnumeration: vi.fn(),
    enumeration: mockState.enumeration,
    seriesByKey: new Map(),
    subscribeSeries: vi.fn(),
  }),
}));

vi.mock("./episode-plot-tile-state", () => ({
  useEpisodePlotTileSeries: () => mockState.seriesConfigs,
  useToggleEpisodePlotSeries: () => mockState.toggleSeries,
}));

afterEach(() => {
  cleanup();
  mockState.enumeration = { status: "ready", streams: [] };
  mockState.seriesConfigs = [];
  mockState.toggleSeries.mockReset();
});

describe("EpisodePlotTileSettings", () => {
  it("renders distinct disabled rows for unavailable numeric fields", () => {
    mockState.enumeration = {
      status: "ready",
      streams: [
        stream("/speed", "ready", [{ path: "speed", valueType: "float64" }]),
        stream("/bad-ros", "schema-unavailable"),
        stream("/text", "no-numeric-fields"),
        {
          availability: "unsupported-encoding",
          encoding: "unsupported",
          fields: [],
          sourceName: "/binary",
          streamId: "/binary",
        },
      ],
    };

    render(<EpisodePlotTileSettings />);

    fireEvent.click(screen.getByRole("button", { name: /\/speed/ }));
    expect(screen.getByLabelText("speed")).toBeTruthy();
    expect(screen.getByText("schema unavailable")).toBeTruthy();
    expect(screen.getByText("no numeric fields")).toBeTruthy();
    expect(screen.getByText("encoding unsupported")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /\/bad-ros/ }));
    expect(
      screen.getByText(
        "This stream's schema could not be read, so numeric fields cannot be listed",
      ),
    ).toBeTruthy();
  });
});

function stream(
  name: string,
  availability: NumericStreamFields["availability"],
  fields: NumericStreamFields["fields"] = [],
): NumericStreamFields {
  return {
    availability,
    encoding: "ros1",
    fields,
    sourceName: name,
    streamId: name,
  };
}
