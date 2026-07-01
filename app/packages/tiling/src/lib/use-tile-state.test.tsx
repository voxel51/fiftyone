import { act, cleanup, renderHook } from "@testing-library/react";
import { IconName } from "@voxel51/voodo";
import { Provider as JotaiProvider, createStore } from "jotai";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TileIdScope, TilingProvider } from "./TilingProvider";
import type { RegisteredTile } from "./types";
import { useTileRegistry } from "./use-tile-registry";
import {
  useSetTileSelection,
  useSetTileTitle,
  useTileSelection,
  useTileSelectionFor,
  useTileTitle,
  useTileTitleFor,
  useTileTypes,
} from "./use-tile-state";

// TilingProvider currently shares the default Jotai store, so each test
// needs its own store to avoid leaking atom values between cases.
const wrap = (tileId: string) => {
  const store = createStore();
  return ({ children }: { children: React.ReactNode }) => (
    <JotaiProvider store={store}>
      <TilingProvider>
        <TileIdScope tileId={tileId}>{children}</TileIdScope>
      </TilingProvider>
    </JotaiProvider>
  );
};

const makePlainWrap = () => {
  const store = createStore();
  return ({ children }: { children: React.ReactNode }) => (
    <JotaiProvider store={store}>
      <TilingProvider>{children}</TilingProvider>
    </JotaiProvider>
  );
};

const DummyTile: React.FC = () => null;

const makeEntry = (type: string): RegisteredTile => ({
  type,
  typeLabel: type.charAt(0).toUpperCase() + type.slice(1),
  icon: IconName.GridView,
  Tile: DummyTile,
});

describe("useTileSelection / useTileSelectionFor / useSetTileSelection", () => {
  afterEach(() => cleanup());

  it("returns null when nothing has been selected", () => {
    const { result } = renderHook(() => useTileSelection<unknown>(), {
      wrapper: wrap("graph-1"),
    });
    expect(result.current).toBeNull();
  });

  it("writes from useSetTileSelection are visible via useTileSelection (scoped)", () => {
    const { result } = renderHook(
      () => ({
        value: useTileSelection<{ x: number }>(),
        set: useSetTileSelection(),
      }),
      { wrapper: wrap("graph-1") },
    );
    act(() => {
      result.current.set({ x: 7 });
    });
    expect(result.current.value).toEqual({ x: 7 });
  });

  it("useTileSelectionFor reads the selection for an explicit id", () => {
    function Probe({
      onReady,
    }: {
      onReady: (set: (v: unknown) => void) => void;
    }) {
      const set = useSetTileSelection();
      React.useEffect(() => onReady(set), [onReady, set]);
      return null;
    }
    let capturedSet: (v: unknown) => void = () => {};
    const store = createStore();
    const { result } = renderHook(
      () => useTileSelectionFor<{ y: string }>("graph-2"),
      {
        wrapper: ({ children }) => (
          <JotaiProvider store={store}>
            <TilingProvider>
              <TileIdScope tileId="graph-2">
                <Probe onReady={(s) => (capturedSet = s)} />
              </TileIdScope>
              {children}
            </TilingProvider>
          </JotaiProvider>
        ),
      },
    );
    expect(result.current).toBeNull();
    act(() => {
      capturedSet({ y: "hello" });
    });
    expect(result.current).toEqual({ y: "hello" });
  });

  it("returns null for useTileSelectionFor when the id is null", () => {
    const { result } = renderHook(() => useTileSelectionFor(null), {
      wrapper: makePlainWrap(),
    });
    expect(result.current).toBeNull();
  });
});

describe("useTileTitle / useTileTitleFor / useSetTileTitle", () => {
  afterEach(() => cleanup());

  it("useTileTitle returns null when outside a TileIdScope", () => {
    const { result } = renderHook(() => ({ title: useTileTitle() }), {
      wrapper: makePlainWrap(),
    });
    expect(result.current.title).toBeNull();
  });

  it("useTileTitle returns the tile's current title when scoped", () => {
    const store = createStore();
    const { result } = renderHook(() => ({ title: useTileTitle() }), {
      wrapper: ({ children }) => (
        <JotaiProvider store={store}>
          <TilingProvider
            initialTiles={{ "cam-1": { title: "Camera", render: () => null } }}
          >
            <TileIdScope tileId="cam-1">{children}</TileIdScope>
          </TilingProvider>
        </JotaiProvider>
      ),
    });
    expect(result.current.title).toBe("Camera");
  });

  it("useTileTitleFor returns null for a null tileId", () => {
    const { result } = renderHook(() => ({ title: useTileTitleFor(null) }), {
      wrapper: makePlainWrap(),
    });
    expect(result.current.title).toBeNull();
  });

  it("useTileTitleFor returns the title for an explicit tileId", () => {
    const store = createStore();
    const { result } = renderHook(() => ({ title: useTileTitleFor("cam-1") }), {
      wrapper: ({ children }) => (
        <JotaiProvider store={store}>
          <TilingProvider
            initialTiles={{ "cam-1": { title: "Camera", render: () => null } }}
          >
            {children}
          </TilingProvider>
        </JotaiProvider>
      ),
    });
    expect(result.current.title).toBe("Camera");
  });

  it("useSetTileTitle updates the tile's title", () => {
    const store = createStore();
    const { result } = renderHook(
      () => ({
        setTitle: useSetTileTitle(),
        title: useTileTitleFor("cam-1"),
      }),
      {
        wrapper: ({ children }) => (
          <JotaiProvider store={store}>
            <TilingProvider
              initialTiles={{
                "cam-1": { title: "Camera", render: () => null },
              }}
            >
              <TileIdScope tileId="cam-1">{children}</TileIdScope>
            </TilingProvider>
          </JotaiProvider>
        ),
      },
    );
    expect(result.current.title).toBe("Camera");
    act(() => {
      result.current.setTitle("Front Camera");
    });
    expect(result.current.title).toBe("Front Camera");
  });

  it("useSetTileTitle is a no-op when called outside a TileIdScope", () => {
    const store = createStore();
    const { result } = renderHook(
      () => ({
        setTitle: useSetTileTitle(),
        title: useTileTitleFor("cam-1"),
      }),
      {
        wrapper: ({ children }) => (
          <JotaiProvider store={store}>
            <TilingProvider
              initialTiles={{
                "cam-1": { title: "Camera", render: () => null },
              }}
            >
              {children}
            </TilingProvider>
          </JotaiProvider>
        ),
      },
    );
    act(() => {
      result.current.setTitle("Should Not Change");
    });
    expect(result.current.title).toBe("Camera");
  });
});

describe("useTileTypes", () => {
  afterEach(() => cleanup());

  function setup() {
    return renderHook(
      () => ({
        registry: useTileRegistry(),
        types: useTileTypes(),
      }),
      { wrapper: makePlainWrap() },
    );
  }

  it("exposes registered tiles in registration order", () => {
    const { result } = setup();
    act(() => {
      result.current.registry.registerTile(makeEntry("lidar"));
      result.current.registry.registerTile(makeEntry("camera"));
    });
    expect(result.current.types.map((t) => t.type)).toEqual([
      "lidar",
      "camera",
    ]);
  });

  it("replacing a type keeps a single entry", () => {
    const { result } = setup();
    act(() => {
      result.current.registry.registerTile(makeEntry("camera"));
      result.current.registry.registerTile(makeEntry("camera"));
      result.current.registry.registerTile(makeEntry("lidar"));
    });
    expect(result.current.types).toHaveLength(2);
    expect(result.current.types.map((t) => t.type)).toEqual([
      "camera",
      "lidar",
    ]);
  });
});
