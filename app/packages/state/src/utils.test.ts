import { describe, expect, it } from "vitest";
import { convertTargets } from "./utils";

describe("convertTargets", () => {
  it("upper cases rgb hex targets", () => {
    expect(
      convertTargets([{ target: "#ffffff", value: "white" }])
    ).toStrictEqual({ "#FFFFFF": { label: "white", intTarget: 1 } });
  });
});
