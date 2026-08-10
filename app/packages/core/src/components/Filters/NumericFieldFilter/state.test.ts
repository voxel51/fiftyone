import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import {
  setMockAtoms,
  TestSelectorFamily,
} from "../../../../../../__mocks__/recoil";
import * as state from "./state";

// Tracks every ``nonfiniteData`` read so tests can assert whether the
// prefetch actually issued the parent aggregation.
const nonfiniteDataCalls: {
  path: string;
  modal: boolean;
  extended: boolean;
}[] = [];

setMockAtoms({
  queryPerformance: false,
  hasDefaultRange: () => true,
  nonfiniteData: (params: {
    path: string;
    modal: boolean;
    extended: boolean;
  }) => {
    nonfiniteDataCalls.push(params);
    return { none: 0, inf: 0, ninf: 0, nan: 0 };
  },
});

const prefetch = (params: { path: string; modal: boolean }) =>
  (<TestSelectorFamily<typeof state.numericFilterPrefetch>>(
    (<unknown>state.numericFilterPrefetch(params))
  ))();

describe("numericFilterPrefetch", () => {
  beforeEach(() => {
    nonfiniteDataCalls.length = 0;
  });

  it("prefetches the parent aggregation on a default range", () => {
    setMockAtoms({ queryPerformance: false, hasDefaultRange: () => true });

    prefetch({ path: "a.b", modal: false });

    expect(nonfiniteDataCalls).toHaveLength(1);
    expect(nonfiniteDataCalls[0]).toMatchObject({
      path: "a.b",
      modal: false,
      extended: false,
    });
  });

  it("does not prefetch once a range filter is applied (non-default range)", () => {
    setMockAtoms({ queryPerformance: false, hasDefaultRange: () => false });

    prefetch({ path: "a.b", modal: false });

    expect(nonfiniteDataCalls).toHaveLength(0);
  });

  it("is a no-op under query performance (non-modal)", () => {
    setMockAtoms({ queryPerformance: true, hasDefaultRange: () => true });

    prefetch({ path: "a.b", modal: false });

    expect(nonfiniteDataCalls).toHaveLength(0);
  });

  it("still prefetches in the modal even under query performance", () => {
    // The query-performance no-op is gated on ``!modal``; the modal has no
    // lightning prefetch, so the waterfall still needs collapsing there.
    setMockAtoms({ queryPerformance: true, hasDefaultRange: () => true });

    prefetch({ path: "a.b", modal: true });

    expect(nonfiniteDataCalls).toHaveLength(1);
  });
});
