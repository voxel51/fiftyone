import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// react-mosaic-component uses react-dnd which needs a DnD context; in
// jsdom we just need the layout to mount, so stub MosaicGrid to a
// passthrough that renders each tile's body.
vi.mock("@fiftyone/tiling", async () => {
  const actual =
    await vi.importActual<typeof import("@fiftyone/tiling")>(
      "@fiftyone/tiling",
    );
  return {
    ...actual,
    MosaicGrid: ({
      focusedTileId,
      onFocusTile,
      tiles,
    }: {
      focusedTileId?: string | null;
      onFocusTile?: (id: string, reason: "select" | "action") => void;
      tiles: Record<string, { title: string; render: () => React.ReactNode }>;
    }) => (
      <div data-testid="mosaic-stub">
        {Object.entries(tiles).map(([id, t]) => (
          <div key={id} data-testid={`stub-${id}`}>
            <span data-testid={`title-${id}`}>{t.title}</span>
            <button
              data-testid={`select-${id}`}
              data-focused={focusedTileId === id ? "true" : "false"}
              onClick={() => onFocusTile?.(id, "select")}
            >
              select
            </button>
            <button
              data-testid={`action-${id}`}
              onClick={() => onFocusTile?.(id, "action")}
            >
              action
            </button>
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
      />,
    );
    expect(screen.getByTestId("title-camera-1").textContent).toBe(
      "camera_front",
    );
    expect(screen.getByTestId("title-lidar-1").textContent).toBe("lidar_top");
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
      />,
    );
    expect(screen.queryByTestId("drawer")).toBeNull();
  });

  it("lets header captions react to active pane selection and deselection", () => {
    render(
      <MultiModalPlayback
        fileName="x"
        headerCaption={({ focusedTileTitle }) => (
          <span data-testid="caption-context">
            {focusedTileTitle ?? "Scene context"}
          </span>
        )}
        initialTiles={{
          "camera-1": { title: "Camera", render: () => null },
        }}
      />,
    );

    expect(screen.getByTestId("caption-context").textContent).toBe(
      "Scene context",
    );
    fireEvent.click(screen.getByTestId("select-camera-1"));
    expect(screen.getByTestId("caption-context").textContent).toBe("Camera");
    expect(screen.getByTestId("select-camera-1").dataset.focused).toBe("true");

    fireEvent.click(screen.getByTestId("select-camera-1"));
    expect(screen.getByTestId("caption-context").textContent).toBe(
      "Scene context",
    );
    expect(screen.getByTestId("select-camera-1").dataset.focused).toBe("false");
  });

  it("keeps pane actions focused instead of toggling the active pane off", () => {
    render(
      <MultiModalPlayback
        fileName="x"
        headerCaption={({ focusedTileTitle }) => (
          <span data-testid="caption-context">
            {focusedTileTitle ?? "Scene context"}
          </span>
        )}
        initialTiles={{
          "camera-1": { title: "Camera", render: () => null },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("action-camera-1"));
    expect(screen.getByTestId("caption-context").textContent).toBe("Camera");
    expect(screen.getByTestId("select-camera-1").dataset.focused).toBe("true");

    fireEvent.click(screen.getByTestId("action-camera-1"));
    expect(screen.getByTestId("caption-context").textContent).toBe("Camera");
    expect(screen.getByTestId("select-camera-1").dataset.focused).toBe("true");
  });

  it("can keep repeat tile selection focused", () => {
    render(
      <MultiModalPlayback
        fileName="x"
        deselectFocusedTileOnRepeatSelect={false}
        headerCaption={({ focusedTileTitle }) => (
          <span data-testid="caption-context">
            {focusedTileTitle ?? "Scene context"}
          </span>
        )}
        initialTiles={{
          "camera-1": { title: "Camera", render: () => null },
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("select-camera-1"));
    expect(screen.getByTestId("caption-context").textContent).toBe("Camera");
    expect(screen.getByTestId("select-camera-1").dataset.focused).toBe("true");

    fireEvent.click(screen.getByTestId("select-camera-1"));
    expect(screen.getByTestId("caption-context").textContent).toBe("Camera");
    expect(screen.getByTestId("select-camera-1").dataset.focused).toBe("true");
  });
});
