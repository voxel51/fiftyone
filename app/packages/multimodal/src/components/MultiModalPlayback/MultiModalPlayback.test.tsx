import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The MCAP tile components transitively import three.js, which evaluates
// WebGPU constants at module load and crashes in jsdom. Stub the
// inventory hooks so the shell test doesn't drag those in.
vi.mock("../../adapters/mcap/react/use-mcap-scene-inventory", () => ({
  useMcapSceneInventory: () => [],
  useMcapStreamPolicies: () => ({}),
  useMcapInitialTiles: () => ({}),
}));

// react-mosaic-component uses react-dnd which needs a DnD context; in
// jsdom we just need the layout to mount, so stub MosaicGrid to a
// passthrough that renders each tile's body.
vi.mock("@fiftyone/tiling", async () => {
  const actual = await vi.importActual<typeof import("@fiftyone/tiling")>(
    "@fiftyone/tiling"
  );
  return {
    ...actual,
    MosaicGrid: ({
      tiles,
    }: {
      tiles: Record<string, { title: string; render: () => React.ReactNode }>;
    }) => (
      <div data-testid="mosaic-stub">
        {Object.entries(tiles).map(([id, t]) => (
          <div key={id} data-testid={`stub-${id}`}>
            {t.title}
          </div>
        ))}
      </div>
    ),
  };
});

import MultiModalPlayback from "./MultiModalPlayback";

describe("MultiModalPlayback shell", () => {
  afterEach(() => cleanup());

  it("renders the filename in the header", () => {
    render(<MultiModalPlayback fileName="session.fo" />);
    expect(screen.getByText("session.fo")).toBeTruthy();
  });

  it("seeds the mosaic with the provided initialTiles", () => {
    render(
      <MultiModalPlayback
        fileName="session.fo"
        initialTiles={{
          "camera-1": { title: "camera_front", render: () => null },
          "lidar-1": { title: "lidar_top", render: () => null },
        }}
      />
    );
    expect(screen.getByTestId("stub-camera-1").textContent).toBe(
      "camera_front"
    );
    expect(screen.getByTestId("stub-lidar-1").textContent).toBe("lidar_top");
  });

  it("renders the default sidebars (settings + inspector empty states)", () => {
    render(<MultiModalPlayback fileName="x" />);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Focus a tile to edit its settings.")).toBeTruthy();
    expect(screen.getByText("Select a tile to inspect.")).toBeTruthy();
  });

  it("respects defaultLeftOpen / defaultRightOpen=false", () => {
    render(
      <MultiModalPlayback
        fileName="x"
        defaultLeftOpen={false}
        defaultRightOpen={false}
      />
    );
    expect(screen.queryByTestId("drawer")).toBeNull();
  });
});
