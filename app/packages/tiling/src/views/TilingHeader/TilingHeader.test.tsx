import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IconName } from "@voxel51/voodo";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  useEffect(() => {
    const disposes = entries.map((e) => registerTile(e));
    return () => {
      for (const d of disposes) d();
    };
  }, [entries, registerTile]);
  return null;
};

describe("TilingHeader", () => {
  afterEach(() => cleanup());

  it("renders the filename and no add-tile menu when nothing is registered", () => {
    render(
      <TilingProvider>
        <TilingHeader fileName="session.fo" />
      </TilingProvider>
    );
    expect(screen.getByText("session.fo")).toBeTruthy();
    expect(screen.queryByTestId("tiling-header-add-tile")).toBeNull();
  });

  it("does not render sidebar toggles when no handlers are wired", () => {
    render(
      <TilingProvider>
        <TilingHeader fileName="x" />
      </TilingProvider>
    );
    expect(screen.queryByTestId("tiling-header-toggle-left-sidebar")).toBeNull();
    expect(screen.queryByTestId("tiling-header-toggle-right-sidebar")).toBeNull();
  });

  it("renders sidebar toggles and reflects open state via aria-pressed", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    render(
      <TilingProvider>
        <TilingHeader
          fileName="x"
          leftSidebarOpen
          rightSidebarOpen={false}
          onToggleLeftSidebar={onLeft}
          onToggleRightSidebar={onRight}
        />
      </TilingProvider>
    );

    const left = screen.getByTestId("tiling-header-toggle-left-sidebar");
    const right = screen.getByTestId("tiling-header-toggle-right-sidebar");
    expect(left.getAttribute("aria-pressed")).toBe("true");
    expect(right.getAttribute("aria-pressed")).toBe("false");
    expect(left.getAttribute("aria-label")).toBe("Hide settings");
    expect(right.getAttribute("aria-label")).toBe("Show inspector");

    fireEvent.click(left);
    fireEvent.click(right);
    expect(onLeft).toHaveBeenCalledOnce();
    expect(onRight).toHaveBeenCalledOnce();
  });

  it("renders the add-tile button once tiles are registered", () => {
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
      </TilingProvider>
    );
    expect(screen.getByTestId("tiling-header-add-tile")).toBeTruthy();
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
      </TilingProvider>
    );
    expect(screen.getByTestId("tile-count").textContent).toBe("0");

    // Open the dropdown and click the Camera menu item.
    fireEvent.click(screen.getByTestId("tiling-header-add-tile"));
    fireEvent.click(screen.getByText("Camera"));

    expect(screen.getByTestId("tile-count").textContent).toBe("1");
  });
});
