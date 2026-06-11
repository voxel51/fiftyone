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
vi.mock("./McapCameraTile", () => ({ default: () => null }));
vi.mock("./McapLidarTile", () => ({ default: () => null }));

describe("useMcapModalLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it("falls back to the built-in defaults when nothing is persisted", () => {
    const { result } = renderHook(() => useMcapModalLayout("scene.mcap"));
    expect(Object.keys(result.current.initialTiles)).toEqual([
      "camera-default",
      "lidar-default",
    ]);
    expect(result.current.initialLayout).toBeUndefined();
    expect(result.current.defaultLeftOpen).toBe(false);
    expect(result.current.defaultRightOpen).toBe(false);
  });

  it("restores persisted sidebar state and a valid tile arrangement", () => {
    writeMcapModalLayout({
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      layout: {
        direction: "row",
        first: "camera-default",
        second: "lidar-7",
        splitPercentage: 70,
      },
    });
    const { result } = renderHook(() => useMcapModalLayout("scene.mcap"));
    expect(result.current.defaultLeftOpen).toBe(true);
    expect(result.current.defaultRightOpen).toBe(true);
    expect(result.current.initialLayout).toEqual({
      direction: "row",
      first: "camera-default",
      second: "lidar-7",
      splitPercentage: 70,
    });
    expect(Object.keys(result.current.initialTiles).sort()).toEqual([
      "camera-default",
      "lidar-7",
    ]);
    expect(result.current.initialTiles["camera-default"].title).toBe("Camera");
    expect(result.current.initialTiles["lidar-7"].title).toBe("Lidar");
  });

  it("discards the whole restore when any leaf has an unknown tile type", () => {
    writeMcapModalLayout({
      layout: {
        direction: "row",
        first: "camera-default",
        second: "radar-2",
      },
    });
    const { result } = renderHook(() => useMcapModalLayout("scene.mcap"));
    expect(result.current.initialLayout).toBeUndefined();
    expect(Object.keys(result.current.initialTiles)).toEqual([
      "camera-default",
      "lidar-default",
    ]);
  });

  it("persists sidebar toggles through the change callbacks", () => {
    const { result } = renderHook(() => useMcapModalLayout("scene.mcap"));
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
