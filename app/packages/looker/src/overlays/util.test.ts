import { beforeAll, describe, expect, it, vi } from "vitest";

import { COLOR_BY, getColor } from "@fiftyone/utilities";
import type { Coloring, CustomizeColor, LabelTagColor } from "../state";
import type { RegularLabel } from "./base";
import {
  getLabelAttributesText,
  getLabelColor,
  getPointColorByValue,
  shouldShowLabelTag,
} from "./util";

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

describe("getPointColorByValue", () => {
  beforeAll(() => {
    // isValidColor uses CSS.supports, which the node test environment lacks
    vi.stubGlobal("CSS", {
      supports: (_property: string, value: string) =>
        /^#[0-9a-f]{6}$/i.test(value),
    });
  });

  const coloring = {
    by: COLOR_BY.VALUE,
    pool: ["#111111", "#222222", "#333333"],
    seed: 0,
  } as unknown as Coloring;

  const field = {
    path: "pose",
    colorByAttribute: "occluded",
    valueColors: [
      { value: "true", color: "#ff0000" },
      { value: "none", color: "#00ff00" },
    ],
  } as CustomizeColor;

  const label = {
    label: "person",
    points: [
      [0.1, 0.1],
      [0.2, 0.2],
      [0.3, 0.3],
    ],
    occluded: [true, false, null],
  } as unknown as RegularLabel;

  it("resolves each point by its own list entry", () => {
    const args = { coloring, field, label, numPoints: 3 };
    // explicit value color, case-insensitive bool match
    expect(getPointColorByValue({ ...args, index: 0 })).toBe("#ff0000");
    // no value color for false — pool color keyed by the value
    expect(getPointColorByValue({ ...args, index: 1 })).toBe(
      getColor(coloring.pool, coloring.seed, false),
    );
    // none/null/undefined settings match null entries
    expect(getPointColorByValue({ ...args, index: 2 })).toBe("#00ff00");
  });

  it("does not apply outside color-by-value", () => {
    expect(
      getPointColorByValue({
        coloring: { ...coloring, by: COLOR_BY.FIELD } as Coloring,
        field,
        label,
        index: 0,
        numPoints: 3,
      }),
    ).toBeNull();
  });

  it("does not apply without a configured attribute", () => {
    expect(
      getPointColorByValue({
        coloring,
        field: { path: "pose" } as CustomizeColor,
        label,
        index: 0,
        numPoints: 3,
      }),
    ).toBeNull();
    expect(
      getPointColorByValue({
        coloring,
        field: undefined,
        label,
        index: 0,
        numPoints: 3,
      }),
    ).toBeNull();
  });

  it("does not apply when the attribute is not a parallel list", () => {
    // scalar attribute
    expect(
      getPointColorByValue({
        coloring,
        field: { ...field, colorByAttribute: "label" } as CustomizeColor,
        label,
        index: 0,
        numPoints: 3,
      }),
    ).toBeNull();
    // list of the wrong length
    expect(
      getPointColorByValue({
        coloring,
        field,
        label: { ...label, occluded: [true] } as unknown as RegularLabel,
        index: 0,
        numPoints: 3,
      }),
    ).toBeNull();
  });

  it("falls back to the pool keyed by value without value colors", () => {
    const bare = { ...field, valueColors: undefined } as CustomizeColor;
    expect(
      getPointColorByValue({
        coloring,
        field: bare,
        label,
        index: 0,
        numPoints: 3,
      }),
    ).toBe(getColor(coloring.pool, coloring.seed, true));
  });

  it("label-level color-by-value survives null entries in the list", () => {
    // regression: a per-point parallel list holds null for unset entries,
    // and the value-color list matching called toString on each element
    const color = getLabelColor({
      coloring,
      path: "pose",
      label,
      isTagged: false,
      labelTagColors: {} as LabelTagColor,
      customizeColorSetting: [field],
      embeddedDocType: "fiftyone.core.labels.Keypoint",
    });
    // "true" appears in the list, so its explicit value color wins
    expect(color).toBe("#ff0000");
  });
});
