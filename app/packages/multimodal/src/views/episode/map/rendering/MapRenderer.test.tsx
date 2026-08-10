import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAP_BASE_LAYER, type MapBaseLayer } from "./types";
import { MapRenderer } from "./MapRenderer";

vi.mock("./MapLibreSurface", () => ({
  MapLibreSurface: ({
    baseLayer,
    basemapRetryNonce,
    onBasemapStatusChange,
  }: {
    readonly baseLayer: MapBaseLayer;
    readonly basemapRetryNonce: number;
    readonly onBasemapStatusChange: (
      baseLayer: MapBaseLayer,
      status: "error",
    ) => void;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        {
          onClick: () => onBasemapStatusChange(baseLayer, "error"),
          type: "button",
        },
        "Fail basemap",
      ),
      React.createElement(
        "span",
        { "data-testid": "basemap-retry-nonce" },
        basemapRetryNonce,
      ),
    ),
}));

afterEach(cleanup);

describe("MapRenderer basemap recovery", () => {
  it("offers an actionable manual retry after provider failure", () => {
    render(
      <MapRenderer
        baseLayer={MAP_BASE_LAYER.DEFAULT}
        downsampled={false}
        enabledStreamCount={0}
        errorCount={0}
        followEgo={false}
        loadingCount={0}
        locationEvidencePending={false}
        locationStreamCount={0}
        liveMarkers={[]}
        onFollowEgoChange={vi.fn()}
        onHoverTimeNs={vi.fn()}
        onSeekTimeNs={vi.fn()}
        playback={{
          clearHover: vi.fn(),
          readHoverTimeNs: () => null,
          readPlayhead: () => ({ paused: true, timeNs: null }),
          subscribeHover: () => vi.fn(),
          subscribePlayhead: () => vi.fn(),
        }}
        pulseActive={false}
        sourceKey="recording"
        tracks={[]}
        truncated={false}
        viewportScope={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fail basemap" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry basemap" }));

    expect(screen.getByTestId("basemap-retry-nonce").textContent).toBe("1");
  });
});
