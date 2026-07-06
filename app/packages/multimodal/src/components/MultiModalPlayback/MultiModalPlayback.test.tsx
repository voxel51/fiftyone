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
      expandedTileId,
      focusedTileId,
      onExpandedTileIdChange,
      onFocusTile,
      tiles,
      value,
    }: {
      expandedTileId?: string | null;
      focusedTileId?: string | null;
      onExpandedTileIdChange?: (id: string | null) => void;
      onFocusTile?: (id: string, reason: "select" | "action") => void;
      tiles: Record<string, { title: string; render: () => React.ReactNode }>;
      value?: unknown;
    }) => (
      <div
        data-expanded-tile-id={expandedTileId ?? ""}
        data-layout={JSON.stringify(value ?? null)}
        data-cy="mosaic-stub"
      >
        {Object.entries(tiles).map(([id, t]) => (
          <div key={id} data-cy={`stub-${id}`}>
            <span data-cy={`title-${id}`}>{t.title}</span>
            <button
              data-cy={`select-${id}`}
              data-focused={focusedTileId === id ? "true" : "false"}
              onClick={() => onFocusTile?.(id, "select")}
            >
              select
            </button>
            <button
              data-cy={`action-${id}`}
              onClick={() => onFocusTile?.(id, "action")}
            >
              action
            </button>
            <button
              data-cy={`expand-${id}`}
              data-expanded={expandedTileId === id ? "true" : "false"}
              onClick={() =>
                onExpandedTileIdChange?.(expandedTileId === id ? null : id)
              }
            >
              expand
            </button>
          </div>
        ))}
      </div>
    ),
  };
});

import MultiModalPlayback, {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
} from "./MultiModalPlayback";

