import { shouldResolveSelection } from "./utils";
import { it, expect, describe } from "vitest";

describe("shouldResolveSelection", () => {
  it("returns false when canUseSpatialSelection is true and filters are empty", () => {
    const view = [];
    const filters = {};
    const patchesField = undefined;
    const pointsField = "point";

    const result = shouldResolveSelection(
      view,
      filters,
      patchesField,
      pointsField
    );

    expect(result).toBe(false);
  });

  it("returns true when canUseSpatialSelection is true and filters are not empty", () => {
    const view = [];
    const filters = { someFilter: true };
    const patchesField = undefined;
    const pointsField = "point";

    const result = shouldResolveSelection(
      view,
      filters,
      patchesField,
      pointsField
    );

    expect(result).toBe(true);
  });

  it("returns true when canUseSpatialSelection is false", () => {
    const view = [];
    const filters = {};
    const patchesField = "ground_truth";
    const pointsField = undefined;

    const result = shouldResolveSelection(
      view,
      filters,
      patchesField,
      pointsField
    );

    expect(result).toBe(true);
  });
});
