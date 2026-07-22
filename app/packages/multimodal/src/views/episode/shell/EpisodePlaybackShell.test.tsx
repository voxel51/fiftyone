import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useTiling } from "@fiftyone/tiling";
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
        data-testid="mosaic-stub"
      >
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
            <button
              data-testid={`expand-${id}`}
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

// The shell only owns the opt-in wrapper boundary; the stage's renderer and
// registration lifecycle have focused tests in webgpu-view-stage.test.tsx.
vi.mock("../../../visualization/webgpu/webgpu-view-stage", async () => {
  const react = await vi.importActual<typeof import("react")>("react");
  return {
    WebGpuViewStage: ({
      children,
      className,
    }: {
      readonly children: React.ReactNode;
      readonly className?: string;
    }) =>
      react.createElement(
        "div",
        { className, "data-testid": "webgpu-view-stage" },
        react.createElement(
          "div",
          { "data-testid": "webgpu-view-stage-content" },
          children,
        ),
      ),
  };
});

import EpisodePlaybackShell, {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
} from "./EpisodePlaybackShell";

const AddCameraTileMenuItem = () => {
  const { addTile } = useTiling();
  return (
    <button
      type="button"
      onClick={() =>
        addTile({
          render: () => null,
          title: "Camera",
          type: "camera",
        })
      }
    >
      Camera
    </button>
  );
};

