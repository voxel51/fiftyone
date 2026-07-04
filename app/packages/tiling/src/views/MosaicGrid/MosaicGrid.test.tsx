import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TilingProvider } from "../../lib/TilingProvider";
import MosaicGrid, {
  addTileToLayout,
  autoLayout,
  collectTileIds,
} from "./MosaicGrid";

// Tile windows read tile state (titles) through the tiling context.
function renderGrid(grid: React.ReactElement) {
  return render(<TilingProvider>{grid}</TilingProvider>);
}

describe("MosaicGrid pure helpers", () => {
  describe("autoLayout", () => {
    it("returns null for an empty id list", () => {
      expect(autoLayout([])).toBeNull();
    });

    it("returns the single id directly when only one tile is present", () => {
      expect(autoLayout(["a"])).toBe("a");
    });

    it("produces a row-rooted balanced tree for two tiles", () => {
      expect(autoLayout(["a", "b"])).toEqual({
        direction: "row",
        first: "a",
        second: "b",
        splitPercentage: 50,
      });
    });

    it("alternates direction at each level", () => {
      const layout = autoLayout(["a", "b", "c", "d"]);
      // 4 tiles → row of two columns of one tile each.
      expect(layout).toEqual({
        direction: "row",
        first: {
          direction: "column",
          first: "a",
          second: "b",
          splitPercentage: 50,
        },
        second: {
          direction: "column",
          first: "c",
          second: "d",
          splitPercentage: 50,
        },
        splitPercentage: 50,
      });
    });
  });

  describe("collectTileIds", () => {
    it("returns an empty list for null", () => {
      expect(collectTileIds(null)).toEqual([]);
    });

    it("walks the layout tree in left-to-right order", () => {
      expect(collectTileIds(autoLayout(["a", "b", "c", "d"]))).toEqual([
        "a",
        "b",
        "c",
        "d",
      ]);
    });
  });

  describe("addTileToLayout", () => {
    it("returns the new id as the root when the layout was empty", () => {
      expect(addTileToLayout(null, "a")).toBe("a");
    });

    it("splits the targeted tile 50/50 with the new id as second", () => {
      expect(addTileToLayout("a", "b", "a")).toEqual({
        direction: "row",
        first: "a",
        second: "b",
        splitPercentage: 50,
      });
    });

    it("falls back to splitting the largest leaf when the target id is unknown", () => {
      const layout = autoLayout(["a", "b", "c"])!;
      const next = addTileToLayout(layout, "d", "ghost");
      expect(collectTileIds(next).sort()).toEqual(["a", "b", "c", "d"]);
    });

    it("throws when the new id already exists in the layout", () => {
      expect(() => addTileToLayout("a", "a")).toThrow(
        'Tile id "a" already exists in layout',
      );
    });

    it("honors an explicit direction over the aspect-ratio heuristic", () => {
      // A single full-canvas leaf is square-ish, so the heuristic would
      // pick "row"; the forced direction must win.
      expect(addTileToLayout("a", "b", "a", "column")).toEqual({
        direction: "column",
        first: "a",
        second: "b",
        splitPercentage: 50,
      });

      // And the reverse: a leaf inside a row split is taller than wide
      // (heuristic → "column"), so forcing "row" must override it.
      const tall = addTileToLayout(
        { direction: "row", first: "a", second: "b", splitPercentage: 50 },
        "c",
        "b",
        "row",
      );
      expect(tall).toEqual({
        direction: "row",
        first: "a",
        second: {
          direction: "row",
          first: "b",
          second: "c",
          splitPercentage: 50,
        },
        splitPercentage: 50,
      });
    });
  });
});

