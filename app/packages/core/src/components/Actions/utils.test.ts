import { describe, expect, it, vi } from "vitest";

vi.mock("recoil");
vi.mock("recoil-relay");
import * as utils from "../../../src/components/Actions/utils";

import {
  setMockAtoms,
  TestSelector,
  TestSelectorFamily,
} from "../../../../../__mocks__/recoil";

describe("Resolves tag counts", () => {
  it("resolves all", () => {
    setMockAtoms({
      labelTagCounts: (params) => ({ one: 1, two: 1 }),
      sampleTagCounts: (params) => ({ one: 1, two: 1 }),
      tagStatistics: (modal) => ({
        count: 2,
        items: 1,
        tags: { one: 1, two: 1 },
      }),
    });

    const samples = <TestSelectorFamily<typeof utils.tagStats>>(
      (<unknown>utils.tagStats({ modal: false, labels: false }))
    );
    expect(samples()).toStrictEqual({ one: 1, two: 1 });

    const labels = <TestSelectorFamily<typeof utils.tagStats>>(
      (<unknown>utils.tagStats({ modal: false, labels: true }))
    );
    expect(labels()).toStrictEqual({ one: 1, two: 1 });
  });
});
