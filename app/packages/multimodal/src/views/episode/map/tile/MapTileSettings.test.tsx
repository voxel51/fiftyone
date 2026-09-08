import { TileIdScope } from "@fiftyone/tiling";
import { cleanup, render, screen } from "@testing-library/react";
import { Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";

import { SCENE_SOURCE_TYPE } from "../../../../ir";
import { SceneInventoryProvider } from "../../../../scene-inventory/react";
import MapTileSettings from "./MapTileSettings";

describe("MapTileSettings", () => {
  afterEach(cleanup);

  it("shows a location source name without exposing its canonical id", () => {
    render(
      <JotaiProvider>
        <SceneInventoryProvider
          sources={[
            {
              id: "7",
              label: "GPS",
              sourceName: "/gps/fix",
              type: SCENE_SOURCE_TYPE.LOCATION,
            },
          ]}
        >
          <TileIdScope tileId="map-1">
            <MapTileSettings />
          </TileIdScope>
        </SceneInventoryProvider>
      </JotaiProvider>,
    );

    expect(screen.getByText("/gps/fix")).toBeTruthy();
    expect(screen.queryByText("7")).toBeNull();
  });
});