describe("MosaicGrid component", () => {
  afterEach(() => cleanup());

  it("renders the zero state when value is null", () => {
    render(<MosaicGrid tiles={{}} value={null} onChange={() => {}} />);
    expect(screen.getByTestId("mosaic-grid")).toBeTruthy();
    expect(screen.getByTestId("mosaic-grid-empty").textContent).toBe(
      "No tiles open",
    );
  });

  it("renders a custom zero state when zeroStateView is provided", () => {
    render(
      <MosaicGrid
        tiles={{}}
        value={null}
        onChange={() => {}}
        zeroStateView={<button type="button">spawn something</button>}
      />,
    );
    expect(screen.getByText("spawn something")).toBeTruthy();
    expect(screen.queryByText("No tiles open")).toBeNull();
  });

  describe("tile actions", () => {
    const tiles = {
      "cam-1": { title: "CAM_FRONT", render: () => <div /> },
    };

    it("fires onSplitTile from the header split buttons", () => {
      const onSplitTile = vi.fn();
      renderGrid(
        <MosaicGrid
          tiles={tiles}
          value="cam-1"
          onChange={() => {}}
          onSplitTile={onSplitTile}
        />,
      );
      fireEvent.click(screen.getByTestId("tile-header-split-right"));
      expect(onSplitTile).toHaveBeenCalledWith("cam-1", "row");
      fireEvent.click(screen.getByTestId("tile-header-split-down"));
      expect(onSplitTile).toHaveBeenCalledWith("cam-1", "column");
    });

    it("hides the split buttons when onSplitTile is not wired", () => {
      renderGrid(
        <MosaicGrid tiles={tiles} value="cam-1" onChange={() => {}} />,
      );
      expect(screen.queryByTestId("tile-header-split-right")).toBeNull();
      expect(screen.queryByTestId("tile-header-split-down")).toBeNull();
    });

    it("offers duplicate and close-others in the header context menu", () => {
      const onDuplicateTile = vi.fn();
      const onCloseOtherTiles = vi.fn();
      renderGrid(
        <MosaicGrid
          tiles={tiles}
          value="cam-1"
          onChange={() => {}}
          onDuplicateTile={onDuplicateTile}
          onCloseOtherTiles={onCloseOtherTiles}
        />,
      );

      fireEvent.contextMenu(screen.getByTestId("tile-header"));
      fireEvent.click(screen.getByText("Duplicate"));
      expect(onDuplicateTile).toHaveBeenCalledWith("cam-1");

      // The menu dismisses on selection; reopen for the next action.
      fireEvent.contextMenu(screen.getByTestId("tile-header"));
      fireEvent.click(screen.getByText("Close others"));
      expect(onCloseOtherTiles).toHaveBeenCalledWith("cam-1");
    });

    it("omits spawn items from the context menu when handlers are absent", () => {
      renderGrid(
        <MosaicGrid tiles={tiles} value="cam-1" onChange={() => {}} />,
      );
      fireEvent.contextMenu(screen.getByTestId("tile-header"));
      expect(screen.queryByText("Duplicate")).toBeNull();
      expect(screen.queryByText("Split right")).toBeNull();
      expect(screen.queryByText("Close others")).toBeNull();
      // The window-state actions are always offered.
      expect(screen.getByText("Fullscreen")).toBeTruthy();
      expect(screen.getByText("Close")).toBeTruthy();
    });

    it("selects the tile when the header itself is clicked", () => {
      const onFocusTile = vi.fn();
      renderGrid(
        <MosaicGrid
          tiles={tiles}
          value="cam-1"
          onChange={() => {}}
          onFocusTile={onFocusTile}
        />,
      );
      fireEvent.click(screen.getByTestId("tile-header"));
      expect(onFocusTile).toHaveBeenCalledWith("cam-1", "select");
    });

    it("does not double-fire a select when a header button is clicked", () => {
      const onFocusTile = vi.fn();
      renderGrid(
        <MosaicGrid
          tiles={tiles}
          value="cam-1"
          onChange={() => {}}
          onFocusTile={onFocusTile}
        />,
      );
      // Fullscreen focuses through its action callback; the bubbling
      // click must not ALSO count as a header select (that would toggle
      // an already-focused tile back off).
      fireEvent.click(screen.getByTestId("tile-header-fullscreen"));
      expect(onFocusTile).toHaveBeenCalledWith("cam-1", "action");
      expect(onFocusTile).not.toHaveBeenCalledWith("cam-1", "select");
    });

    it("focuses the tile with action semantics on right-click", () => {
      const onFocusTile = vi.fn();
      renderGrid(
        <MosaicGrid
          tiles={tiles}
          value="cam-1"
          onChange={() => {}}
          onFocusTile={onFocusTile}
        />,
      );
      fireEvent.contextMenu(screen.getByTestId("tile-header"));
      expect(onFocusTile).toHaveBeenCalledWith("cam-1", "action");
      expect(onFocusTile).not.toHaveBeenCalledWith("cam-1", "select");
    });
  });
});
