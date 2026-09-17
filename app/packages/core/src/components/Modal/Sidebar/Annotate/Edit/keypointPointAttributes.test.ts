import { describe, expect, it } from "vitest";
import type { AttributeConfig } from "../SchemaManager/utils";
import {
  buildPointAttributeList,
  CONFIDENCE_FALLBACK_SPEC,
  getKeypointPointKeys,
  getPointAttributeSpecs,
  toPointAttributeValue,
} from "./keypointPointAttributes";

const attr = (overrides: Partial<AttributeConfig>): AttributeConfig => ({
  name: "attr",
  type: "str",
  ...overrides,
});

describe("getKeypointPointKeys", () => {
  it("always contains the reserved names", () => {
    const keys = getKeypointPointKeys(undefined);
    expect(keys.has("confidence")).toBe(true);
    expect(keys.has("visible")).toBe(true);
    expect(keys.size).toBe(2);
  });

  it("adds point-scoped attributes and ignores label-level ones", () => {
    const keys = getKeypointPointKeys([
      attr({ name: "occluded", type: "bool", scope: "point" }),
      attr({ name: "pose_quality", type: "str" }),
      attr({ name: "grade", type: "str", scope: "field" }),
    ]);
    expect(keys.has("occluded")).toBe(true);
    expect(keys.has("pose_quality")).toBe(false);
    expect(keys.has("grade")).toBe(false);
  });
});

describe("getPointAttributeSpecs", () => {
  it("maps point-scoped attributes and skips the rest", () => {
    const specs = getPointAttributeSpecs([
      attr({
        name: "occluded",
        type: "bool",
        scope: "point",
        read_only: true,
      }),
      attr({
        name: "grade",
        type: "str",
        scope: "point",
        values: ["a", "b"],
      }),
      attr({ name: "label_level", type: "str" }),
      // unsupported element type — the validator rejects these, skip defensively
      attr({ name: "weird", type: "dict", scope: "point" }),
    ]);
    expect(specs).toEqual([
      {
        name: "occluded",
        type: "bool",
        values: undefined,
        range: undefined,
        readOnly: true,
      },
      {
        name: "grade",
        type: "str",
        values: ["a", "b"],
        range: undefined,
        readOnly: undefined,
      },
    ]);
  });

  it("carries a float attribute's range", () => {
    const specs = getPointAttributeSpecs([
      attr({ name: "score", type: "float", scope: "point", range: [0, 10] }),
    ]);
    expect(specs[0].range).toEqual([0, 10]);
  });
});

describe("toPointAttributeValue", () => {
  it("treats NaN and 'nan' strings as unset for numeric types", () => {
    expect(toPointAttributeValue("float", NaN)).toBeNull();
    expect(toPointAttributeValue("float", "nan")).toBeNull();
    expect(toPointAttributeValue("float", 0.5)).toBe(0.5);
    expect(toPointAttributeValue("int", NaN)).toBeNull();
    expect(toPointAttributeValue("int", 2)).toBe(2);
  });

  it("keeps 'nan' as a legal string value for str attributes", () => {
    expect(toPointAttributeValue("str", "nan")).toBe("nan");
    expect(toPointAttributeValue("str", null)).toBeNull();
  });

  it("only accepts real booleans for bool attributes", () => {
    expect(toPointAttributeValue("bool", true)).toBe(true);
    expect(toPointAttributeValue("bool", false)).toBe(false);
    expect(toPointAttributeValue("bool", null)).toBeNull();
    expect(toPointAttributeValue("bool", NaN)).toBeNull();
    expect(toPointAttributeValue("bool", "true")).toBeNull();
  });
});

describe("buildPointAttributeList", () => {
  it("fills float holes with NaN, never null", () => {
    const list = buildPointAttributeList("float", undefined, 3, 1, 0.7);
    expect(list[0]).toBeNaN();
    expect(list[1]).toBe(0.7);
    expect(list[2]).toBeNaN();
  });

  it("sanitizes read-side 'nan' strings when preserving float entries", () => {
    const list = buildPointAttributeList(
      "float",
      ["nan", 0.2, "nan"],
      3,
      0,
      0.9,
    );
    expect(list[0]).toBe(0.9);
    expect(list[1]).toBe(0.2);
    expect(list[2]).toBeNaN();
  });

  it("fills bool holes with null, never NaN", () => {
    const list = buildPointAttributeList("bool", [true, null], 3, 2, true);
    expect(list).toEqual([true, null, true]);
  });

  it("clears the edited index back to the hole filler", () => {
    expect(
      buildPointAttributeList("float", [0.1, 0.2], 2, 0, null)[0],
    ).toBeNaN();
    expect(buildPointAttributeList("str", ["a", "b"], 2, 1, null)).toEqual([
      "a",
      null,
    ]);
  });

  it("pads to the skeleton length when the existing list is short", () => {
    const list = buildPointAttributeList("int", [4], 3, 1, 7);
    expect(list).toEqual([4, 7, null]);
  });

  it("has a 0–1 range on the confidence fallback", () => {
    expect(CONFIDENCE_FALLBACK_SPEC).toEqual({
      name: "confidence",
      type: "float",
      range: [0, 1],
    });
  });
});
