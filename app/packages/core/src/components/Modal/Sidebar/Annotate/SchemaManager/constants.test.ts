import { describe, expect, it } from "vitest";
import { isSystemReadOnlyField } from "./constants";

describe("isSystemReadOnlyField", () => {
  it("treats a video frame's number as a system field", () => {
    expect(isSystemReadOnlyField("frames.frame_number")).toBe(true);
    expect(isSystemReadOnlyField("frames.weather")).toBe(false);
    expect(isSystemReadOnlyField("frame_number")).toBe(false);
  });
});
