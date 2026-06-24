import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { FLOAT_FIELD, INT_FIELD, STRING_FIELD } from "@fiftyone/utilities";
import { setMockAtoms, TestSelectorFamily } from "../../../../__mocks__/recoil";
import * as aggregations from "./aggregations";

// modalSampleAggregations computes the sidebar's aggregations from the cached
// sample JSON instead of querying the server. We drive the public selector and
// assert the per-type result shapes the sidebar consumes.
describe("modalSampleAggregations", () => {
  const test = <
    TestSelectorFamily<typeof aggregations.modalSampleAggregations>
  >(<unknown>aggregations.modalSampleAggregations);

  it("returns nothing while seeking (no settled sidebar sample)", () => {
    setMockAtoms({
      sidebarSampleId: null,
      activeModalSidebarSample: { num: 1 },
      field: () => ({ ftype: INT_FIELD }),
    });
    expect(test({ paths: ["num"] })()).toEqual([]);
  });

  it("computes int count/min/max across a list path", () => {
    setMockAtoms({
      sidebarSampleId: "s1",
      activeModalSidebarSample: { frames: [{ n: 3 }, { n: 7 }, { n: 5 }] },
      field: () => ({ ftype: INT_FIELD }),
    });
    const [agg] = test({ paths: ["frames.n"] })();
    expect(agg).toMatchObject({
      __typename: "IntAggregation",
      path: "frames.n",
      count: 3,
      min: 3,
      max: 7,
    });
  });

  it("tallies string values with per-value counts", () => {
    setMockAtoms({
      sidebarSampleId: "s1",
      activeModalSidebarSample: {
        predictions: {
          detections: [{ label: "cat" }, { label: "dog" }, { label: "cat" }],
        },
      },
      field: () => ({ ftype: STRING_FIELD }),
    });
    const [agg] = test({ paths: ["predictions.detections.label"] })();
    expect(agg.__typename).toBe("StringAggregation");
    expect(agg.count).toBe(3);
    expect(agg.values).toEqual(
      expect.arrayContaining([
        { value: "cat", count: 2 },
        { value: "dog", count: 1 },
      ])
    );
  });

  it("separates non-finite floats from the min/max", () => {
    setMockAtoms({
      sidebarSampleId: "s1",
      activeModalSidebarSample: { conf: [0.1, 0.9, "nan", "inf"] },
      field: () => ({ ftype: FLOAT_FIELD }),
    });
    const [agg] = test({ paths: ["conf"] })();
    expect(agg).toMatchObject({
      __typename: "FloatAggregation",
      exists: 4,
      nan: 1,
      inf: 1,
      ninf: 0,
      min: 0.1,
      max: 0.9,
    });
  });

  it("reports a single document for the root path", () => {
    setMockAtoms({
      sidebarSampleId: "s1",
      activeModalSidebarSample: { anything: 1 },
      field: () => ({ ftype: undefined }),
    });
    const [agg] = test({ paths: [""] })();
    expect(agg).toMatchObject({ __typename: "RootAggregation", count: 1 });
  });
});
