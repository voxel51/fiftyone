import { describe, expect, it } from "vitest";
import { framePrimitiveReadOnlyReason } from "./useFramePrimitive";

describe("framePrimitiveReadOnlyReason", () => {
  it("a video's frame_number is read-only", () => {
    expect(
      framePrimitiveReadOnlyReason("frames.frame_number", false, null),
    ).toMatch(/frame clock/);
    expect(framePrimitiveReadOnlyReason("frames.weather", false, null)).toBe(
      null,
    );
  });

  it("a dynamic group's order-by field is read-only", () => {
    expect(
      framePrimitiveReadOnlyReason("timestamp", true, "timestamp"),
    ).toMatch(/orders this dynamic group/);
    expect(framePrimitiveReadOnlyReason("weather", true, "timestamp")).toBe(
      null,
    );
  });

  it("an unordered dynamic group has no read-only primitive", () => {
    expect(framePrimitiveReadOnlyReason("timestamp", true, null)).toBe(null);
  });
});
