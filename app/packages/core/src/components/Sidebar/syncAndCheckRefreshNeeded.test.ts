import { beforeEach, describe, expect, it } from "vitest";
import { syncAndCheckRefreshNeeded } from "./syncAndCheckRefreshNeeded";

describe("syncAndCheckRefreshNeeded", () => {
  let lut: Map<string, Set<string>>;

  beforeEach(() => {
    lut = new Map();
  });

  it("returns false if currentActiveLabelFields is empty", () => {
    const id = "looker1";
    const currentActiveLabelFields = new Set<string>();

    const result = syncAndCheckRefreshNeeded(id, lut, currentActiveLabelFields);
    expect(result).toBe(false);
    // lut shoiuldn't be modified
    expect(lut.has(id)).toBe(false);
  });

  it("returns true if lut is empty and there are active label fields", () => {
    const id = "looker1";
    const currentActiveLabelFields = new Set<string>(["segmentation1"]);

    const result = syncAndCheckRefreshNeeded(id, lut, currentActiveLabelFields);
    expect(result).toBe(true);

    // lut should now have the newly added fields for looker1
    const storedFields = lut.get(id);
    expect(storedFields).toEqual(new Set(["segmentation1"]));
  });

  it("returns true if the looker ID does not exist in lut (new looker)", () => {
    lut.set("existingLooker", new Set(["seg1"]));

    const currentActiveLabelFields = new Set(["seg1", "heatmap1"]);

    const newLookerId = "newLooker";
    const result = syncAndCheckRefreshNeeded(
      newLookerId,
      lut,
      currentActiveLabelFields
    );
    expect(result).toBe(true);

    const storedFieldsNewLooker = lut.get(newLookerId);
    expect(storedFieldsNewLooker).toEqual(new Set(["seg1", "heatmap1"]));

    const storedFieldsExistingLooker = lut.get("existingLooker");
    expect(storedFieldsExistingLooker).toEqual(new Set(["seg1"]));
  });

  it("returns false if lut already has the same fields", () => {
    const id = "looker2";
    lut.set(id, new Set(["seg1", "seg2"]));

    const currentActiveLabelFields = new Set(["seg1", "seg2"]);
    const result = syncAndCheckRefreshNeeded(id, lut, currentActiveLabelFields);

    expect(result).toBe(false);
    // lut remains the same, no changes
    expect(lut.get(id)).toEqual(new Set(["seg1", "seg2"]));
  });

  it("returns true if lut has a subset of the current fields (some new ones are missing)", () => {
    const id = "looker2";
    // lut only has "field1"
    lut.set(id, new Set(["field1"]));

    // incoming fields: "field1" (already known) and "field2" (new)
    const currentActiveLabelFields = new Set(["field1", "field2"]);
    const result = syncAndCheckRefreshNeeded(id, lut, currentActiveLabelFields);

    expect(result).toBe(true);

    // lut should have been updated to include both fields
    expect(lut.get(id)).toEqual(new Set(["field1", "field2"]));
  });

  it("does not keep returning true after lut is updated", () => {
    const id = "looker3";
    lut.set(id, new Set(["field1"]));
    // This call should add "field2"
    let result = syncAndCheckRefreshNeeded(
      id,
      lut,
      new Set(["field1", "field2"])
    );
    expect(result).toBe(true);
    expect(lut.get(id)).toEqual(new Set(["field1", "field2"]));

    // second call with the same fields should now return false
    result = syncAndCheckRefreshNeeded(id, lut, new Set(["field1", "field2"]));
    expect(result).toBe(false);
  });
});
