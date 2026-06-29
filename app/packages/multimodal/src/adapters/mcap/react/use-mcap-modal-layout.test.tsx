import { TilingProvider, useTiling } from "@fiftyone/tiling";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneSource } from "../../../scene-inventory";
import {
  readMcapModalLayout,
  writeMcapModalLayout,
} from "./mcap-layout-persistence";
import {
  McapModalLayoutPersistence,
  useMcapModalLayout,
} from "./use-mcap-modal-layout";

// The tile bodies drag in WebGPU/Three at module load, which jsdom can't
// evaluate. Layout restore only needs them to exist as components; the
// stubs expose their assigned source for binding assertions.
vi.mock("./McapImageTile", () => ({
  default: ({ initialSourceId }: { initialSourceId?: string }) => (
    <div data-testid="image-tile" data-source={initialSourceId} />
  ),
}));
vi.mock("./Mcap3dTile", () => ({ default: () => null }));

const SCENE_SOURCES: readonly SceneSource[] = [
  { id: "/cam/image_rect_compressed", type: "image", label: "cam" },
  { id: "/lidar", type: "point-cloud", label: "lidar" },
];

// Deterministic capabilities so jsdom's missing navigator signals can't
// sway the resolver's budgets.
const STRONG_CAPABILITIES = {
  cpuCores: 16,
  memoryGb: 16,
  networkDownlinkMbps: null,
  viewportWidth: 2560,
  viewportHeight: 1440,
};

function renderLayoutHook(sources: readonly SceneSource[]) {
  return renderHook(() =>
    useMcapModalLayout({ sources, capabilities: STRONG_CAPABILITIES }),
  );
}

function renderedSourceOf(tile: { render: () => React.ReactNode }) {
  const { container, unmount } = render(<>{tile.render()}</>);
  const source = container
    .querySelector('[data-testid="image-tile"]')
    ?.getAttribute("data-source");
  unmount();
  return source;
}

describe("useMcapModalLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it("derives resolver defaults with a deliberate arrangement", () => {
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-1",
      "3d-1",
    ]);
    expect(result.current.initialTiles["image-1"].title).toBe("cam");
    expect(result.current.initialLayout).toMatchObject({
      direction: "row",
      first: "image-1",
      second: "3d-1",
    });
    expect(result.current.defaultLeftOpen).toBe(false);
    expect(result.current.defaultRightOpen).toBe(false);
  });

  it("opens one tile per image source bound to distinct streams", () => {
    const { result } = renderLayoutHook([
      { id: "/a", type: "image", label: "a", recordCount: 10 },
      { id: "/b", type: "image", label: "b", recordCount: 90 },
      SCENE_SOURCES[1],
    ]);

    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-1",
      "image-2",
      "3d-1",
    ]);
    // Densest stream binds the first tile.
    expect(renderedSourceOf(result.current.initialTiles["image-1"])).toBe("/b");
    expect(renderedSourceOf(result.current.initialTiles["image-2"])).toBe("/a");
  });

  it("omits default tiles for types absent from the scene", () => {
    const { result } = renderLayoutHook([SCENE_SOURCES[0]]);
    expect(Object.keys(result.current.initialTiles)).toEqual(["image-1"]);
  });

  it("restores persisted sidebar state and a valid tile arrangement", () => {
    writeMcapModalLayout({
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      layout: {
        direction: "row",
        first: "image-default",
        second: "3d-7",
        splitPercentage: 70,
      },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(result.current.defaultLeftOpen).toBe(true);
    expect(result.current.defaultRightOpen).toBe(true);
    expect(result.current.initialLayout).toEqual({
      direction: "row",
      first: "image-default",
      second: "3d-7",
      splitPercentage: 70,
    });
    expect(Object.keys(result.current.initialTiles).sort()).toEqual([
      "3d-7",
      "image-default",
    ]);
    expect(result.current.initialTiles["image-default"].title).toBe("Image");
    expect(result.current.initialTiles["3d-7"].title).toBe("3D");
  });

  it("rebinds restored image tiles positionally to ranked sources", () => {
    writeMcapModalLayout({
      layout: {
        direction: "row",
        first: "image-3",
        second: "image-8",
      },
    });
    const { result } = renderLayoutHook([
      { id: "/a", type: "image", label: "a", recordCount: 10 },
      { id: "/b", type: "image", label: "b", recordCount: 90 },
    ]);

    expect(renderedSourceOf(result.current.initialTiles["image-3"])).toBe("/b");
    expect(renderedSourceOf(result.current.initialTiles["image-8"])).toBe("/a");
  });

  it("discards the whole restore when any leaf has an unknown tile type", () => {
    writeMcapModalLayout({
      layout: {
        direction: "row",
        first: "image-default",
        second: "radar-2",
      },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-1",
      "3d-1",
    ]);
  });

  it("discards the restore when a leaf's tile kind has no source in the scene", () => {
    writeMcapModalLayout({
      layout: {
        direction: "row",
        first: "image-default",
        second: "3d-default",
      },
    });
    const { result } = renderLayoutHook([SCENE_SOURCES[0]]);
    expect(Object.keys(result.current.initialTiles)).toEqual(["image-1"]);
  });

  it("persists sidebar toggles through the change callbacks", () => {
    const { result } = renderLayoutHook(SCENE_SOURCES);
    act(() => result.current.onLeftOpenChange(true));
    act(() => result.current.onRightOpenChange(true));
    const read = readMcapModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
    expect(read?.rightSidebarOpen).toBe(true);
  });
});

describe("McapModalLayoutPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  function LayoutDriver({ next }: { next: string | null }) {
    const { setLayout } = useTiling();
    // Drives the provider's layout from test props — stand-in for the
    // user rearranging tiles.
    useEffect(() => {
      setLayout(next);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [next]);
    return null;
  }

  it("writes layout changes after the debounce window", () => {
    render(
      <TilingProvider
        initialTiles={{
          "camera-default": { title: "Camera", render: () => null },
        }}
      >
        <LayoutDriver next="camera-default" />
        <McapModalLayoutPersistence />
      </TilingProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(readMcapModalLayout()?.layout).toBe("camera-default");
  });

  it("flushes the latest layout on unmount even when the debounce is pending", () => {
    const { unmount } = render(
      <TilingProvider
        initialTiles={{
          "camera-default": { title: "Camera", render: () => null },
        }}
      >
        <LayoutDriver next="camera-default" />
        <McapModalLayoutPersistence />
      </TilingProvider>,
    );

    // Unmount before the 500ms debounce fires.
    unmount();
    expect(readMcapModalLayout()?.layout).toBe("camera-default");
  });
});
