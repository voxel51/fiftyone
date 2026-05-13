import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TilingProvider } from "../../lib/TilingProvider";
// eslint-disable-next-line import/first
import { useTileRegistry } from "../../lib/use-tile-registry";
// eslint-disable-next-line import/first
import TilingHeader from "./TilingHeader";

const CameraTile: React.FC = () => <div data-testid="camera-body" />;
const LidarTile: React.FC = () => <div data-testid="lidar-body" />;

/**
 * Mount inside the TilingProvider so it can register tile entries
 * exactly the way `useMockStreams` does in production stories.
 */
const RegisterTiles: React.FC<{
  entries: Array<{
    streamId: string;
    type: string;
    typeLabel: string;
    title: string;
    Tile: React.ComponentType;
  }>;
}> = ({ entries }) => {
  const { registerTile } = useTileRegistry();
  useEffect(() => {
    const disposes = entries.map((e) =>
      registerTile({ ...e, icon: "any" as unknown })
    );
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
              streamId: "camera_front",
              type: "camera",
              typeLabel: "Camera",
              title: "Camera front",
              Tile: CameraTile,
            },
            {
              streamId: "lidar_top",
              type: "lidar",
              typeLabel: "Lidar",
              title: "Lidar top",
              Tile: LidarTile,
            },
          ]}
        />
        <TilingHeader fileName="x" />
      </TilingProvider>
    );
    expect(screen.getByTestId("tiling-header-add-tile")).toBeTruthy();
  });
});
