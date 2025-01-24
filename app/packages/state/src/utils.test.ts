import { describe, expect, it } from "vitest";
import { convertTargets, viewsAreEqual } from "./utils";

describe("convertTargets", () => {
  it("upper cases rgb hex targets", () => {
    expect(
      convertTargets([{ target: "#ffffff", value: "white" }])
    ).toStrictEqual({ "#FFFFFF": { label: "white", intTarget: 1 } });
  });
});

describe("filterView", () => {
  it("handles saved view string names and undefined values", () => {
    expect(viewsAreEqual("one", "one")).toBe(true);
    expect(viewsAreEqual("one", "two")).toBe(false);
    expect(viewsAreEqual("one", undefined)).toBe(false);
    expect(viewsAreEqual("one", [])).toBe(false);
    expect(viewsAreEqual([], [])).toBe(true);
  });
});
