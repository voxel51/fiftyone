import { describe, expect, it } from "vitest";

import { shouldShowLabelTag } from "./util";

describe("shouldShowLabelTag", () => {
  it("handles missing tags", () => {
    expect(shouldShowLabelTag(undefined, undefined)).toBe(false);
    expect(shouldShowLabelTag(undefined, ["one"])).toBe(true);
    expect(shouldShowLabelTag(["one"], ["one"])).toBe(true);
    expect(shouldShowLabelTag(["one"], ["two"])).toBe(false);
  });
});