describe("EpisodePlaybackShell shell", () => {
  afterEach(() => cleanup());

  it("renders the filename in the header", () => {
    render(<EpisodePlaybackShell fileName="session.fo" />);
    expect(screen.getByText("session.fo")).toBeTruthy();
  });

  it("hosts the mosaic inside the shared WebGPU view stage when enabled", () => {
    render(
      <EpisodePlaybackShell fileName="session.fo" sharedImageWebGpuViews />,
    );

    expect(
      screen
        .getByTestId("webgpu-view-stage-content")
        .contains(screen.getByTestId("mosaic-stub")),
    ).toBe(true);
    expect(screen.getByTestId("webgpu-view-stage").className).toContain(
      "sharedViewStage",
    );
  });

  it("does not mount the shared WebGPU view stage by default", () => {
    render(<EpisodePlaybackShell fileName="session.fo" />);

    expect(screen.queryByTestId("webgpu-view-stage")).toBeNull();
    expect(screen.getByTestId("mosaic-stub")).toBeTruthy();
  });

  it("renders header actions beside the filename", () => {
    render(
      <EpisodePlaybackShell
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
      <EpisodePlaybackShell
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
      <EpisodePlaybackShell
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
      <EpisodePlaybackShell
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

  it("restores host defaults from the toolbar Reset Layout action", () => {
    const resetLayout = {
      direction: "row" as const,
      first: "camera-1",
      second: "lidar-1",
      splitPercentage: 60,
    };
    render(
      <EpisodePlaybackShell
        fileName="session.fo"
        addTileMenu={<span>Placeholder tile</span>}
        initialTiles={{
          "camera-9": { title: "persisted_camera", render: () => null },
        }}
        initialLayout="camera-9"
        resetTiles={{
          "camera-1": { title: "camera_front", render: () => null },
          "lidar-1": { title: "lidar_top", render: () => null },
        }}
        resetLayout={resetLayout}
      />,
    );

    fireEvent.click(screen.getByTestId("tiling-header-add-tile"));
    fireEvent.click(screen.getByText("Reset Layout"));

    expect(screen.getByTestId("mosaic-stub").dataset.layout).toBe(
      JSON.stringify(resetLayout),
    );
    expect(screen.getByTestId("title-camera-1").textContent).toBe(
      "camera_front",
    );
    expect(screen.getByTestId("title-lidar-1").textContent).toBe("lidar_top");
    expect(screen.queryByTestId("title-camera-9")).toBeNull();
  });

  it("seeds the mosaic expanded tile from initialExpandedTileId", () => {
    render(
      <EpisodePlaybackShell
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
    render(<EpisodePlaybackShell fileName="x" />);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Focus a tile to edit its settings.")).toBeTruthy();
    expect(screen.getByText("Select a tile to inspect.")).toBeTruthy();
  });

  it("respects defaultLeftOpen / defaultRightOpen=false", () => {
    render(
      <EpisodePlaybackShell
        fileName="x"
        defaultLeftOpen={false}
        defaultRightOpen={false}
      />,
    );
    expect(screen.queryByTestId("drawer")).toBeNull();
  });

  it("toggles timeline tracks from the header", () => {
    render(
      <EpisodePlaybackShell
        fileName="x"
        defaultLeftOpen={false}
        defaultRightOpen={false}
        tracks={[
          {
            id: "track-a",
            label: "Track A",
            color: "#4a9eff",
            events: [],
          },
        ]}
      />,
    );

    const timeline = screen.getByTestId("tiling-header-toggle-timeline-tracks");

    expect(timeline.getAttribute("aria-pressed")).toBe("false");
    expect(timeline.getAttribute("aria-label")).toBe("Show timeline tracks");

    fireEvent.click(timeline);

    expect(timeline.getAttribute("aria-pressed")).toBe("true");
    expect(timeline.getAttribute("aria-label")).toBe("Hide timeline tracks");
  });

  it("opens the left sidebar when Add tile spawns a panel", () => {
    const onLeftOpenChange = vi.fn();
    render(
      <EpisodePlaybackShell
        addTileMenu={<AddCameraTileMenuItem />}
        defaultLeftOpen={false}
        defaultRightOpen={false}
        fileName="x"
        onLeftOpenChange={onLeftOpenChange}
      />,
    );

    expect(screen.queryByTestId("drawer")).toBeNull();
    fireEvent.click(screen.getByTestId("tiling-header-add-tile"));
    fireEvent.click(screen.getByText("Camera"));

    expect(screen.getByTestId("left-sidebar-pane")).toBeTruthy();
    expect(onLeftOpenChange).toHaveBeenCalledWith(true);
  });

  it("removes the right sidebar and its toggle when rightSidebar is null", () => {
    render(<EpisodePlaybackShell fileName="x" rightSidebar={null} />);
    expect(screen.queryByText("Select a tile to inspect.")).toBeNull();
    expect(
      screen.queryByTestId("tiling-header-toggle-right-sidebar"),
    ).toBeNull();
    expect(
      screen.getByTestId("tiling-header-toggle-left-sidebar"),
    ).toBeTruthy();
  });

  it("keeps the left sidebar mounted when a main-viewport overlay appears", () => {
    let sidebarMounts = 0;
    let sidebarUnmounts = 0;
    const SidebarProbe = () => {
      React.useEffect(() => {
        sidebarMounts += 1;
        return () => {
          sidebarUnmounts += 1;
        };
      }, []);
      return <div data-testid="sidebar-probe" />;
    };
    const { rerender } = render(
      <EpisodePlaybackShell
        fileName="sample-a"
        leftSidebar={<SidebarProbe />}
        rightSidebar={null}
      />,
    );

    rerender(
      <EpisodePlaybackShell
        fileName="sample-b"
        leftSidebar={<SidebarProbe />}
        mainOverlay={<div data-testid="main-overlay" />}
        rightSidebar={null}
      />,
    );

    const overlay = screen.getByTestId("main-overlay");
    expect(screen.getByTestId("left-sidebar-pane").contains(overlay)).toBe(
      false,
    );
    expect(
      screen.getByTestId("mosaic-stub").parentElement?.contains(overlay),
    ).toBe(true);
    expect(sidebarMounts).toBe(1);
    expect(sidebarUnmounts).toBe(0);
  });

  it("lets header captions react to active pane selection and deselection", () => {
    render(
      <EpisodePlaybackShell
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
      <EpisodePlaybackShell
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

  it("seeds the left sidebar width from leftSidebarWidth, clamped", () => {
    render(
      <EpisodePlaybackShell
        fileName="x"
        rightSidebar={null}
        leftSidebarWidth={10_000}
      />,
    );
    const pane = screen.getByTestId("left-sidebar-pane");
    expect(pane.style.width).toBe(`${SIDEBAR_MAX_WIDTH_PX}px`);
  });

  it("defaults the left sidebar width to 360px when unset", () => {
    render(<EpisodePlaybackShell fileName="x" rightSidebar={null} />);
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
      <EpisodePlaybackShell
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
      <EpisodePlaybackShell
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
