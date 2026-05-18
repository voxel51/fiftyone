import { act, cleanup, renderHook } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TilingProvider } from "./TilingProvider";
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

const makeEntry = (streamId: string, type = "camera", title = streamId) => ({
  streamId,
  type,
  typeLabel: type.charAt(0).toUpperCase() + type.slice(1),
  title,
  icon: "icon",
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
      result.current.registry.registerTile(makeEntry("camera_front"));
    });
    expect(result.current.tiles).toHaveLength(1);
    expect(result.current.tiles[0].streamId).toBe("camera_front");
  });

  it("replaces an existing entry with the same streamId rather than duplicating", () => {
    const { result } = renderHook(
      () => ({ registry: useTileRegistry(), tiles: useRegisteredTiles() }),
      { wrapper: makeWrapper() }
    );
    act(() => {
      result.current.registry.registerTile(
        makeEntry("camera_front", "camera", "Old title")
      );
      result.current.registry.registerTile(
        makeEntry("camera_front", "camera", "New title")
      );
    });
    expect(result.current.tiles).toHaveLength(1);
    expect(result.current.tiles[0].title).toBe("New title");
  });

  it("returns a disposer that removes the entry", () => {
    const { result } = renderHook(
      () => ({ registry: useTileRegistry(), tiles: useRegisteredTiles() }),
      { wrapper: makeWrapper() }
    );
    let dispose = () => {};
    act(() => {
      dispose = result.current.registry.registerTile(makeEntry("camera_front"));
    });
    expect(result.current.tiles).toHaveLength(1);
    act(() => {
      dispose();
    });
    expect(result.current.tiles).toEqual([]);
  });

  it("supports multiple distinct streamIds", () => {
    const { result } = renderHook(
      () => ({ registry: useTileRegistry(), tiles: useRegisteredTiles() }),
      { wrapper: makeWrapper() }
    );
    act(() => {
      result.current.registry.registerTile(makeEntry("a"));
      result.current.registry.registerTile(makeEntry("b"));
      result.current.registry.registerTile(makeEntry("c"));
    });
    expect(result.current.tiles.map((t) => t.streamId)).toEqual(["a", "b", "c"]);
  });
});
