import { act, cleanup, renderHook } from "@testing-library/react";
import { IconName } from "@voxel51/voodo";
import { Provider as JotaiProvider, createStore } from "jotai";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TilingProvider } from "./TilingProvider";
import type { RegisteredTile } from "./types";
import { useRegisteredTiles } from "./use-registered-tiles";
import { useTileRegistry } from "./use-tile-registry";

// Each test gets its own Jotai store so `registeredTilesAtom` resets
// between cases. TilingProvider itself currently shares the default
// store, so without explicit isolation, registrations leak.
const makeWrapper = (): React.FC<{ children: React.ReactNode }> => {
  const store = createStore();
  return ({ children }) => (
    <JotaiProvider store={store}>
      <TilingProvider>{children}</TilingProvider>
    </JotaiProvider>
  );
};

const DummyTile: React.FC = () => null;

const makeEntry = (
  type: string,
  typeLabel = type.charAt(0).toUpperCase() + type.slice(1)
): RegisteredTile => ({
  type,
  typeLabel,
  icon: IconName.GridView,
  Tile: DummyTile,
});

describe("useTileRegistry", () => {
  afterEach(() => cleanup());

  it("adds an entry to registeredTiles", () => {
    const { result } = renderHook(
      () => ({
        registry: useTileRegistry(),
        tiles: useRegisteredTiles(),
      }),
      { wrapper: makeWrapper() }
    );
    expect(result.current.tiles).toEqual([]);

    act(() => {
      result.current.registry.registerTile(makeEntry("camera"));
    });
    expect(result.current.tiles).toHaveLength(1);
    expect(result.current.tiles[0].type).toBe("camera");
  });

  it("replaces an existing entry with the same type rather than duplicating", () => {
    const { result } = renderHook(
      () => ({ registry: useTileRegistry(), tiles: useRegisteredTiles() }),
      { wrapper: makeWrapper() }
    );
    act(() => {
      result.current.registry.registerTile(makeEntry("camera", "Old label"));
      result.current.registry.registerTile(makeEntry("camera", "New label"));
    });
    expect(result.current.tiles).toHaveLength(1);
    expect(result.current.tiles[0].typeLabel).toBe("New label");
  });

  it("returns a disposer that removes the entry", () => {
    const { result } = renderHook(
      () => ({ registry: useTileRegistry(), tiles: useRegisteredTiles() }),
      { wrapper: makeWrapper() }
    );
    let dispose = () => {};
    act(() => {
      dispose = result.current.registry.registerTile(makeEntry("camera"));
    });
    expect(result.current.tiles).toHaveLength(1);
    act(() => {
      dispose();
    });
    expect(result.current.tiles).toEqual([]);
  });

  it("supports multiple distinct types", () => {
    const { result } = renderHook(
      () => ({ registry: useTileRegistry(), tiles: useRegisteredTiles() }),
      { wrapper: makeWrapper() }
    );
    act(() => {
      result.current.registry.registerTile(makeEntry("camera"));
      result.current.registry.registerTile(makeEntry("lidar"));
      result.current.registry.registerTile(makeEntry("graph"));
    });
    expect(result.current.tiles.map((t) => t.type)).toEqual([
      "camera",
      "lidar",
      "graph",
    ]);
  });
});
