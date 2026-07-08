import { TilingProvider, useTiling } from "@fiftyone/tiling";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button, Dropdown } from "@voxel51/voodo";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import McapAddTileMenu from "./McapAddTileMenu";

// The menu only stores render closures; tests never mount the heavy tile
// bodies.
vi.mock("./McapImageTile", () => ({ default: () => null }));
vi.mock("./Mcap3dTile", () => ({ default: () => null }));
vi.mock("./McapLogConsoleTile", () => ({ default: () => null }));
vi.mock("./McapPlotTile", () => ({ default: () => null }));
vi.mock("./McapRawMessageTile", () => ({ default: () => null }));

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

function renderMenu() {
  return render(
    <TilingProvider>
      <Dropdown
        trigger={<Button data-testid="open-add-tile-menu">open</Button>}
      >
        <McapAddTileMenu />
      </Dropdown>
      <TilingProbe />
    </TilingProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "open" }));
}

describe("McapAddTileMenu", () => {
  afterEach(() => cleanup());

  it("lists only panel archetypes", () => {
    renderMenu();
    openMenu();

    expect(screen.getByText("Image")).toBeTruthy();
    expect(screen.getByText("3D")).toBeTruthy();
    expect(screen.getByText("Logs")).toBeTruthy();
    expect(screen.getByText("Plot")).toBeTruthy();
    expect(screen.getByText("Message")).toBeTruthy();
    expect(screen.queryByText("Image streams")).toBeNull();
    expect(screen.queryByText("Raw messages")).toBeNull();
    expect(screen.queryByText("CAM_FRONT")).toBeNull();
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
