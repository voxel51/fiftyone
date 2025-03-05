// computeSortedCompareKeys.test.ts
import { describe, expect, it } from "vitest";
import { computeSortedCompareKeys, CompareKey } from "./utils.ts";

describe("computeSortedCompareKeys", () => {
  it("should filter out the current evaluation and sort compare keys correctly", () => {
    const evaluations = [
      { key: "eval1", type: "classification", method: "coco" },
      { key: "eval2", type: "classification", method: "coco" },
      { key: "eval3", type: "detection", method: "someMethod" },
    ];
    const currentName = "training1";
    const currentType = "classification";

    const result: CompareKey[] = computeSortedCompareKeys(
      evaluations,
      currentName,
      currentType
    );

    // "eval3" should be filtered out, leaving 2 evaluations
    expect(result).toHaveLength(2);

    // "eval2" should match the current type and be enabled.
    const eval2 = result.find((item) => item.key === "eval2");
    expect(eval2).toBeDefined();
    expect(eval2?.disabled).toBe(false);

    // "eval3" has a different type and should be disabled.
    const eval3 = result.find((item) => item.key === "eval3");
    expect(eval3).toBeDefined();
    expect(eval3?.disabled).toBe(true);

    // Check the tooltip is set correctly.
    result.forEach((item) => {
      expect(item.tooltip).toBe(`Evaluation type: ${currentType}`);
    });
  });
});
