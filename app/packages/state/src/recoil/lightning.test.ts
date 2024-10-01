import { describe, expect, it, vi } from "vitest";

vi.mock("recoil");
vi.mock("recoil-relay");

import { TestSelectorFamily, setMockAtoms } from "../../../../__mocks__/recoil";
import * as lightning from "./lightning";

describe("tests lightning selectors", () => {
  it("resolves wildcard indexed fields with database path", () => {
    const test = <TestSelectorFamily<typeof lightning.lightningPaths>>(
      (<unknown>lightning.lightningPaths("ground_truth"))
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
