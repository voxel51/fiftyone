import { act, cleanup, renderHook } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TileIdScope, TilingProvider } from "./TilingProvider";
import { useTileRegistry } from "./use-tile-registry";
import {
  useSetTileSelection,
  useSetTileSource,
  useSetTileSourceFor,
  useTileSelection,
  useTileSelectionFor,
  useTileSource,
  useTileSourcesByType,
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

describe("useTileSource / useSetTileSource", () => {
  afterEach(() => cleanup());

  it("returns null until a source is set", () => {
    const { result } = renderHook(() => useTileSource(), {
      wrapper: wrap("camera-1"),
    });
    expect(result.current).toBeNull();
  });

  it("updates when useSetTileSource writes a new value", () => {
    const { result } = renderHook(
      () => ({ value: useTileSource(), set: useSetTileSource() }),
      { wrapper: wrap("camera-1") }
    );
    act(() => {
      result.current.set("camera_front");
    });
    expect(result.current.value).toBe("camera_front");
    act(() => {
      result.current.set(null);
    });
    expect(result.current.value).toBeNull();
  });
});

describe("useSetTileSourceFor", () => {
  afterEach(() => cleanup());

  it("writes are visible to a scoped useTileSource reader for the same id", () => {
    // Setter probe: captures the setter via a callback ref so the assertion
    // can call it from outside the React tree.
    function SourceWriter({
      onReady,
    }: {
      onReady: (set: (id: string, src: string | null) => void) => void;
    }) {
      const set = useSetTileSourceFor();
      React.useEffect(() => onReady(set), [onReady, set]);
      return null;
    }
    let captured: (id: string, src: string | null) => void = () => {};
    const store = createStore();
    const { result } = renderHook(() => useTileSource(), {
      wrapper: ({ children }) => (
        <JotaiProvider store={store}>
          <TilingProvider>
            <SourceWriter onReady={(s) => (captured = s)} />
            <TileIdScope tileId="lidar-1">{children}</TileIdScope>
          </TilingProvider>
        </JotaiProvider>
      ),
    });
    expect(result.current).toBeNull();
    act(() => {
      captured("lidar-1", "lidar_top");
    });
    expect(result.current).toBe("lidar_top");
  });
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
      { wrapper: wrap("graph-1") }
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
      }
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

describe("useTileTypes / useTileSourcesByType", () => {
  afterEach(() => cleanup());

  function setup() {
    return renderHook(
      () => ({
        registry: useTileRegistry(),
        types: useTileTypes(),
        cameras: useTileSourcesByType("camera"),
        lidars: useTileSourcesByType("lidar"),
      }),
      { wrapper: makePlainWrap() }
    );
  }

  const makeEntry = (streamId: string, type: string) => ({
    streamId,
    type,
    typeLabel: type.charAt(0).toUpperCase() + type.slice(1),
    title: streamId,
    icon: "icon",
    Tile: DummyTile,
  });

  it("dedupes types so each distinct type appears once", () => {
    const { result } = setup();
    act(() => {
      result.current.registry.registerTile(makeEntry("a", "camera"));
      result.current.registry.registerTile(makeEntry("b", "camera"));
      result.current.registry.registerTile(makeEntry("c", "lidar"));
    });
    expect(result.current.types.map((t) => t.type)).toEqual([
      "camera",
      "lidar",
    ]);
  });

  it("preserves registration order in useTileTypes", () => {
    const { result } = setup();
    act(() => {
      result.current.registry.registerTile(makeEntry("c", "lidar"));
      result.current.registry.registerTile(makeEntry("a", "camera"));
    });
    expect(result.current.types.map((t) => t.type)).toEqual([
      "lidar",
      "camera",
    ]);
  });

  it("filters useTileSourcesByType to entries with the matching type", () => {
    const { result } = setup();
    act(() => {
      result.current.registry.registerTile(makeEntry("front", "camera"));
      result.current.registry.registerTile(makeEntry("back", "camera"));
      result.current.registry.registerTile(makeEntry("top", "lidar"));
    });
    expect(result.current.cameras.map((c) => c.streamId)).toEqual([
      "front",
      "back",
    ]);
    expect(result.current.lidars.map((l) => l.streamId)).toEqual(["top"]);
  });
});
