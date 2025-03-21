import { beforeEach, describe, expect, it } from "vitest";
import { syncAndGetNewLabels } from "./syncAndGetNewLabels";

describe("syncAndGetNewFields", () => {
  let lut: Map<string, Set<string>>;

  beforeEach(() => {
    lut = new Map();
  });

  it("returns null if currentActiveLabelFields is empty", () => {
    const id = "looker1";
    const currentActiveLabelFields = new Set<string>();

    const result = syncAndGetNewLabels(id, lut, currentActiveLabelFields);
    expect(result).toBeNull();
    // lut shouldn't be modified
    expect(lut.has(id)).toBe(false);
  });

  it("returns newly added fields if lut is empty", () => {
    const id = "looker1";
    const currentActiveLabelFields = new Set<string>(["segmentation1"]);

    const result = syncAndGetNewLabels(id, lut, currentActiveLabelFields);
    expect(result).toEqual(["segmentation1"]);

    // lut should now have the newly added fields
    const storedFields = lut.get(id);
    expect(storedFields).toEqual(new Set(["segmentation1"]));
  });

  it("returns newly added fields for a new looker (lut doesn't have the looker yet)", () => {
    lut.set("existingLooker", new Set(["seg1"]));

    const currentActiveLabelFields = new Set(["seg1", "heatmap1"]);
    const newLookerId = "newLooker";

    const result = syncAndGetNewLabels(
      newLookerId,
      lut,
      currentActiveLabelFields
    );
    expect(result).toEqual(["seg1", "heatmap1"]);

    // Check that they're actually stored in the LUT now
    expect(lut.get(newLookerId)).toEqual(new Set(["seg1", "heatmap1"]));
    expect(lut.get("existingLooker")).toEqual(new Set(["seg1"]));
  });

  it("returns null if lut already has the same fields (no new fields)", () => {
    const id = "looker2";
    lut.set(id, new Set(["seg1", "seg2"]));

    const currentActiveLabelFields = new Set(["seg1", "seg2"]);
    const result = syncAndGetNewLabels(id, lut, currentActiveLabelFields);

    expect(result).toBeNull();
    // lut remains the same, no changes
    expect(lut.get(id)).toEqual(new Set(["seg1", "seg2"]));
  });

  it("returns newly added fields if some fields are missing in lut", () => {
    const id = "looker2";
    lut.set(id, new Set(["field1"]));

    const currentActiveLabelFields = new Set(["field1", "field2"]);
    const result = syncAndGetNewLabels(id, lut, currentActiveLabelFields);

    expect(result).toEqual(["field2"]); // only new field
    expect(lut.get(id)).toEqual(new Set(["field1", "field2"]));
  });

  it("doesn't keep returning newly added fields after lut is updated", () => {
    const id = "looker3";
    lut.set(id, new Set(["field1"]));

    // First call adds "field2"
    let result = syncAndGetNewLabels(id, lut, new Set(["field1", "field2"]));
    expect(result).toEqual(["field2"]);
    expect(lut.get(id)).toEqual(new Set(["field1", "field2"]));

    // Second call with the same fields should return null
    result = syncAndGetNewLabels(id, lut, new Set(["field1", "field2"]));
    expect(result).toBeNull();
  });
});
