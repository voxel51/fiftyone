import { describe, expect, it } from "vitest";
import { getSourceFieldFromStages } from "./useSourceFieldToActivate";

const toPatches = (field: string) => ({
  _cls: "fiftyone.core.stages.ToPatches",
  kwargs: [
    ["field", field] as [string, unknown],
    ["_state", { name: `${field}-patches` }] as [string, unknown],
  ],
});

const otherStage = (cls: string) => ({
  _cls: cls,
  kwargs: [["field", "some_field"] as [string, unknown]],
});

describe("getSourceFieldFromStages", () => {
  it("extracts the field from a ToPatches stage when isPatches is true", () => {
    const stages = [toPatches("ground_truth")];
    expect(getSourceFieldFromStages(stages, { isPatches: true })).toBe(
      "ground_truth",
    );
  });

  it("returns undefined for a ToPatches stage when isPatches is false", () => {
    const stages = [toPatches("ground_truth")];
    expect(
      getSourceFieldFromStages(stages, { isPatches: false }),
    ).toBeUndefined();
  });

  it("returns undefined when there are no matching stages", () => {
    const stages = [otherStage("fiftyone.core.stages.SortBy")];
    expect(
      getSourceFieldFromStages(stages, { isPatches: true }),
    ).toBeUndefined();
  });

  it("returns undefined for an empty stages array", () => {
    expect(getSourceFieldFromStages([], { isPatches: true })).toBeUndefined();
    expect(getSourceFieldFromStages([], { isPatches: false })).toBeUndefined();
  });

  it("finds the ToPatches stage among other stages", () => {
    const stages = [
      otherStage("fiftyone.core.stages.FilterLabels"),
      toPatches("predictions"),
      otherStage("fiftyone.core.stages.SortBy"),
    ];
    expect(getSourceFieldFromStages(stages, { isPatches: true })).toBe(
      "predictions",
    );
  });

  it("returns the first matching stage when multiple match", () => {
    const stages = [toPatches("first_field"), toPatches("second_field")];
    expect(getSourceFieldFromStages(stages, { isPatches: true })).toBe(
      "first_field",
    );
  });
});