describe("MultiModalPlayback shell", () => {
  afterEach(() => cleanup());

  it("renders the filename in the header", () => {
    render(<MultiModalPlayback fileName="session.fo" />);
    expect(screen.getByText("session.fo")).toBeTruthy();
  });

  it("renders header actions beside the filename", () => {
    render(
      <MultiModalPlayback
        fileName="session.fo"
        headerActions={<button type="button">Unmount recording</button>}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Unmount recording" }),
    ).toBeTruthy();
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

  it("forwards a custom auto layout strategy to the tiling provider", () => {
    const autoLayoutStrategy = vi.fn(() => "lidar-1");
    render(
      <MultiModalPlayback
        fileName="session.fo"
        autoLayoutStrategy={autoLayoutStrategy}
        initialTiles={{
          "camera-1": { title: "camera_front", render: () => null },
          "lidar-1": { title: "lidar_top", render: () => null },
        }}
      />,
    );

    expect(autoLayoutStrategy).toHaveBeenCalledWith(["camera-1", "lidar-1"]);
    expect(screen.getByTestId("mosaic-stub").dataset.layout).toBe(
      JSON.stringify("lidar-1"),
    );
  });

  it("uses the forwarded strategy from the toolbar Auto Layout action", () => {
    const autoLayoutStrategy = vi.fn(() => "lidar-1");
    render(
      <MultiModalPlayback
        fileName="session.fo"
        addTileMenu={<span>Placeholder tile</span>}
        autoLayoutStrategy={autoLayoutStrategy}
        initialTiles={{
          "camera-1": { title: "camera_front", render: () => null },
          "lidar-1": { title: "lidar_top", render: () => null },
        }}
        initialLayout="camera-1"
        initialExpandedTileId="camera-1"
      />,
    );

    expect(autoLayoutStrategy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("tiling-header-add-tile"));
    fireEvent.click(screen.getByText("Auto Layout"));

    expect(autoLayoutStrategy).toHaveBeenCalledWith(["camera-1", "lidar-1"]);
    expect(screen.getByTestId("mosaic-stub").dataset.layout).toBe(
      JSON.stringify("lidar-1"),
    );
    expect(screen.getByTestId("mosaic-stub").dataset.expandedTileId).toBe("");
  });

  it("seeds the mosaic expanded tile from initialExpandedTileId", () => {
    render(
      <MultiModalPlayback
        fileName="session.fo"
        initialTiles={{
          "camera-1": { title: "camera_front", render: () => null },
          "lidar-1": { title: "lidar_top", render: () => null },
        }}
        initialExpandedTileId="lidar-1"
      />,
    );

    expect(screen.getByTestId("mosaic-stub").dataset.expandedTileId).toBe(
      "lidar-1",
    );
    expect(screen.getByTestId("expand-lidar-1").dataset.expanded).toBe("true");
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

  it("removes the right sidebar and its toggle when rightSidebar is null", () => {
    render(<MultiModalPlayback fileName="x" rightSidebar={null} />);
    expect(screen.queryByText("Select a tile to inspect.")).toBeNull();
    expect(
      screen.queryByTestId("tiling-header-toggle-right-sidebar"),
    ).toBeNull();
    expect(
      screen.getByTestId("tiling-header-toggle-left-sidebar"),
    ).toBeTruthy();
  });

  it("lets header captions react to active pane selection and deselection", () => {
    render(
      <MultiModalPlayback
        fileName="x"
        headerCaption={({ focusedTileTitle }) => (
          <span data-cy="caption-context">
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
          <span data-cy="caption-context">
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

  it("seeds the left sidebar width from leftSidebarWidth, clamped", () => {
    render(
      <MultiModalPlayback
        fileName="x"
        rightSidebar={null}
        leftSidebarWidth={10_000}
      />,
    );
    const pane = screen.getByTestId("left-sidebar-pane");
    expect(pane.style.width).toBe(`${SIDEBAR_MAX_WIDTH_PX}px`);
  });

  it("defaults the left sidebar width to 360px when unset", () => {
    render(<MultiModalPlayback fileName="x" rightSidebar={null} />);
    const pane = screen.getByTestId("left-sidebar-pane");
    expect(pane.style.width).toBe("360px");
  });

  it("resizes via the handle with clamping and reports the width at drag end", () => {
    // jsdom 20 has no PointerEvent, so fireEvent would fall back to a
    // bare Event and drop clientX. MouseEvent carries the coordinates —
    // all the drag math reads.
    window.PointerEvent ??= window.MouseEvent as typeof window.PointerEvent;
    const onWidth = vi.fn();
    render(
      <MultiModalPlayback
        fileName="x"
        rightSidebar={null}
        onLeftSidebarWidthChange={onWidth}
      />,
    );
    const handle = screen.getByTestId("sidebar-resize-handle");
    // jsdom has no pointer-capture plumbing; the handler only needs the
    // call to not throw.
    handle.setPointerCapture = vi.fn();
    const pane = screen.getByTestId("left-sidebar-pane");

    fireEvent.pointerDown(handle, { clientX: 360, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 460, pointerId: 1 });
    expect(pane.style.width).toBe("460px");

    // Overshooting the bounds clamps instead of tracking the pointer.
    fireEvent.pointerMove(handle, { clientX: 5_000, pointerId: 1 });
    expect(pane.style.width).toBe(`${SIDEBAR_MAX_WIDTH_PX}px`);

    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onWidth).toHaveBeenCalledTimes(1);
    expect(onWidth).toHaveBeenCalledWith(SIDEBAR_MAX_WIDTH_PX);

    // Moves after the drag ended don't resize.
    fireEvent.pointerMove(handle, { clientX: 100, pointerId: 1 });
    expect(pane.style.width).toBe(`${SIDEBAR_MAX_WIDTH_PX}px`);
  });

  it("can keep repeat tile selection focused", () => {
    render(
      <MultiModalPlayback
        fileName="x"
        deselectFocusedTileOnRepeatSelect={false}
        headerCaption={({ focusedTileTitle }) => (
          <span data-cy="caption-context">
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

describe("clampSidebarWidth", () => {
  it("passes through in-range widths, rounded to whole pixels", () => {
    expect(clampSidebarWidth(400)).toBe(400);
    expect(clampSidebarWidth(400.6)).toBe(401);
  });

  it("clamps to the resizable bounds", () => {
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_MIN_WIDTH_PX);
    expect(clampSidebarWidth(279)).toBe(SIDEBAR_MIN_WIDTH_PX);
    expect(clampSidebarWidth(561)).toBe(SIDEBAR_MAX_WIDTH_PX);
    expect(clampSidebarWidth(Number.MAX_SAFE_INTEGER)).toBe(
      SIDEBAR_MAX_WIDTH_PX,
    );
  });
});
