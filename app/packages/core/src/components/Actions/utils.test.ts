import { describe, expect, it, vi } from "vitest";
import * as utils from "./utils";

vi.mock("recoil");
vi.mock("recoil-relay");

import {
  TestSelectorFamily,
  setMockAtoms,
} from "../../../../../__mocks__/recoil";

describe("Resolves tag counts", () => {
  it("resolves all", () => {
    setMockAtoms({
      labelTagCounts: (params) => ({ one: 1, two: 1, three: 1 }),
      sampleTagCounts: (params) => ({ one: 1, two: 1, three: 1 }),
      tagStatistics: (modal) => ({
        count: 2,
        items: 1,
        tags: { one: 1, two: 1 },
      }),
    });

    const samples = <TestSelectorFamily<typeof utils.tagStats>>(
      (<unknown>utils.tagStats({ modal: false, labels: false }))
    );
    expect(samples()).toStrictEqual({ one: 1, two: 1, three: 0 });

    const labels = <TestSelectorFamily<typeof utils.tagStats>>(
      (<unknown>utils.tagStats({ modal: false, labels: true }))
    );
    expect(labels()).toStrictEqual({ one: 1, two: 1, three: 0 });

    const samplesModal = <TestSelectorFamily<typeof utils.tagStats>>(
      (<unknown>utils.tagStats({ modal: true, labels: false }))
    );
    expect(samplesModal()).toStrictEqual({ one: 1, two: 1 });

    const labelsModal = <TestSelectorFamily<typeof utils.tagStats>>(
      (<unknown>utils.tagStats({ modal: true, labels: true }))
    );
    expect(labelsModal()).toStrictEqual({ one: 1, two: 1 });
  });

  it("override filters for only a modal sample selection", () => {
    expect(utils.overrideFilters(false, new Set())).toBe(false);
    expect(utils.overrideFilters(false, new Set("sample"))).toBe(false);
    expect(utils.overrideFilters(true, new Set())).toBe(false);
    expect(utils.overrideFilters(true, new Set("sample"))).toBe(true);
  });
});
