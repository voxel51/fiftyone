/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { framePrimitiveReadOnlyReason } from "./useFramePrimitive";

describe("framePrimitiveReadOnlyReason", () => {
  it("a video's frame_number is read-only", () => {
    expect(
      framePrimitiveReadOnlyReason("frames.frame_number", false, null, null),
    ).toMatch(/frame clock/);
    expect(
      framePrimitiveReadOnlyReason("frames.weather", false, null, null),
    ).toBe(null);
  });

  it("a dynamic group's order-by field is read-only", () => {
    expect(
      framePrimitiveReadOnlyReason("timestamp", true, "timestamp", "scene"),
    ).toMatch(/orders this dynamic group/);
    expect(
      framePrimitiveReadOnlyReason("weather", true, "timestamp", "scene"),
    ).toBe(null);
  });

  it("a dynamic group's group-by field is read-only", () => {
    expect(
      framePrimitiveReadOnlyReason("scene", true, "timestamp", "scene"),
    ).toMatch(/groups this dynamic group/);
  });

  it("an unordered dynamic group has no read-only primitive", () => {
    expect(framePrimitiveReadOnlyReason("timestamp", true, null, null)).toBe(
      null,
    );
  });

  it("the group-by and order-by fields edit freely outside a dynamic group video", () => {
    expect(
      framePrimitiveReadOnlyReason("frames.scene", false, "timestamp", "scene"),
    ).toBe(null);
  });
});
