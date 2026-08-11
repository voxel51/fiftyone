import { describe, expect, it } from "vitest";

import { numberField as foxgloveNumberField } from "./foxglove/protobuf/records";
import { numberField as rosNumberField } from "./ros/common";

describe("decoded numeric field coercion", () => {
  it.each([
    ["number", 12, 12],
    ["bigint", 12n, 12],
  ])("coerces %s values in both decoder families", (_kind, value, expected) => {
    expect(foxgloveNumberField({ value }, "value", undefined, -1)).toBe(
      expected,
    );
    expect(rosNumberField({ value }, "value", undefined, -1)).toBe(expected);
  });

  it("keeps ROS Long-like support explicit", () => {
    const value = { toNumber: () => 12 };

    expect(foxgloveNumberField({ value }, "value", undefined, -1)).toBe(-1);
    expect(rosNumberField({ value }, "value", undefined, -1)).toBe(12);
  });

  it("uses the caller fallback for absent and unsupported values", () => {
    for (const record of [{}, { value: "12" }]) {
      expect(foxgloveNumberField(record, "value", undefined, -1)).toBe(-1);
      expect(rosNumberField(record, "value", undefined, -1)).toBe(-1);
    }
  });
});
