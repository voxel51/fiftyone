import { describe, expect, it } from "vitest";
import { foreignSelectionIds } from "./foreignSelection";

const MAP_LASSO = {
  selection: ["a", "b"],
  spatialSelection: { polygon: [[0, 0]], field: "location" },
  scope: "@fiftyone/map",
};

describe("foreignSelectionIds", () => {
  it("passes another panel's selected ids through", () => {
    expect(foreignSelectionIds(MAP_LASSO, null)).toEqual(["a", "b"]);
  });

  it("yields to this panel's own stage, as the grid does", () => {
    const ownStage = {
      "fiftyone.core.stages.Select": { sample_ids: ["c"], ordered: false },
    };
    expect(foreignSelectionIds(MAP_LASSO, ownStage)).toBeNull();
  });

  it("treats an empty selection as none", () => {
    // The similarity popover writes an empty list on every search; as a
    // selection it would dim every point
    expect(foreignSelectionIds({ selection: [] }, null)).toBeNull();
  });

  it("treats the atom's default as none", () => {
    expect(foreignSelectionIds({ selection: null }, null)).toBeNull();
    expect(foreignSelectionIds(null, null)).toBeNull();
    expect(foreignSelectionIds(undefined, null)).toBeNull();
  });
});
