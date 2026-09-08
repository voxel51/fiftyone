import { describe, expect, it } from "vitest";

import { getLabelAttributesText, shouldShowLabelTag } from "./util";

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

describe("getLabelAttributesText", () => {
  const label = {
    label: "cat",
    confidence: 0.955555,
    index: 3,
    verified: true,
    notes: null,
    scores: [0.5, 0.25],
  };

  it("renders the label attribute by default semantics", () => {
    expect(getLabelAttributesText(label, ["label"])).toBe("cat");
  });

  it("joins multiple attributes with commas", () => {
    expect(getLabelAttributesText(label, ["label", "confidence"])).toBe(
      "cat, 0.956",
    );
  });

  it("formats booleans, integers, and lists", () => {
    expect(getLabelAttributesText(label, ["verified", "index", "scores"])).toBe(
      "True, 3, 0.5, 0.25",
    );
  });

  it("skips missing and null values", () => {
    expect(getLabelAttributesText(label, ["notes", "missing", "label"])).toBe(
      "cat",
    );
    expect(getLabelAttributesText(label, ["notes", "missing"])).toBe("");
  });
});
