import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  TileIdScope,
  TileSettingsContent,
  TilingProvider,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SceneInventoryProvider,
  type SceneSource,
} from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { McapModalSettingsProvider } from "./mcap-modal-settings";
import McapSettingsSidebar from "./McapSettingsSidebar";

const PANEL_SETTINGS_TEST_ID = "panel-settings";
const CAMERA_TILE_ID = "camera-1";
const LIDAR_TILE_ID = "lidar-1";

const SOURCES: readonly SceneSource[] = [
  {
    id: "/camera/front",
    label: "front",
    type: MCAP_SOURCE_TYPE.IMAGE,
  },
  {
    id: "/lidar/top",
    label: "top",
    type: MCAP_SOURCE_TYPE.POINT_CLOUD,
  },
  {
    id: "/camera/front/annotations",
    label: "front labels",
    type: MCAP_SOURCE_TYPE.IMAGE_ANNOTATION,
  },
  {
    id: "/markers",
    label: "markers",
    type: MCAP_SOURCE_TYPE.SCENE_ANNOTATION,
  },
];

const INITIAL_TILES: Record<string, TilingTile> = {
  [CAMERA_TILE_ID]: { title: "Camera", render: () => null },
  [LIDAR_TILE_ID]: { title: "3D", render: () => null },
};

const TileBody: React.FC<{ label: string }> = ({ label }) => (
  <TileSettingsContent>
    <div data-testid={PANEL_SETTINGS_TEST_ID}>{label} knobs</div>
  </TileSettingsContent>
);

const FocusButton: React.FC<{ id: string; testId: string }> = ({
  id,
  testId,
}) => {
  const { setFocusedTileId } = useTiling();
  return (
    <button
      data-testid={testId}
      onClick={() => setFocusedTileId(id)}
      type="button"
    />
  );
};

function renderSidebar() {
  return render(
    <McapModalSettingsProvider>
      <SceneInventoryProvider sources={SOURCES}>
        <TilingProvider initialTiles={INITIAL_TILES}>
          <TileIdScope tileId={CAMERA_TILE_ID}>
            <TileBody label="camera" />
          </TileIdScope>
          <TileIdScope tileId={LIDAR_TILE_ID}>
            <TileBody label="lidar" />
          </TileIdScope>
          <FocusButton id={CAMERA_TILE_ID} testId="focus-camera" />
          <FocusButton id={LIDAR_TILE_ID} testId="focus-lidar" />
          <McapSettingsSidebar />
        </TilingProvider>
      </SceneInventoryProvider>
    </McapModalSettingsProvider>,
  );
}

describe("McapSettingsSidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it("starts on scene settings without a panel tab", () => {
    renderSidebar();

    expect(screen.getByRole("tab", { name: "Scene" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Camera" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull();
    expect(screen.getByText("Time synchronization")).toBeTruthy();
  });

  it("shows scene label and time settings without the count summary", () => {
    renderSidebar();

    expect(screen.queryByText("Images")).toBeNull();
    expect(screen.queryByText("3D")).toBeNull();
    expect(screen.getByText("Interpolate between 2D annotations")).toBeTruthy();
    expect(screen.getByText("Interpolate between 3D annotations")).toBeTruthy();
    expect(screen.getByText("Time synchronization")).toBeTruthy();
    expect(screen.getByLabelText("Stale frame warning")).toBeTruthy();
  });

  it("switches to the panel tab when a panel tab first appears", () => {
    renderSidebar();

    fireEvent.click(screen.getByTestId("focus-camera"));

    expect(screen.getByRole("tab", { name: "Camera" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Camera" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
      "camera knobs",
    );
  });

  it("keeps the scene tab active when switching between focused panels", () => {
    renderSidebar();

    fireEvent.click(screen.getByTestId("focus-camera"));
    fireEvent.click(screen.getByRole("tab", { name: "Scene" }));
    fireEvent.click(screen.getByTestId("focus-lidar"));

    expect(screen.getByRole("tab", { name: "3D" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Scene" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Time synchronization")).toBeTruthy();
    expect(screen.queryByTestId(PANEL_SETTINGS_TEST_ID)).toBeNull();
  });

  it("shows the latest focused panel settings when returning to panel tab", () => {
    renderSidebar();

    fireEvent.click(screen.getByTestId("focus-camera"));
    fireEvent.click(screen.getByTestId("focus-lidar"));
    fireEvent.click(screen.getByRole("tab", { name: "3D" }));

    expect(screen.getByTestId(PANEL_SETTINGS_TEST_ID).textContent).toBe(
      "lidar knobs",
    );
  });
});
