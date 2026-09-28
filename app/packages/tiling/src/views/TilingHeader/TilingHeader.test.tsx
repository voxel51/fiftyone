import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IconName, MenuTextItem } from "@voxel51/voodo";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TilingProvider, useTiling } from "../../lib/TilingProvider";
import type { RegisteredTile } from "../../lib/types";
import { useTileRegistry } from "../../lib/use-tile-registry";
import TilingHeader from "./TilingHeader";

// Reads the current tile count so tests can assert addTile was called.
const TileCount: React.FC = () => {
  const { tiles } = useTiling();
  return <span data-testid="tile-count">{Object.keys(tiles).length}</span>;
};

const CameraTile: React.FC = () => <div data-testid="camera-body" />;
const LidarTile: React.FC = () => <div data-testid="lidar-body" />;

const RegisterTiles: React.FC<{ entries: RegisteredTile[] }> = ({
  entries,
}) => {
  const { registerTile } = useTileRegistry();
  // This effect registers the tile kinds supplied by the test harness.
  useEffect(() => {
    const disposes = entries.map((e) => registerTile(e));
    return () => {
      for (const d of disposes) d();
    };
  }, [entries, registerTile]);
  return null;
};

describe("TilingHeader", () => {
  beforeEach(() => {
    // voodo's Dropdown (headlessui Menu) uses ResizeObserver internally.
    global.ResizeObserver = vi.fn().mockImplementation(function () {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the filename and no add-tile menu when nothing is registered", () => {
    render(
      <TilingProvider>
        <TilingHeader fileName="session.fo" />
      </TilingProvider>,
    );
    expect(screen.getByText("session.fo")).toBeTruthy();
    expect(screen.queryByTestId("tiling-header-add-tile")).toBeNull();
  });

  it("renders compact header actions immediately before Layout", () => {
    render(
      <TilingProvider>
        <RegisterTiles
          entries={[
            {
              type: "camera",
              typeLabel: "Camera",
              icon: IconName.GridView,
              Tile: CameraTile,
            },
          ]}
        />
        <TilingHeader
          fileName="session.fo"
          headerActions={<button type="button">Unmount recording</button>}
        />
      </TilingProvider>,
    );

    expect(screen.getByText("session.fo")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Unmount recording" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent?.trim()),
    ).toEqual(["Unmount recording", "Layout"]);
  });

  it("does not render sidebar toggles when no handlers are wired", () => {
    render(
      <TilingProvider>
        <TilingHeader fileName="x" />
      </TilingProvider>,
    );
    expect(
      screen.queryByTestId("tiling-header-toggle-left-sidebar"),
    ).toBeNull();
    expect(
      screen.queryByTestId("tiling-header-toggle-timeline-tracks"),
    ).toBeNull();
    expect(
      screen.queryByTestId("tiling-header-toggle-right-sidebar"),
    ).toBeNull();
  });

  it("renders panel toggles in positional order and reflects their open state", () => {
    const onLeft = vi.fn();
    const onTimeline = vi.fn();
    const onRight = vi.fn();
    render(
      <TilingProvider>
        <TilingHeader
          fileName="x"
          leftSidebarOpen
          timelineTracksOpen={false}
          rightSidebarOpen={false}
          onToggleLeftSidebar={onLeft}
          onToggleTimelineTracks={onTimeline}
          onToggleRightSidebar={onRight}
        />
      </TilingProvider>,
    );

    const left = screen.getByTestId("tiling-header-toggle-left-sidebar");
    const bottom = screen.getByTestId("tiling-header-toggle-timeline-tracks");
    const right = screen.getByTestId("tiling-header-toggle-right-sidebar");
    expect(left.getAttribute("aria-pressed")).toBe("true");
    expect(bottom.getAttribute("aria-pressed")).toBe("false");
    expect(right.getAttribute("aria-pressed")).toBe("false");
    expect(left.getAttribute("aria-label")).toBe("Hide settings");
    expect(bottom.getAttribute("aria-label")).toBe("Show timeline tracks");
    expect(right.getAttribute("aria-label")).toBe("Show inspector");
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Hide settings", "Show timeline tracks", "Show inspector"]);

    fireEvent.click(left);
    fireEvent.click(bottom);
    fireEvent.click(right);
    expect(onLeft).toHaveBeenCalledOnce();
    expect(onTimeline).toHaveBeenCalledOnce();
    expect(onRight).toHaveBeenCalledOnce();
  });

  it("renders a labeled add-tile button once tiles are registered", () => {
    render(
      <TilingProvider>
        <RegisterTiles
          entries={[
            {
              type: "camera",
              typeLabel: "Camera",
              icon: IconName.GridView,
              Tile: CameraTile,
            },
            {
              type: "lidar",
              typeLabel: "Lidar",
              icon: IconName.Embeddings,
              Tile: LidarTile,
            },
          ]}
        />
        <TilingHeader fileName="x" />
      </TilingProvider>,
    );
    const button = screen.getByTestId("tiling-header-add-tile");
    expect(button).toBeTruthy();
    expect(button.getAttribute("aria-label")).toBe("Layout");
    expect(button.textContent).toBe("Layout");
    expect(button.className).toContain("border-1");
  });

  it("clicking a menu item calls addTile with the registered tile type", () => {
    render(
      <TilingProvider>
        <RegisterTiles
          entries={[
            {
              type: "camera",
              typeLabel: "Camera",
              icon: IconName.GridView,
              Tile: CameraTile,
            },
          ]}
        />
        <TilingHeader fileName="x" />
        <TileCount />
      </TilingProvider>,
    );
    expect(screen.getByTestId("tile-count").textContent).toBe("0");

    // Open the dropdown and click the Camera menu item.
    fireEvent.click(screen.getByTestId("tiling-header-add-tile"));
    fireEvent.click(screen.getByText("Camera"));

    expect(screen.getByTestId("tile-count").textContent).toBe("1");
  });

  it("renders custom addTileMenu content instead of the kind items", () => {
    render(
      <TilingProvider>
        <RegisterTiles
          entries={[
            {
              type: "camera",
              typeLabel: "Camera",
              icon: IconName.GridView,
              Tile: CameraTile,
            },
          ]}
        />
        <TilingHeader
          fileName="x"
          addTileMenu={
            <MenuTextItem onClick={() => undefined}>CAM_FRONT</MenuTextItem>
          }
        />
      </TilingProvider>,
    );

    fireEvent.click(screen.getByTestId("tiling-header-add-tile"));
    expect(screen.getByText("CAM_FRONT")).toBeTruthy();
    expect(screen.queryByText("Camera")).toBeNull();
    // The layout action stays appended below any custom catalog.
    expect(screen.getByText("Auto Layout")).toBeTruthy();
    expect(screen.getByText("Reset Layout")).toBeTruthy();
  });

  it("offers the add-tile menu for a custom menu even with no registered kinds", () => {
    render(
      <TilingProvider>
        <TilingHeader
          fileName="x"
          addTileMenu={
            <MenuTextItem onClick={() => undefined}>CAM_FRONT</MenuTextItem>
          }
        />
      </TilingProvider>,
    );
    expect(screen.getByTestId("tiling-header-add-tile")).toBeTruthy();
  });
});
