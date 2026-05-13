import { act, cleanup, render, renderHook } from "@testing-library/react";
import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  TilingProvider,
  TilingTile,
  TileIdScope,
  useTileSettings,
  useTiling,
} from "./TilingProvider";

const makeTile = (title: string): TilingTile => ({
  title,
  render: () => null,
});

function Wrapper({
  initialTiles = {},
  children,
}: {
  initialTiles?: Record<string, TilingTile>;
  children: React.ReactNode;
}) {
  return (
    <TilingProvider initialTiles={initialTiles}>{children}</TilingProvider>
  );
}

describe("TilingProvider", () => {
  afterEach(() => cleanup());

  describe("initial state", () => {
    it("renders with no tiles when initialTiles is empty", () => {
      const { result } = renderHook(() => useTiling(), { wrapper: Wrapper });
      expect(result.current.tiles).toEqual({});
      expect(result.current.layout).toBeNull();
      expect(result.current.focusedTileId).toBeNull();
    });

    it("renders with the provided initial tile entries", () => {
      const initialTiles = {
        "camera-1": makeTile("camera"),
        "lidar-1": makeTile("lidar"),
      };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      expect(Object.keys(result.current.tiles)).toEqual(["camera-1", "lidar-1"]);
    });

    it("auto-lays out the initial tiles when no initialLayout is provided", () => {
      const initialTiles = {
        "camera-1": makeTile("camera"),
        "lidar-1": makeTile("lidar"),
      };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      expect(result.current.layout).not.toBeNull();
    });
  });

  describe("addTile / id counter", () => {
    it("generates ids using the given prefix and a monotonic counter", () => {
      const { result } = renderHook(() => useTiling(), { wrapper: Wrapper });
      let firstId = "";
      let secondId = "";
      act(() => {
        firstId = result.current.addTile(makeTile("a"), { idPrefix: "camera" });
      });
      act(() => {
        secondId = result.current.addTile(makeTile("b"), { idPrefix: "camera" });
      });
      expect(firstId).toBe("camera-1");
      expect(secondId).toBe("camera-2");
    });

    it("seeds the counter past existing -<n> suffixes in initialTiles", () => {
      const initialTiles = {
        "camera-1": makeTile("camera"),
        "lidar-1": makeTile("lidar"),
      };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      let id = "";
      act(() => {
        id = result.current.addTile(makeTile("new"), { idPrefix: "camera" });
      });
      // Counter starts at max(1) + 1 = 2 → first add is "camera-2".
      expect(id).toBe("camera-2");
    });

    it("seeds against ANY prefix's largest suffix, since the counter is shared", () => {
      const initialTiles = {
        "camera-7": makeTile("camera"),
        "lidar-2": makeTile("lidar"),
      };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      let id = "";
      act(() => {
        id = result.current.addTile(makeTile("new"), { idPrefix: "lidar" });
      });
      // max(7, 2) + 1 = 8 → first added lidar gets "lidar-8" (counter is shared).
      expect(id).toBe("lidar-8");
    });

    it("defaults the prefix to 'tile' when none is provided", () => {
      const { result } = renderHook(() => useTiling(), { wrapper: Wrapper });
      let id = "";
      act(() => {
        id = result.current.addTile(makeTile("anon"));
      });
      expect(id).toBe("tile-1");
    });

    it("focuses the new tile by default", () => {
      const { result } = renderHook(() => useTiling(), { wrapper: Wrapper });
      let id = "";
      act(() => {
        id = result.current.addTile(makeTile("a"), { idPrefix: "x" });
      });
      expect(result.current.focusedTileId).toBe(id);
    });

    it("does not focus the new tile when focus is false", () => {
      const { result } = renderHook(() => useTiling(), { wrapper: Wrapper });
      act(() => {
        result.current.addTile(makeTile("a"), { idPrefix: "x", focus: false });
      });
      expect(result.current.focusedTileId).toBeNull();
    });

    it("inserts the new tile entry into the tiles map", () => {
      const { result } = renderHook(() => useTiling(), { wrapper: Wrapper });
      let id = "";
      act(() => {
        id = result.current.addTile(makeTile("camera"), { idPrefix: "camera" });
      });
      expect(result.current.tiles[id]).toBeDefined();
      expect(result.current.tiles[id].title).toBe("camera");
    });
  });

  describe("removeTile", () => {
    it("drops the tile from the tiles map and the layout", () => {
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={{ "camera-1": makeTile("a") }}>
            {children}
          </Wrapper>
        ),
      });
      act(() => {
        result.current.removeTile("camera-1");
      });
      expect(result.current.tiles).toEqual({});
      expect(result.current.layout).toBeNull();
    });

    it("clears focus when the focused tile is removed", () => {
      const initialTiles = { "a-1": makeTile("a"), "b-1": makeTile("b") };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      act(() => {
        result.current.setFocusedTileId("a-1");
      });
      act(() => {
        result.current.removeTile("a-1");
      });
      expect(result.current.focusedTileId).toBeNull();
    });

    it("keeps focus on an unrelated tile when a different tile is removed", () => {
      const initialTiles = { "a-1": makeTile("a"), "b-1": makeTile("b") };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      act(() => {
        result.current.setFocusedTileId("b-1");
      });
      act(() => {
        result.current.removeTile("a-1");
      });
      expect(result.current.focusedTileId).toBe("b-1");
    });

    it("is a no-op when removing an unknown id", () => {
      const initialTiles = { "a-1": makeTile("a") };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      act(() => {
        result.current.removeTile("does-not-exist");
      });
      expect(result.current.tiles["a-1"]).toBeDefined();
    });
  });

  describe("setLayout reconciliation", () => {
    it("drops tile entries that are no longer in the layout tree", () => {
      const initialTiles = { "a-1": makeTile("a"), "b-1": makeTile("b") };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      // Replace layout with only "b-1" — "a-1" should be reaped.
      act(() => {
        result.current.setLayout("b-1");
      });
      expect(result.current.tiles).toEqual({ "b-1": initialTiles["b-1"] });
    });

    it("clears focus if the focused tile was orphaned by the new layout", () => {
      const initialTiles = { "a-1": makeTile("a"), "b-1": makeTile("b") };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      act(() => {
        result.current.setFocusedTileId("a-1");
      });
      act(() => {
        result.current.setLayout("b-1");
      });
      expect(result.current.focusedTileId).toBeNull();
    });
  });

  describe("autoLayout", () => {
    it("preserves the tile set after rebuilding the layout tree", () => {
      const initialTiles = { "a-1": makeTile("a"), "b-1": makeTile("b") };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      act(() => {
        result.current.autoLayout();
      });
      expect(result.current.tiles).toEqual(initialTiles);
      expect(result.current.layout).not.toBeNull();
    });
  });

  describe("settings registry", () => {
    function Camera() {
      return <span data-testid="camera-settings">camera-settings</span>;
    }
    function Lidar() {
      return <span data-testid="lidar-settings">lidar-settings</span>;
    }

    it("exposes nothing when no tile is focused", () => {
      const { result } = renderHook(() => useTiling(), { wrapper: Wrapper });
      expect(result.current.FocusedTileSettings).toBeNull();
    });

    it("returns the settings component for the focused tile", () => {
      function TilePanel() {
        useTileSettings(Camera);
        return null;
      }

      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={{ "cam-1": makeTile("cam") }}>
            <TileIdScope tileId="cam-1">
              <TilePanel />
            </TileIdScope>
            {children}
          </Wrapper>
        ),
      });

      act(() => {
        result.current.setFocusedTileId("cam-1");
      });
      expect(result.current.FocusedTileSettings).toBe(Camera);
    });

    it("clears its entry when the panel unmounts (effect cleanup runs)", () => {
      function TilePanel() {
        useTileSettings(Camera);
        return null;
      }

      // Render a stateful wrapper that can toggle the panel on/off so
      // we can verify the cleanup function deregisters the settings.
      let setShow!: (v: boolean) => void;
      function Host() {
        const [show, set] = useState(true);
        setShow = set;
        const tiling = useTiling();
        return (
          <>
            {show ? (
              <TileIdScope tileId="cam-1">
                <TilePanel />
              </TileIdScope>
            ) : null}
            <button
              data-testid="focus"
              onClick={() => tiling.setFocusedTileId("cam-1")}
            />
            <span data-testid="settings">
              {tiling.FocusedTileSettings ? "yes" : "no"}
            </span>
          </>
        );
      }

      const utils = render(
        <TilingProvider initialTiles={{ "cam-1": makeTile("cam") }}>
          <Host />
        </TilingProvider>
      );
      // Focus the tile — settings should resolve to "yes".
      act(() => {
        utils.getByTestId("focus").click();
      });
      expect(utils.getByTestId("settings").textContent).toBe("yes");

      // Unmount the panel — registry should drop the entry.
      act(() => setShow(false));
      expect(utils.getByTestId("settings").textContent).toBe("no");
    });

    it("swapping the registered component replaces the entry", () => {
      let setKind!: (k: "camera" | "lidar") => void;
      function MultiPanel() {
        const [kind, set] = useState<"camera" | "lidar">("camera");
        setKind = set;
        useTileSettings(kind === "camera" ? Camera : Lidar);
        return null;
      }
      function FocusedReader({
        onReady,
      }: {
        onReady: (r: ReturnType<typeof useTiling>) => void;
      }) {
        const t = useTiling();
        onReady(t);
        return null;
      }

      let api: ReturnType<typeof useTiling> | null = null;
      render(
        <TilingProvider initialTiles={{ "cam-1": makeTile("cam") }}>
          <TileIdScope tileId="cam-1">
            <MultiPanel />
          </TileIdScope>
          <FocusedReader onReady={(r) => (api = r)} />
        </TilingProvider>
      );

      act(() => api!.setFocusedTileId("cam-1"));
      expect(api!.FocusedTileSettings).toBe(Camera);

      act(() => setKind("lidar"));
      expect(api!.FocusedTileSettings).toBe(Lidar);
    });
  });
});
