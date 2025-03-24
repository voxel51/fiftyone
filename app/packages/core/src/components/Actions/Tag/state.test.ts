import { describe, expect, it, vi } from "vitest";
import type { TestSelectorFamily } from "../../../../../../../__mocks__/recoil";
import { setMockAtoms } from "../../../../../../../__mocks__/recoil";
import { tagStats } from "./state";

vi.mock("recoil");
vi.mock("recoil-relay");

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

    const samples = <TestSelectorFamily<typeof tagStats>>(
      (<unknown>tagStats({ modal: false, labels: false }))
    );
    expect(samples()).toStrictEqual({ one: 1, two: 1 });

    const labels = <TestSelectorFamily<typeof tagStats>>(
      (<unknown>tagStats({ modal: false, labels: true }))
    );
    expect(labels()).toStrictEqual({ one: 1, two: 1 });
  });
});
