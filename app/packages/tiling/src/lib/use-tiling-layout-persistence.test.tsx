import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TilingProvider } from "./TilingProvider";
import type { TilingTile } from "./types";
import { useTiling } from "./TilingProvider";
import { useTilingLayoutPersistence } from "./use-tiling-layout-persistence";

const makeTile = (title: string): TilingTile => ({ title, render: () => null });

const INITIAL_TILES = {
  "camera-1": makeTile("camera"),
  "lidar-1": makeTile("lidar"),
};

function makeWrapper(initialTiles: Record<string, TilingTile> = INITIAL_TILES) {
  return ({ children }: { children: React.ReactNode }) => (
    <TilingProvider initialTiles={initialTiles}>{children}</TilingProvider>
  );
}

const KEY = "fiftyone.tiling.layout.ds-test";

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe("useTilingLayoutPersistence", () => {
  it("persists the initial layout on mount", () => {
    renderHook(() => useTilingLayoutPersistence("ds-test"), {
      wrapper: makeWrapper(),
    });
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("updates localStorage when the layout changes", () => {
    const { result } = renderHook(
      () => {
        useTilingLayoutPersistence("ds-test");
        return useTiling();
      },
      { wrapper: makeWrapper() }
    );

    act(() => {
      result.current.setLayout("camera-1");
    });

    expect(localStorage.getItem(KEY)).toBe(JSON.stringify("camera-1"));
  });

  it("removes the key when layout is set to null", () => {
    const { result } = renderHook(
      () => {
        useTilingLayoutPersistence("ds-test");
        return useTiling();
      },
      { wrapper: makeWrapper() }
    );

    // Verify something was written first.
    expect(localStorage.getItem(KEY)).not.toBeNull();

    act(() => {
      result.current.setLayout(null);
    });

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("does not write to localStorage when datasetId is undefined", () => {
    renderHook(() => useTilingLayoutPersistence(undefined), {
      wrapper: makeWrapper(),
    });
    expect(localStorage.length).toBe(0);
  });

  it("writes under the new key when datasetId changes", () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | undefined }) => useTilingLayoutPersistence(id),
      {
        initialProps: { id: "ds-one" as string | undefined },
        wrapper: makeWrapper(),
      }
    );

    expect(localStorage.getItem("fiftyone.tiling.layout.ds-one")).not.toBeNull();

    rerender({ id: "ds-two" });

    expect(localStorage.getItem("fiftyone.tiling.layout.ds-two")).not.toBeNull();
  });
});
