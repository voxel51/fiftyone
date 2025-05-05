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
      (<unknown>queryPerformance.indexedPaths({ path: "ground_truth" }))
    );
    setMockAtoms({
      dbPath: (p) =>
        p === "ground_truth.id" ? "ground_truth._id" : "ground_truth.label",
      expandPath: () => "ground_truth",
      fieldPaths: () => ["id", "label"],
      indexesByPath: ["ground_truth._id", "ground_truth.label"],
      isLabelPath: () => true,
    });

    expect(test()).toEqual(["ground_truth.id", "ground_truth.label"]);
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

  it("resolves fields that are compound indexed", () => {
    setMockAtoms({
      dbPath: (p) => (p.endsWith("id") ? p.replace("id", "_id") : p),
      filterKeys: ["one.id", "two.id"],
      indexMap: {
        "one.id": ["one._id"],
        "one.id_two.id": ["one._id", "two._id"],
      },
      validIndexes: () => ({
        active: { name: "one.id_two.id", keys: ["one._id", "two._id"] },
        available: [],
        trailing: [{ name: "one.id_two.id", key: "two._id" }],
      }),
    });

    // parent field shows compound index too
    const one = <TestSelectorFamily<typeof queryPerformance.isCompoundIndexed>>(
      (<unknown>queryPerformance.isCompoundIndexed("one"))
    );
    expect(one()).toEqual(true);

    const oneId = <
      TestSelectorFamily<typeof queryPerformance.isCompoundIndexed>
    >(<unknown>queryPerformance.isCompoundIndexed("one.id"));
    expect(oneId()).toEqual(true);

    // parent field shows compound index too
    const two = <TestSelectorFamily<typeof queryPerformance.isCompoundIndexed>>(
      (<unknown>queryPerformance.isCompoundIndexed("two"))
    );
    expect(two()).toEqual(true);

    const twoId = <
      TestSelectorFamily<typeof queryPerformance.isCompoundIndexed>
    >(<unknown>queryPerformance.isCompoundIndexed("two.id"));
    expect(twoId()).toEqual(true);
  });
});
