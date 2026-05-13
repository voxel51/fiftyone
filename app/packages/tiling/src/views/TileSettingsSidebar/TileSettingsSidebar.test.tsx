import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TileIdScope, TilingProvider, useTileSettings, useTiling } from "../../lib/TilingProvider";
// eslint-disable-next-line import/first
import TileSettingsSidebar from "./TileSettingsSidebar";

const SETTINGS_LABEL = "camera-settings-panel";

const Settings: React.FC = () => (
  <div data-testid={SETTINGS_LABEL}>camera knobs</div>
);

/**
 * Mounts a tile body inside `TileIdScope` and registers the settings
 * panel — same shape a real PlaybackTile would use.
 */
const TileBody: React.FC = () => {
  useTileSettings(Settings);
  return <div data-testid="tile-body" />;
};

const FocusButton: React.FC<{ id: string }> = ({ id }) => {
  const { setFocusedTileId } = useTiling();
  return (
    <button data-testid={`focus-${id}`} onClick={() => setFocusedTileId(id)} />
  );
};

describe("TileSettingsSidebar", () => {
  afterEach(() => cleanup());

  it("shows the empty-state hint when no tile is focused", () => {
    render(
      <TilingProvider>
        <TileSettingsSidebar />
      </TilingProvider>
    );
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Focus a tile to edit its settings.")).toBeTruthy();
  });

  it("renders the focused tile's registered settings when a tile is focused", () => {
    render(
      <TilingProvider
        initialTiles={{
          "camera-1": { title: "camera_front", render: () => <TileBody /> },
        }}
      >
        <TileIdScope tileId="camera-1">
          <TileBody />
        </TileIdScope>
        <FocusButton id="camera-1" />
        <TileSettingsSidebar />
      </TilingProvider>
    );

    expect(screen.queryByTestId(SETTINGS_LABEL)).toBeNull();
    act(() => {
      screen.getByTestId("focus-camera-1").click();
    });
    expect(screen.getByText("Settings: camera_front")).toBeTruthy();
    expect(screen.getByTestId(SETTINGS_LABEL).textContent).toBe("camera knobs");
  });
});
