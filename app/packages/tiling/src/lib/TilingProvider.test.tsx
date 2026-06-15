import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TileIdScope,
  TileSettingsContent,
  TilingProvider,
  TilingTile,
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
      expect(Object.keys(result.current.tiles)).toEqual([
        "camera-1",
        "lidar-1",
      ]);
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
        secondId = result.current.addTile(makeTile("b"), {
          idPrefix: "camera",
        });
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

  describe("initialLayout prop", () => {
    it("uses the provided initialLayout instead of auto-laying out", () => {
      const initialTiles = {
        "a-1": makeTile("a"),
        "b-1": makeTile("b"),
      };
      const explicitLayout = "a-1";
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <TilingProvider
            initialTiles={initialTiles}
            initialLayout={explicitLayout}
          >
            {children}
          </TilingProvider>
        ),
      });
      expect(result.current.layout).toBe("a-1");
    });
  });

  describe("setTileTitle", () => {
    it("updates the title of a registered tile", () => {
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={{ "cam-1": makeTile("Camera") }}>
            {children}
          </Wrapper>
        ),
      });
      act(() => {
        result.current.setTileTitle("cam-1", "Front Camera");
      });
      expect(result.current.tiles["cam-1"].title).toBe("Front Camera");
    });

    it("is a no-op when the title is unchanged", () => {
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={{ "cam-1": makeTile("Camera") }}>
            {children}
          </Wrapper>
        ),
      });
      const before = result.current.tiles["cam-1"];
      act(() => {
        result.current.setTileTitle("cam-1", "Camera");
      });
      // Reference-equal — no re-render triggered.
      expect(result.current.tiles["cam-1"]).toBe(before);
    });
  });

  describe("TileSettingsContent", () => {
    it("does not bubble sidebar portal clicks back to the tile body", () => {
      const onPanePointerDown = vi.fn();
      render(
        <TilingProvider
          initialTiles={{
            "tile-1": makeTile("tile"),
          }}
        >
          <SettingsPortalHarness onPanePointerDown={onPanePointerDown} />
        </TilingProvider>
      );

      fireEvent.click(screen.getByTestId("focus-tile"));
      fireEvent.pointerDown(screen.getByTestId("settings-button"));

      expect(onPanePointerDown).not.toHaveBeenCalled();
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

    it("collapses the split when removing the second of two tiles", () => {
      // Removing "b-1" from {row, "a-1", "b-1"} should collapse to just "a-1".
      const initialTiles = { "a-1": makeTile("a"), "b-1": makeTile("b") };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      act(() => {
        result.current.removeTile("b-1");
      });
      expect(result.current.layout).toBe("a-1");
      expect(result.current.tiles["b-1"]).toBeUndefined();
    });

    it("preserves the sibling subtree when removing a leaf from a deeper split", () => {
      // 3-tile layout: {row, "a-1", {col, "b-1", "c-1"}}
      // Removing "c-1" → {row, "a-1", "b-1"} — both children survive so the
      // root split node is reconstructed (not collapsed).
      const initialTiles = {
        "a-1": makeTile("a"),
        "b-1": makeTile("b"),
        "c-1": makeTile("c"),
      };
      const { result } = renderHook(() => useTiling(), {
        wrapper: ({ children }) => (
          <Wrapper initialTiles={initialTiles}>{children}</Wrapper>
        ),
      });
      act(() => {
        result.current.removeTile("c-1");
      });
      expect(result.current.tiles["c-1"]).toBeUndefined();
      expect(result.current.tiles["a-1"]).toBeDefined();
      expect(result.current.tiles["b-1"]).toBeDefined();
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

  describe("useTiling guard", () => {
    it("throws when called outside a TilingProvider", () => {
      const consoleError = console.error;
      console.error = () => {};
      expect(() => renderHook(() => useTiling())).toThrow(
        "useTiling must be used inside <TilingProvider>"
      );
      console.error = consoleError;
    });
  });

  describe("settings portal", () => {
    function Host({ initialFocus }: { initialFocus?: string }) {
      const tiling = useTiling();
      // Bind the slot DOM element on mount so TileSettingsContent
      // has somewhere to portal into.
      React.useEffect(() => {
        if (initialFocus) tiling.setFocusedTileId(initialFocus);
      }, [tiling, initialFocus]);
      return (
        <>
          <div data-testid="slot" ref={tiling.setSettingsSlotEl} />
          <TileIdScope tileId="cam-1">
            <TileSettingsContent>
              <span data-testid="cam-settings">cam</span>
            </TileSettingsContent>
          </TileIdScope>
          <TileIdScope tileId="lid-1">
            <TileSettingsContent>
              <span data-testid="lid-settings">lid</span>
            </TileSettingsContent>
          </TileIdScope>
          <button
            data-testid="focus-cam"
            onClick={() => tiling.setFocusedTileId("cam-1")}
          />
          <button
            data-testid="focus-lid"
            onClick={() => tiling.setFocusedTileId("lid-1")}
          />
        </>
      );
    }

    it("does not portal anything when no tile is focused", () => {
      const utils = render(
        <TilingProvider>
          <Host />
        </TilingProvider>
      );
      expect(utils.queryByTestId("cam-settings")).toBeNull();
      expect(utils.queryByTestId("lid-settings")).toBeNull();
    });

    it("portals the focused tile's settings into the slot", () => {
      const utils = render(
        <TilingProvider initialTiles={{ "cam-1": makeTile("cam") }}>
          <Host />
        </TilingProvider>
      );
      act(() => {
        utils.getByTestId("focus-cam").click();
      });
      expect(
        utils.getByTestId("slot").contains(utils.getByTestId("cam-settings"))
      ).toBe(true);
      expect(utils.queryByTestId("lid-settings")).toBeNull();
    });

    it("swapping focus swaps which settings render in the slot", () => {
      const utils = render(
        <TilingProvider
          initialTiles={{
            "cam-1": makeTile("cam"),
            "lid-1": makeTile("lid"),
          }}
        >
          <Host />
        </TilingProvider>
      );
      act(() => utils.getByTestId("focus-cam").click());
      expect(utils.queryByTestId("cam-settings")).not.toBeNull();
      expect(utils.queryByTestId("lid-settings")).toBeNull();

      act(() => utils.getByTestId("focus-lid").click());
      expect(utils.queryByTestId("cam-settings")).toBeNull();
      expect(utils.queryByTestId("lid-settings")).not.toBeNull();
    });
  });
});

function SettingsPortalHarness({
  onPanePointerDown,
}: {
  readonly onPanePointerDown: () => void;
}) {
  const { setFocusedTileId, setSettingsSlotEl } = useTiling();

  return (
    <>
      <button
        data-testid="focus-tile"
        onClick={() => setFocusedTileId("tile-1")}
      >
        focus
      </button>
      <div data-testid="settings-slot" ref={setSettingsSlotEl} />
      <TileIdScope tileId="tile-1">
        <div data-testid="tile-body" onPointerDown={onPanePointerDown}>
          <TileSettingsContent>
            <button data-testid="settings-button">settings</button>
          </TileSettingsContent>
        </div>
      </TileIdScope>
    </>
  );
}
