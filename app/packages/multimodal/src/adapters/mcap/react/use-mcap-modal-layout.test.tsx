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
  pruneMosaicLayout,
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

function renderLayoutHook(sources: readonly SceneSource[], datasetId?: string) {
  return renderHook(() =>
    useMcapModalLayout({
      sources,
      datasetId,
      capabilities: STRONG_CAPABILITIES,
    }),
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
    expect(result.current.defaultLeftOpen).toBe(true);
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
      leftSidebarOpen: false,
      layout: {
        direction: "row",
        first: "image-default",
        second: "3d-7",
        splitPercentage: 70,
      },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(result.current.defaultLeftOpen).toBe(false);
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

  it("restores expanded tile state when the tile survives layout restore", () => {
    writeMcapModalLayout({
      expandedTileId: "3d-7",
      layout: {
        direction: "row",
        first: "image-default",
        second: "3d-7",
        splitPercentage: 70,
      },
    });

    const { result } = renderLayoutHook(SCENE_SOURCES);

    expect(result.current.initialExpandedTileId).toBe("3d-7");
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

  it("prunes leaves with unknown tile types and promotes the sibling", () => {
    writeMcapModalLayout({
      expandedTileId: "radar-2",
      layout: {
        direction: "row",
        first: "image-default",
        second: "radar-2",
      },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(result.current.initialLayout).toBe("image-default");
    expect(result.current.initialExpandedTileId).toBeNull();
    expect(Object.keys(result.current.initialTiles)).toEqual(["image-default"]);
  });

  it("prunes leaves whose tile kind has no source in the scene", () => {
    // A layout saved with a 3D topic, opened on an image-only recording,
    // keeps its image tile instead of resetting.
    writeMcapModalLayout({
      layout: {
        direction: "row",
        first: "image-default",
        second: "3d-default",
      },
    });
    const { result } = renderLayoutHook([SCENE_SOURCES[0]]);
    expect(result.current.initialLayout).toBe("image-default");
    expect(Object.keys(result.current.initialTiles)).toEqual(["image-default"]);
  });

  it("keeps surviving split percentages when pruning a nested leaf", () => {
    writeMcapModalLayout({
      layout: {
        direction: "row",
        splitPercentage: 70,
        first: {
          direction: "column",
          splitPercentage: 30,
          first: "image-default",
          second: "radar-9",
        },
        second: "3d-1",
      },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(result.current.initialLayout).toEqual({
      direction: "row",
      splitPercentage: 70,
      first: "image-default",
      second: "3d-1",
    });
  });

  it("falls back to resolver defaults when every leaf is pruned", () => {
    writeMcapModalLayout({
      layout: { direction: "row", first: "radar-1", second: "radar-2" },
    });
    const { result } = renderLayoutHook(SCENE_SOURCES);
    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-1",
      "3d-1",
    ]);
    expect(result.current.initialLayout).toMatchObject({
      first: "image-1",
      second: "3d-1",
    });
  });

  it("rebinds surviving image leaves positionally after pruning", () => {
    writeMcapModalLayout({
      layout: {
        direction: "row",
        first: "image-3",
        second: { direction: "column", first: "radar-2", second: "image-8" },
      },
    });
    const { result } = renderLayoutHook([
      { id: "/a", type: "image", label: "a", recordCount: 10 },
      { id: "/b", type: "image", label: "b", recordCount: 90 },
    ]);
    expect(result.current.initialLayout).toEqual({
      direction: "row",
      first: "image-3",
      second: "image-8",
    });
    expect(renderedSourceOf(result.current.initialTiles["image-3"])).toBe("/b");
    expect(renderedSourceOf(result.current.initialTiles["image-8"])).toBe("/a");
  });

  it("reads the arrangement persisted for the given dataset", () => {
    writeMcapModalLayout(
      {
        layout: {
          direction: "row",
          first: "image-1",
          second: "3d-1",
          splitPercentage: 20,
        },
      },
      "dataset-a",
    );
    writeMcapModalLayout(
      {
        layout: {
          direction: "column",
          first: "image-1",
          second: "3d-1",
          splitPercentage: 80,
        },
      },
      "dataset-b",
    );
    const a = renderLayoutHook(SCENE_SOURCES, "dataset-a");
    expect(a.result.current.initialLayout).toMatchObject({
      direction: "row",
      splitPercentage: 20,
    });
    const b = renderLayoutHook(SCENE_SOURCES, "dataset-b");
    expect(b.result.current.initialLayout).toMatchObject({
      direction: "column",
      splitPercentage: 80,
    });
  });

  it("restores the persisted sidebar width", () => {
    writeMcapModalLayout({ sidebarWidthPx: 480 }, "dataset-a");
    const { result } = renderLayoutHook(SCENE_SOURCES, "dataset-a");
    expect(result.current.defaultLeftSidebarWidth).toBe(480);
  });

  it("persists sidebar toggles through the change callbacks", () => {
    const { result } = renderLayoutHook(SCENE_SOURCES);
    act(() => result.current.onLeftOpenChange(true));
    const read = readMcapModalLayout();
    expect(read?.leftSidebarOpen).toBe(true);
  });

  it("persists sidebar state and width under the hook's dataset", () => {
    const { result } = renderLayoutHook(SCENE_SOURCES, "dataset-a");
    act(() => result.current.onLeftOpenChange(false));
    act(() => result.current.onLeftSidebarWidthChange(420));
    const read = readMcapModalLayout("dataset-a");
    expect(read?.leftSidebarOpen).toBe(false);
    expect(read?.sidebarWidthPx).toBe(420);
  });
});

describe("pruneMosaicLayout", () => {
  const rejecting =
    (...bad: string[]) =>
    (id: string) =>
      !bad.includes(id);

  it("returns the tree intact when every leaf is valid", () => {
    const tree = {
      direction: "row" as const,
      splitPercentage: 60,
      first: "a-1",
      second: { direction: "column" as const, first: "b-1", second: "c-1" },
    };
    expect(pruneMosaicLayout(tree, () => true)).toEqual(tree);
  });

  it("prunes an invalid root leaf to null", () => {
    expect(pruneMosaicLayout("a-1", rejecting("a-1"))).toBeNull();
  });

  it("promotes the surviving sibling when one child is pruned", () => {
    expect(
      pruneMosaicLayout(
        { direction: "row", first: "a-1", second: "b-1" },
        rejecting("b-1"),
      ),
    ).toBe("a-1");
  });

  it("prunes a parent whose children are both pruned", () => {
    expect(
      pruneMosaicLayout(
        {
          direction: "row",
          first: "a-1",
          second: { direction: "column", first: "b-1", second: "c-1" },
        },
        rejecting("b-1", "c-1"),
      ),
    ).toBe("a-1");
  });

  it("returns null when the whole tree is pruned", () => {
    expect(
      pruneMosaicLayout(
        { direction: "row", first: "a-1", second: "b-1" },
        rejecting("a-1", "b-1"),
      ),
    ).toBeNull();
  });

  it("keeps split percentages of surviving parents", () => {
    expect(
      pruneMosaicLayout(
        {
          direction: "row",
          splitPercentage: 70,
          first: {
            direction: "column",
            splitPercentage: 30,
            first: "a-1",
            second: "bad-1",
          },
          second: "c-1",
        },
        rejecting("bad-1"),
      ),
    ).toEqual({
      direction: "row",
      splitPercentage: 70,
      first: "a-1",
      second: "c-1",
    });
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

  function ExpandedDriver({ next }: { next: string | null }) {
    const { setExpandedTileId } = useTiling();
    // Drives the provider's fullscreen state from test props — stand-in
    // for the user toggling a tile's fullscreen button.
    useEffect(() => {
      setExpandedTileId(next);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [next]);
    return null;
  }

  // Two tiles so the provider's derived initial layout differs from the
  // single-leaf arrangement the driver applies — persistence only writes
  // once the layout changes from what the mount started with.
  const TWO_TILES = {
    "camera-default": { title: "Camera", render: () => null },
    "lidar-default": { title: "Lidar", render: () => null },
  };

  it("writes layout changes after the debounce window", () => {
    render(
      <TilingProvider initialTiles={TWO_TILES}>
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
      <TilingProvider initialTiles={TWO_TILES}>
        <LayoutDriver next="camera-default" />
        <McapModalLayoutPersistence />
      </TilingProvider>,
    );

    // Unmount before the 500ms debounce fires.
    unmount();
    expect(readMcapModalLayout()?.layout).toBe("camera-default");
  });

  it("writes under the dataset it was given", () => {
    render(
      <TilingProvider initialTiles={TWO_TILES}>
        <LayoutDriver next="camera-default" />
        <McapModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(readMcapModalLayout("dataset-a")?.layout).toBe("camera-default");
  });

  it("writes expanded tile changes after the debounce window", () => {
    render(
      <TilingProvider initialTiles={TWO_TILES}>
        <ExpandedDriver next="camera-default" />
        <McapModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(readMcapModalLayout("dataset-a")?.expandedTileId).toBe(
      "camera-default",
    );
    expect(readMcapModalLayout("dataset-a")?.layout).toBeUndefined();
  });

  it("flushes expanded tile changes on unmount even when the debounce is pending", () => {
    const { unmount } = render(
      <TilingProvider initialTiles={TWO_TILES}>
        <ExpandedDriver next="camera-default" />
        <McapModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    unmount();
    expect(readMcapModalLayout("dataset-a")?.expandedTileId).toBe(
      "camera-default",
    );
  });

  it("does not persist a layout the user never edited", () => {
    // A pruned restore mounts as-is; merely viewing it (and closing the
    // modal) must not overwrite the saved arrangement with the pruned tree.
    const { unmount } = render(
      <TilingProvider
        initialTiles={{
          "camera-default": { title: "Camera", render: () => null },
        }}
      >
        <McapModalLayoutPersistence datasetId="dataset-a" />
      </TilingProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(600);
    });
    unmount();
    expect(readMcapModalLayout("dataset-a")).toBeNull();
  });
});
