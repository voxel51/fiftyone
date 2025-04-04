import { describe, expect, it } from "vitest";

import { shouldShowLabelTag } from "./util";

describe("shouldShowLabelTag", () => {
  it("handles missing tags and overlapping tags when filtering labels", () => {
    // when no label tag filter is applied
    expect(shouldShowLabelTag(null, null)).toBe(false);
    expect(shouldShowLabelTag(null, ["one"])).toBe(false);
    expect(shouldShowLabelTag([], ["one"])).toBe(true);
    expect(shouldShowLabelTag(undefined, undefined)).toBe(false);
    expect(shouldShowLabelTag(undefined, ["one"])).toBe(false);
    expect(shouldShowLabelTag([], ["one"])).toBe(true);

    // when filter tag is applied and overlaps
    expect(shouldShowLabelTag(["one"], ["one", "two", "three"])).toBe(true);

    // when filter tag is applied and does not overlap
    expect(shouldShowLabelTag(["one"], ["two"])).toBe(false);
    expect(shouldShowLabelTag(["one"], undefined)).toBe(false);
  });
});
