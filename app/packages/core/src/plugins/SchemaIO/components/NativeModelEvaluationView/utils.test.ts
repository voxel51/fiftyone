import { describe, expect, it, vi } from "vitest";
import { computeSortedCompareKeys, CompareKey } from "./utils.ts";

// Mock the Plotly.js module to bypass code that calls URL.createObjectURL
vi.mock("plotly.js", () => {
  return {
    newPlot: vi.fn(() => Promise.resolve()),
  };
});

if (typeof window !== "undefined") {
  // Stub out URL.createObjectURL and URL.revokeObjectURL globally
  vi.stubGlobal("URL", {
    ...window.URL,
    createObjectURL: () => "blob://dummy-url",
    revokeObjectURL: () => {},
  });
}

describe("computeSortedCompareKeys with 10 evaluation items", () => {
  it("should filter out the current evaluation and sort items so that enabled ones appear first, then disabled ones (with matching type first), and tooltips are set correctly", () => {
    const evaluations = [
      { key: "eval1", type: "classification", method: "coco" },
      { key: "eval2", type: "classification", method: "someMethod" },
      { key: "eval3", type: "classification", method: "someMethod" },
      { key: "eval4", type: "detection", method: "coco" },
      { key: "eval5", type: "segmentation", method: "coco" },
      { key: "eval6", type: "classification", method: "coco" },
      { key: "eval7", type: "detection", method: "someMethod" },
      { key: "eval8", type: "classification", method: "coco" },
      { key: "eval9", type: "segmentation", method: "someMethod" },
      { key: "eval10", type: "classification", method: "coco" },
    ];
    // currentName does not match any evaluation key so none are filtered out.
    const currentName = "training1";
    const currentType = "classification";
    const currentMethod = "coco";

    const result: CompareKey[] = computeSortedCompareKeys(
      evaluations,
      currentName,
      currentType,
      currentMethod
    );

    // Total count should be 10
    expect(result).toHaveLength(10);

    // Determine which items should be enabled vs. disabled.
    // Enabled: those with type === "classification" and method === "coco"
    const expectedEnabled = ["eval1", "eval6", "eval8", "eval10"];
    // The rest should be disabled.
    const expectedDisabled = [
      "eval2",
      "eval3",
      "eval4",
      "eval5",
      "eval7",
      "eval9",
    ];

    result.forEach((item) => {
      if (expectedEnabled.includes(item.key)) {
        expect(item.disabled).toBe(false);
        expect(item.tooltipBody).toBeUndefined();
      } else {
        expect(item.disabled).toBe(true);
        expect(item.tooltipBody).toBe(
          "Note: Comparisons are only valid between evaluations of the same type and method."
        );
      }
      // Tooltip title should use the capitalized currentType
      expect(item.tooltip).toBe("Evaluation Type: Classification");
    });

    // Separate the enabled and disabled items for further ordering checks.
    const enabledItems = result.filter((item) => !item.disabled);
    const disabledItems = result.filter((item) => item.disabled);

    expect(enabledItems).toHaveLength(4);
    expect(disabledItems).toHaveLength(6);

    // For enabled items, we sort alphabetically by key.
    const sortedEnabled = [...enabledItems].sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    expect(enabledItems.map((i) => i.key)).toEqual(
      sortedEnabled.map((i) => i.key)
    );

    // Among disabled items, we want those with type === currentType to come first.
    const disabledWithMatchingType = disabledItems.filter(
      (item) => item.type === currentType
    );
    const disabledWithoutMatchingType = disabledItems.filter(
      (item) => item.type !== currentType
    );
    // In our data, eval2 and eval3 are classification but with mismatched method.
    expect(disabledWithMatchingType).toHaveLength(2);

    // Sort each subgroup alphabetically.
    const sortedMatching = [...disabledWithMatchingType].sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    const sortedNonMatching = [...disabledWithoutMatchingType].sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    const sortedDisabled = [...sortedMatching, ...sortedNonMatching];
    expect(disabledItems.map((i) => i.key)).toEqual(
      sortedDisabled.map((i) => i.key)
    );

    // The overall order should be enabled items (alphabetically) first, then the sorted disabled items.
    const expectedOrder = [
      ...sortedEnabled.map((i) => i.key),
      ...sortedDisabled.map((i) => i.key),
    ];
    expect(result.map((i) => i.key)).toEqual(expectedOrder);
  });
});
