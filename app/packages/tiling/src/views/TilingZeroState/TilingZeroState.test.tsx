import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MenuTextItem } from "@voxel51/voodo";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TilingProvider, useTiling } from "../../lib/TilingProvider";
import { useTileRegistry } from "../../lib/use-tile-registry";
import TilingZeroState from "./TilingZeroState";

const CameraTile: React.FC = () => <div data-cy="camera-body" />;

function RegisterCameraKind() {
  const { registerTile } = useTileRegistry();
  useEffect(
    () =>
      registerTile({
        type: "camera",
        typeLabel: "Camera",
        icon: null,
        Tile: CameraTile,
      }),
    [registerTile],
  );
  return null;
}

const TileCount: React.FC = () => {
  const { tiles } = useTiling();
  return <span data-cy="tile-count">{Object.keys(tiles).length}</span>;
};

describe("TilingZeroState", () => {
  afterEach(() => cleanup());

  it("spawns a tile from the default kind menu", () => {
    render(
      <TilingProvider>
        <RegisterCameraKind />
        <TilingZeroState />
        <TileCount />
      </TilingProvider>,
    );
    expect(screen.getByTestId("tile-count").textContent).toBe("0");

    fireEvent.click(screen.getByTestId("tiling-zero-state-add-tile"));
    fireEvent.click(screen.getByText("Camera"));
    expect(screen.getByTestId("tile-count").textContent).toBe("1");
  });

  it("renders custom menu content when provided", () => {
    render(
      <TilingProvider>
        <RegisterCameraKind />
        <TilingZeroState
          addTileMenu={
            <MenuTextItem onClick={() => {}}>CAM_FRONT</MenuTextItem>
          }
        />
      </TilingProvider>,
    );
    fireEvent.click(screen.getByTestId("tiling-zero-state-add-tile"));
    expect(screen.getByText("CAM_FRONT")).toBeTruthy();
    expect(screen.queryByText("Camera")).toBeNull();
  });
});
