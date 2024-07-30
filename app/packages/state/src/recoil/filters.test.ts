import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelectorFamily } from "../../../../__mocks__/recoil";
import * as filters from "./filters";

describe("filter resolves correctly", () => {
  const testModal = <TestSelectorFamily<typeof filters.filter>>(
    (<unknown>filters.filter({ path: "test", modal: true }))
  );

  const testGrid = <TestSelectorFamily<typeof filters.filter>>(
    (<unknown>filters.filter({ path: "test", modal: false }))
  );

  setMockAtoms({
    _filters__setter: { test: "grid filters" },
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
      _filters__setter: { test: "grid filters" },
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
});

describe("setting a filter does not use async state", () => {
  const test = <TestSelectorFamily<typeof filters.filter>>(
    (<unknown>filters.filter({ modal: false, path: "my_field" }))
  );

  it("does not use lightningUnlocked ", () => {
    setMockAtoms({
      granularSidebarExpandedStore: {},
      lightning: true,
      lightningPaths: () => new Set(["my_field"]),
      lightningUnlocked: () => {
        throw new Error("do not call me");
      },
    });
    test.set({ exclude: false, isMatching: false, values: ["value"] });
  });
});
