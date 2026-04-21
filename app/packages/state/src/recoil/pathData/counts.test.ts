import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import {
  setMockAtoms,
  TestSelectorFamily,
} from "../../../../../__mocks__/recoil";
import * as counts from "./counts";

// Tracks every `aggregation(params)` lookup so tests can assert that
// `_label_tags` never reaches the server-side aggregations resolver (there is
// no `_label_tags` field on the view; it is derived client-side).
const aggregationCalls: { path: string }[] = [];

const LABEL_TAG_AGGS: Record<
  string,
  {
    __typename: "StringAggregation";
    values: { value: string; count: number }[];
  }
> = {
  "ground_truth.detections.tags": {
    __typename: "StringAggregation",
    values: [
      { value: "labelTest", count: 10 },
      { value: "correct", count: 5 },
    ],
  },
  "predictions.detections.tags": {
    __typename: "StringAggregation",
    values: [{ value: "labelTest", count: 7 }],
  },
};

setMockAtoms({
  aggregation: (params: { path: string }) => {
    aggregationCalls.push(params);
    if (params.path === "_label_tags") {
      // The regression we're guarding against: the server raises
      // `DatasetView has no field '_label_tags'` if this path is ever sent.
      throw new Error(
        "aggregation should never be called with path '_label_tags'"
      );
    }
    return LABEL_TAG_AGGS[params.path];
  },
  count: ({ path }: { path: string }) => {
    if (path !== "my_keypoints.keypoints") {
      throw new Error(`wrong path ${path}`);
    }
    return 1;
  },
  // Re-enter the real `counts` / `cumulativeCounts` resolvers when they appear
  // in a `get(...)` inside another selector. This keeps the full
  // counts → cumulativeCounts → counts(sub-path) → aggregation chain live
  // rather than stubbing it to a tautology.
  counts: (params) => (counts.counts(params) as unknown as () => unknown)(),
  cumulativeCounts: (params) =>
    (counts.cumulativeCounts(params) as unknown as () => unknown)(),
  gatheredPaths: () => ["ground_truth.detections", "predictions.detections"],
  // Any non-empty object is fine — we only need `Boolean(field)` to be truthy
  // so that `counts` does not short-circuit into the skeleton / pseudo-path
  // branches when resolving the per-label-field sub-paths.
  field: (path: string) =>
    path === "_label_tags" ? undefined : { name: path, ftype: "StringField" },
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

  it("sums real per-label-field .tags aggregations; never aggregates on _label_tags", () => {
    aggregationCalls.length = 0;

    // End-to-end summation: {labelTest: 10+7, correct: 5}. The numbers come
    // from running the real cumulativeCounts → counts → aggregation chain
    // over the two mocked label paths.
    expect(testCounts()).toEqual({ labelTest: 17, correct: 5 });

    const paths = aggregationCalls.map((c) => c.path);

    // Real label-field `.tags` aggregations DID fire (this is the query that
    // still needs to hit the server for full-view counts).
    expect(paths).toContain("ground_truth.detections.tags");
    expect(paths).toContain("predictions.detections.tags");

    // The pseudo-path itself must never be aggregated.
    expect(paths).not.toContain("_label_tags");
  });
});
