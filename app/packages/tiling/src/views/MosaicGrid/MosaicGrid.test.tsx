import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MosaicGrid, {
  addTileToLayout,
  autoLayout,
  collectTileIds,
} from "./MosaicGrid";

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
        first: { direction: "column", first: "a", second: "b", splitPercentage: 50 },
        second: { direction: "column", first: "c", second: "d", splitPercentage: 50 },
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
        'Tile id "a" already exists in layout'
      );
    });
  });
});

describe("MosaicGrid component", () => {
  afterEach(() => cleanup());

  it("renders the zero state when value is null", () => {
    render(<MosaicGrid tiles={{}} value={null} onChange={() => {}} />);
    expect(screen.getByTestId("mosaic-grid")).toBeTruthy();
    expect(screen.getByTestId("mosaic-grid-empty").textContent).toBe(
      "No tiles open"
    );
  });
});
