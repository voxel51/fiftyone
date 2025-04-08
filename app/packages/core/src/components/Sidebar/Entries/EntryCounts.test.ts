import { describe, expect, it, vi } from "vitest";
import type { TestSelectorFamily } from "../../../../../../__mocks__/recoil";
import { setMockAtoms } from "../../../../../../__mocks__/recoil";
import * as entryCounts from "./EntryCounts";

vi.mock("recoil");
vi.mock("recoil-relay");

const MOCK_NO_RESULT = { count: null, results: [] };

const MOCK_RESULT = {
  count: 1,
  results: [{ count: 1, value: "label_tag" }],
};

const getSelector = (extended: boolean, modal: boolean) => {
  const selector = <TestSelectorFamily<typeof entryCounts.labelTagsCount>>(
    (<unknown>entryCounts.labelTagsCount({ extended, modal }))
  );
  return selector();
};

describe("test label tag counts", () => {
  it("should disable results with query performance only in the grid", () => {
    setMockAtoms({
      queryPerformance: true,
      cumulativeCounts: () => ({ label_tag: 1 }),
    });

    // grid
    expect(getSelector(false, false)).toStrictEqual(MOCK_NO_RESULT);
    expect(getSelector(true, false)).toStrictEqual(MOCK_NO_RESULT);

    // modal
    expect(getSelector(false, true)).toStrictEqual(MOCK_RESULT);
    expect(getSelector(true, true)).toStrictEqual(MOCK_RESULT);
  });

  it("should enable results without query performance", () => {
    setMockAtoms({
      queryPerformance: false,
      cumulativeCounts: () => ({ label_tag: 1 }),
    });

    expect(getSelector(false, false)).toStrictEqual(MOCK_RESULT);
    expect(getSelector(true, false)).toStrictEqual(MOCK_RESULT);

    // modal
    expect(getSelector(false, true)).toStrictEqual(MOCK_RESULT);
    expect(getSelector(true, true)).toStrictEqual(MOCK_RESULT);
  });
});
