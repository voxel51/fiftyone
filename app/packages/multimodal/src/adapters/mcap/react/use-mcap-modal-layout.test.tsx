import { TilingProvider, useTiling } from "@fiftyone/tiling";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readMcapModalLayout,
  writeMcapModalLayout,
} from "./mcap-layout-persistence";
import {
  McapModalLayoutPersistence,
  useMcapModalLayout,
} from "./use-mcap-modal-layout";

// The tile bodies drag in WebGPU/Three at module load, which jsdom can't
// evaluate. Layout restore only needs them to exist as components.
vi.mock("./McapImageTile", () => ({ default: () => null }));
vi.mock("./Mcap3dTile", () => ({ default: () => null }));

const SCENE_SOURCES = [
  { id: "/cam/image_rect_compressed", type: "image", label: "cam" },
  { id: "/lidar", type: "point-cloud", label: "lidar" },
];

describe("useMcapModalLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it("derives default tiles from the source types present", () => {
    const { result } = renderHook(() => useMcapModalLayout(SCENE_SOURCES));
    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-default",
      "3d-default",
    ]);
    expect(result.current.initialLayout).toBeUndefined();
    expect(result.current.defaultLeftOpen).toBe(false);
    expect(result.current.defaultRightOpen).toBe(false);
  });

  it("omits default tiles for types absent from the scene", () => {
    const { result } = renderHook(() => useMcapModalLayout([SCENE_SOURCES[0]]));
    expect(Object.keys(result.current.initialTiles)).toEqual(["image-default"]);
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
    const { result } = renderHook(() => useMcapModalLayout(SCENE_SOURCES));
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

  it("discards the whole restore when any leaf has an unknown tile type", () => {
    writeMcapModalLayout({
      layout: {
        direction: "row",
        first: "image-default",
        second: "radar-2",
      },
    });
    const { result } = renderHook(() => useMcapModalLayout(SCENE_SOURCES));
    expect(result.current.initialLayout).toBeUndefined();
    expect(Object.keys(result.current.initialTiles)).toEqual([
      "image-default",
      "3d-default",
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
    const { result } = renderHook(() => useMcapModalLayout([SCENE_SOURCES[0]]));
    expect(result.current.initialLayout).toBeUndefined();
    expect(Object.keys(result.current.initialTiles)).toEqual(["image-default"]);
  });

  it("persists sidebar toggles through the change callbacks", () => {
    const { result } = renderHook(() => useMcapModalLayout(SCENE_SOURCES));
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
      </TilingProvider>
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
      </TilingProvider>
    );

    // Unmount before the 500ms debounce fires.
    unmount();
    expect(readMcapModalLayout()?.layout).toBe("camera-default");
  });
});
