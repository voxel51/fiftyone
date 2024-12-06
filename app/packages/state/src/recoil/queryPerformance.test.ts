import { describe, expect, it, vi } from "vitest";

vi.mock("recoil");
vi.mock("recoil-relay");

import type { TestSelectorFamily } from "../../../../__mocks__/recoil";
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
});
