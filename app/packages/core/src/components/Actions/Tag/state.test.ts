import { describe, expect, it, vi } from "vitest";
import type { TestSelectorFamily } from "../../../../../../__mocks__/recoil";
import { setMockAtoms } from "../../../../../../__mocks__/recoil";
import * as state from "./state";

vi.mock("recoil");
vi.mock("recoil-relay");

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

    const samples = <TestSelectorFamily<typeof state.tagStats>>(
      (<unknown>state.tagStats({ modal: false, labels: false }))
    );
    expect(samples()).toStrictEqual({ one: 1, two: 1, three: 0 });

    const labels = <TestSelectorFamily<typeof state.tagStats>>(
      (<unknown>state.tagStats({ modal: false, labels: true }))
    );
    expect(labels()).toStrictEqual({ one: 1, two: 1, three: 0 });

    const samplesModal = <TestSelectorFamily<typeof state.tagStats>>(
      (<unknown>state.tagStats({ modal: true, labels: false }))
    );
    expect(samplesModal()).toStrictEqual({ one: 1, two: 1 });

    const labelsModal = <TestSelectorFamily<typeof state.tagStats>>(
      (<unknown>state.tagStats({ modal: true, labels: true }))
    );
    expect(labelsModal()).toStrictEqual({ one: 1, two: 1 });
  });

  it("override filters for only a modal sample selection", () => {
    expect(state.overrideFilters(false, new Set())).toBe(false);
    expect(state.overrideFilters(false, new Set("sample"))).toBe(false);
    expect(state.overrideFilters(true, new Set())).toBe(false);
    expect(state.overrideFilters(true, new Set("sample"))).toBe(true);
  });
});
