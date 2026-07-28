import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McapTopicNumericFields } from "../types";
import McapPlotTileSettings from "./McapPlotTileSettings";

const mockState = vi.hoisted(() => ({
  enumeration: {
    status: "ready" as "error" | "idle" | "loading" | "ready",
    topics: [] as readonly unknown[],
  },
  seriesConfigs: [] as readonly unknown[],
  toggleSeries: vi.fn(),
}));

vi.mock("./mcap-numeric-series-context", () => ({
  useMcapNumericSeriesContext: () => ({
    ensureEnumeration: vi.fn(),
    enumeration: mockState.enumeration,
    seriesByKey: new Map(),
    subscribeSeries: vi.fn(),
  }),
}));

vi.mock("./mcap-plot-tile-state", () => ({
  useMcapPlotTileSeries: () => mockState.seriesConfigs,
  useToggleMcapPlotSeries: () => mockState.toggleSeries,
}));

afterEach(() => {
  cleanup();
  mockState.enumeration = { status: "ready", topics: [] };
  mockState.seriesConfigs = [];
  mockState.toggleSeries.mockReset();
});

describe("McapPlotTileSettings", () => {
  it("renders distinct disabled rows for unavailable numeric fields", () => {
    mockState.enumeration = {
      status: "ready",
      topics: [
        topic("/speed", "ready", [{ path: "speed", valueType: "float64" }]),
        topic("/bad-ros", "schema-unavailable"),
        topic("/text", "no-numeric-fields"),
        {
          availability: "unsupported-encoding",
          encoding: "unsupported",
          fields: [],
          topic: "/binary",
        },
      ],
    };

    render(<McapPlotTileSettings />);

    fireEvent.click(screen.getByRole("button", { name: /\/speed/ }));
    expect(screen.getByLabelText("speed")).toBeTruthy();
    expect(screen.getByText("schema unavailable")).toBeTruthy();
    expect(screen.getByText("no numeric fields")).toBeTruthy();
    expect(screen.getByText("encoding unsupported")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /\/bad-ros/ }));
    expect(
      screen.getByText(
        "This topic's schema could not be read, so numeric fields cannot be listed",
      ),
    ).toBeTruthy();
  });
});

function topic(
  name: string,
  availability: McapTopicNumericFields["availability"],
  fields: McapTopicNumericFields["fields"] = [],
): McapTopicNumericFields {
  return {
    availability,
    encoding: "ros1",
    fields,
    topic: name,
  };
}
