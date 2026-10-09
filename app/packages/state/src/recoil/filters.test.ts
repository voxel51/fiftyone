import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

const SESSION_FILTERS = vi.hoisted(() => ({
  cluster: { values: ["b"], exclude: true },
}));
vi.mock("../session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../session")>()),
  getSessionRef: () => ({ filters: SESSION_FILTERS }),
}));

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

describe("readFilters", () => {
  // A fresh module per test: `read` keeps its last value in module scope
  const load = async () => {
    vi.resetModules();
    return import("./filters");
  };
  const first = { id: "fetch-1", datasetId: "a" };
  const reload = { id: "fetch-2", datasetId: "a" };
  const otherDataset = { id: "fetch-2", datasetId: "b" };

  it("keeps the filters across a reload of the same dataset", async () => {
    // `id` is minted per fetch: a layout write (a panel tab switch, a plot's
    // color-by) reloads the page, and must not read as a dataset switch
    const { readFilters } = await load();
    expect(readFilters(first, null)).toBe(SESSION_FILTERS);
    expect(readFilters(reload, first)).toBe(SESSION_FILTERS);
  });

  it("clears the filters on a dataset switch", async () => {
    const { readFilters } = await load();
    readFilters(first, null);
    expect(readFilters(otherDataset, first)).toEqual({});
  });

  it("keeps a view change's reset through the reload that follows", async () => {
    const {
      filters: atom,
      readFilters,
      resetFiltersTransaction,
    } = await load();
    readFilters(first, null);
    const reset = vi.fn();
    resetFiltersTransaction({ reset });
    expect(reset).toHaveBeenCalledWith(atom);
    expect(readFilters(reload, first)).toEqual({});
  });
});
