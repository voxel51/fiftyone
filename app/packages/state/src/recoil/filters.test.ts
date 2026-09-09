import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { TestSelectorFamily, setMockAtoms } from "../../../../__mocks__/recoil";
import { activeFilterValues } from "./activeFilterValues";
import * as filters from "./filters";

describe("filter resolves correctly", () => {
  const testModal = <TestSelectorFamily<typeof filters.filter>>(
    (<unknown>filters.filter({ path: "test", modal: true }))
  );

  const testGrid = <TestSelectorFamily<typeof filters.filter>>(
    (<unknown>filters.filter({ path: "test", modal: false }))
  );

  setMockAtoms({
    filters: { test: "grid filters" },
    __modalFilters_selector: { test: "modal filters" },
  });

  it("resolves filter correctly in grid view", () => {
    expect(testGrid()).toBe("grid filters");
  });

  it("resolves filter correctly in modal view", () => {
    expect(testModal()).toBe("modal filters");
  });
});

describe("hasFilter resolves correctly", () => {
  const test = <TestSelectorFamily<typeof filters.hasFilters>>(
    (<unknown>filters.hasFilters(false))
  );
  it("hasFilter resolves correctly when there is filter", () => {
    setMockAtoms({
      filters: { test: "grid filters" },
      __modalFilters_selector: { test: "modal filters" },
    });
    expect(test()).toBe(true);
  });

  it("hasFilter resolves correctly when there is hidden label ids, modal is open", () => {
    setMockAtoms({
      hiddenLabelIds: ["1", "2"],
      __modalFilters_selector: { test: "modal filters" },
    });
    const test2 = <TestSelectorFamily<typeof filters.hasFilters>>(
      (<unknown>filters.hasFilters(true))
    );
    expect(test2()).toBe(true);
  });

  // An extended selection can arrive as a view-stage override (e.g. the
  // embeddings panel's lasso) instead of an id list; both must count,
  // or the grid's count/save-filters affordances ignore the selection
  it("hasFilter resolves correctly when a selection override stage is set", () => {
    setMockAtoms({
      filters: {},
      extendedSelection: null,
      extendedSelectionOverrideStage: {
        "fiftyone.core.stages.GeoWithin": { boundary: [] },
      },
    });
    expect(test()).toBe(true);

    setMockAtoms({ extendedSelectionOverrideStage: null });
    expect(test()).toBe(false);
  });
});

// These call the pure rule directly rather than the hook: `temporalTags.test`
// mocks this module wholesale, so anything asserted through that mock is
// asserting the mock. This is the only place the real rule runs.
describe("activeFilterValues", () => {
  it("returns the inclusive string selections", () => {
    expect(activeFilterValues({ tag: { values: ["a", "b"] } }, "tag")).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns empty for an exclude filter", () => {
    expect(
      activeFilterValues({ tag: { values: ["a"], exclude: true } }, "tag"),
    ).toEqual([]);
  });

  it("returns empty for an unset path", () => {
    expect(activeFilterValues({}, "tag")).toEqual([]);
    expect(activeFilterValues(undefined, "tag")).toEqual([]);
  });

  it("drops null values", () => {
    expect(activeFilterValues({ tag: { values: ["a", null] } }, "tag")).toEqual(
      ["a"],
    );
  });

  // Consumers memo on the identity of this result, so every empty answer has
  // to be the same array or the memo churns on every render.
  it("returns one stable empty array", () => {
    expect(activeFilterValues({}, "tag")).toBe(
      activeFilterValues({ tag: { exclude: true } }, "tag"),
    );
    expect(activeFilterValues({ tag: { values: [null] } }, "tag")).toBe(
      activeFilterValues({}, "other"),
    );
  });
});
