import { describe, expect, it, vi } from "vitest";

vi.mock("recoil");
vi.mock("recoil-relay");

import type {
  TestSelector,
  TestSelectorFamily,
} from "../../../../__mocks__/recoil";
import { setMockAtoms } from "../../../../__mocks__/recoil";
import * as queryPerformance from "./queryPerformance";

describe("tests query performance selectors", () => {
  it("resolves wildcard indexed fields with database path", () => {
    const test = <TestSelectorFamily<typeof queryPerformance.indexedPaths>>(
      (<unknown>queryPerformance.indexedPaths("ground_truth"))
    );
    setMockAtoms({
      dbPath: (p) =>
        p === "ground_truth.id" ? "ground_truth._id" : "ground_truth.label",
      expandPath: () => "ground_truth",
      fieldPaths: () => ["id", "label"],
      indexesByPath: new Set(["ground_truth._id", "ground_truth.label"]),
      isLabelPath: () => true,
    });

    expect(test()).toEqual(new Set(["ground_truth.id", "ground_truth.label"]));
  });

  it("resolves query performant views", () => {
    const test = <TestSelector<typeof queryPerformance.isQueryPerformantView>>(
      (<unknown>queryPerformance.isQueryPerformantView)
    );

    setMockAtoms({
      _view__setter: [],
    });
    expect(test()).toBe(true);

    setMockAtoms({
      _view__setter: [
        {
          _cls: "fiftyone.core.stages.ExcludeFields",
        },
        {
          _cls: "fiftyone.core.stages.SelectFields",
        },
        {
          _cls: "fiftyone.core.stages.SelectGroupSlices",
        },
      ],
    });
    expect(test()).toBe(true);

    setMockAtoms({
      _view__setter: [
        {
          _cls: "unsupported",
        },
      ],
    });
    expect(test()).toBe(false);

    setMockAtoms({
      _view__setter: [{}, {}],
    });
    expect(test()).toBe(false);
  });
});
