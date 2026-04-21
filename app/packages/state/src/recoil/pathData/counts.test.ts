import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import {
  setMockAtoms,
  TestSelectorFamily,
} from "../../../../../__mocks__/recoil";
import * as counts from "./counts";

// Tracks `aggregation(params)` calls so tests below can assert that
// `_label_tags` never reaches the server-side aggregations resolver (there is
// no `_label_tags` field on the view; it is derived client-side).
const aggregationCalls: { path: string }[] = [];
const cumulativeCountsCalls: { path: string; ftype: string }[] = [];

setMockAtoms({
  aggregation: (params: { path: string }) => {
    aggregationCalls.push(params);
    return undefined;
  },
  count: ({ path }: { path: string }) => {
    if (path !== "my_keypoints.keypoints") {
      throw new Error(`wrong path ${path}`);
    }
    return 1;
  },
  cumulativeCounts: (params: { path: string; ftype: string }) => {
    cumulativeCountsCalls.push(params);
    return { labelTest: 17, correct: 5 };
  },
  field: () => undefined,
  isListField: () => false,
});

describe("resolves none counts", () => {
  const testNoneCount = <TestSelectorFamily<typeof counts.noneCount>>(
    (<unknown>counts.noneCount({
      extended: false,
      modal: false,
      path: "my_keypoints.keypoints.points",
    }))
  );

  it("resolves with undefined count", () => {
    expect(testNoneCount()).toBe(1);
  });
});

describe("counts for _label_tags pseudo-path", () => {
  const testCounts = <TestSelectorFamily<typeof counts.counts>>(
    (<unknown>counts.counts({
      extended: false,
      modal: false,
      path: "_label_tags",
    }))
  );

  it("routes through cumulativeCounts(MATCH_LABEL_TAGS) without hitting aggregation", () => {
    aggregationCalls.length = 0;
    cumulativeCountsCalls.length = 0;

    // sums come from per-label-field `.tags` aggregations via cumulativeCounts
    expect(testCounts()).toEqual({ labelTest: 17, correct: 5 });

    // server has no `_label_tags` field — we must never aggregate on it
    expect(aggregationCalls.some((c) => c?.path === "_label_tags")).toBe(false);

    // one cumulativeCounts call, shaped like MATCH_LABEL_TAGS (path: "tags",
    // ftype: EMBEDDED_DOCUMENT_FIELD)
    expect(cumulativeCountsCalls).toHaveLength(1);
    expect(cumulativeCountsCalls[0]).toMatchObject({
      extended: false,
      modal: false,
      path: "tags",
    });
  });
});
