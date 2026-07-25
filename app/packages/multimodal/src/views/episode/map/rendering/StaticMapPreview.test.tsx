import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { LocationTrackState } from "../tracks/location-track";
import { MapLegend, StaticMapPreview } from "./StaticMapPreview";

const TRACK: LocationTrackState = {
  color: "#ff6600",
  label: "GPS",
  pointCount: 2,
  segments: [],
  sourceName: "/gps/fix",
  status: "ready",
  stream: "7",
};

describe("MapLegend", () => {
  afterEach(cleanup);

  it("uses the location source name as hover text", () => {
    render(<MapLegend tracks={[TRACK]} />);

    expect(screen.getByTitle("/gps/fix")).toBeTruthy();
    expect(screen.queryByTitle("7")).toBeNull();
  });
});

describe("StaticMapPreview", () => {
  afterEach(cleanup);

  it("shows the current marker before route history is available", () => {
    const view = render(
      <StaticMapPreview
        liveMarkers={[
          {
            color: "#ff6600",
            label: "GPS",
            location: { latitude: 37, longitude: -122, timeNs: 1n },
            stream: "/gps",
          },
        ]}
        tracks={[]}
      />,
    );

    expect(view.container.querySelector("circle")).toBeTruthy();
  });
});
