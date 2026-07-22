import { TilingProvider, useTiling } from "@fiftyone/tiling";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button, Dropdown, IconName } from "@voxel51/voodo";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerEpisodeTileExtension,
  resetEpisodeTileExtensionsForTests,
} from "../../../extensions/tiles/registry";
import AddTileMenu from "./AddTileMenu";
import { TILE_TYPE, type TileType } from "../tiles/tile-types";
import { tileTypesFor } from "./tile-catalog";

// The menu only stores render closures; tests never mount the heavy tile
// bodies.
vi.mock("../image/ImageTile", () => ({ default: () => null }));
vi.mock("../scene/tile/Scene3dTile", () => ({ default: () => null }));
vi.mock("../logs/LogConsoleTile", () => ({ default: () => null }));
vi.mock("../map/tile/MapTile", () => ({ default: () => null }));
vi.mock("../plots/PlotTile", () => ({ default: () => null }));
vi.mock("../raw/RawMessageTile", () => ({ default: () => null }));

const TilingProbe: React.FC = () => {
  const { focusedTileId, tiles } = useTiling();
  return (
    <span data-testid="tiling-probe">
      {JSON.stringify({
        focusedTileId,
        titles: Object.fromEntries(
          Object.entries(tiles).map(([id, tile]) => [id, tile.title]),
        ),
      })}
    </span>
  );
};

function probeState() {
  const probe = document.querySelector('[data-testid="tiling-probe"]');
  if (!probe) {
    throw new Error("Missing tiling probe");
  }

  return JSON.parse(probe.textContent ?? "{}") as {
    focusedTileId: string | null;
    titles: Record<string, string>;
  };
}

function renderMenu(tileTypes: readonly TileType[] = Object.values(TILE_TYPE)) {
  return render(
    <TilingProvider>
      <Dropdown
        trigger={<Button data-testid="open-add-tile-menu">open</Button>}
      >
        <AddTileMenu tileTypes={tileTypes} />
      </Dropdown>
      <TilingProbe />
    </TilingProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "open" }));
}

describe("AddTileMenu", () => {
  afterEach(() => {
    cleanup();
    resetEpisodeTileExtensionsForTests();
  });

  it("lists the built-in semantic tile kinds", () => {
    renderMenu();
    openMenu();

    expect(screen.getByText("Image")).toBeTruthy();
    expect(screen.getByText("3D")).toBeTruthy();
    expect(screen.getByText("Map")).toBeTruthy();
    expect(screen.getByText("Logs")).toBeTruthy();
    expect(screen.getByText("Plot")).toBeTruthy();
    expect(screen.getByText("Message")).toBeTruthy();
    expect(screen.queryByText("Image streams")).toBeNull();
    expect(screen.queryByText("Raw messages")).toBeNull();
    expect(screen.queryByText("CAM_FRONT")).toBeNull();
  });

  it("lists only tile kinds available for the current episode", () => {
    renderMenu([TILE_TYPE.IMAGE, TILE_TYPE.RAW]);
    openMenu();

    expect(screen.getByText("Image")).toBeTruthy();
    expect(screen.getByText("Message")).toBeTruthy();
    expect(screen.queryByText("3D")).toBeNull();
    expect(screen.queryByText("Map")).toBeNull();
    expect(screen.queryByText("Logs")).toBeNull();
    expect(screen.queryByText("Plot")).toBeNull();
  });

  it("spawns a fresh archetype tile and focuses it", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByText("Image"));

    const { focusedTileId, titles } = probeState();
    expect(titles["image-1"]).toBe("Image");
    expect(focusedTileId).toBe("image-1");
  });

  it("spawns additive message tiles", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByText("Message"));
    openMenu();
    fireEvent.click(screen.getByText("Message"));

    const { titles } = probeState();
    const rawIds = Object.keys(titles).filter((id) => id.startsWith("raw-"));
    expect(rawIds).toEqual(["raw-1", "raw-2"]);
    for (const id of rawIds) {
      expect(titles[id]).toBe("Message");
    }
  });

  it("spawns additive log tiles", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByText("Logs"));
    openMenu();
    fireEvent.click(screen.getByText("Logs"));

    const { titles } = probeState();
    const logIds = Object.keys(titles).filter((id) => id.startsWith("log-"));
    expect(logIds).toEqual(["log-1", "log-2"]);
    for (const id of logIds) {
      expect(titles[id]).toBe("Logs");
    }
  });
});

describe("tileTypesFor", () => {
  afterEach(resetEpisodeTileExtensionsForTests);

  it("uses semantic capabilities for plot and structured messages", () => {
    expect(
      tileTypesFor({
        hasNumericSeries: true,
        hasRawRecords: false,
        sourceTypes: ["image", "location"],
      }),
    ).toEqual([TILE_TYPE.IMAGE, TILE_TYPE.MAP, TILE_TYPE.PLOT]);

    expect(
      tileTypesFor({
        hasNumericSeries: false,
        hasRawRecords: true,
        sourceTypes: [],
      }),
    ).toEqual([TILE_TYPE.RAW]);
  });

  it("orders and filters build-time tile contributions with the built-ins", () => {
    registerEpisodeTileExtension({
      icon: IconName.JSON,
      id: "test:events",
      isAvailable: ({ sourceTypes }) => sourceTypes.includes("event"),
      order: 45,
      Tile: () => null,
      typeLabel: "Events",
    });

    expect(
      tileTypesFor({
        hasNumericSeries: true,
        hasRawRecords: false,
        sourceTypes: ["event"],
      }),
    ).toEqual(["test:events", TILE_TYPE.PLOT]);
  });
});
