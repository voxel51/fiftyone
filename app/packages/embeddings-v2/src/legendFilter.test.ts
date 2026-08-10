import { describe, expect, it } from "vitest";
import { legendLabels, onLabels, soloLabel, toggleLabel } from "./legendFilter";

const LABELS = ["cat", "dog", "bird"];

describe("onLabels", () => {
  it("treats no filter as every class on", () => {
    expect(onLabels(null, LABELS)).toEqual(new Set(LABELS));
    expect(onLabels({ isMatching: false }, LABELS)).toEqual(new Set(LABELS));
  });

  it("reads inclusion and exclusion filters", () => {
    expect(onLabels({ values: ["cat"], exclude: false }, LABELS)).toEqual(
      new Set(["cat"]),
    );
    expect(onLabels({ values: ["cat"], exclude: true }, LABELS)).toEqual(
      new Set(["dog", "bird"]),
    );
  });

  it("ignores non-string filter values", () => {
    expect(onLabels({ values: [7, null], exclude: true }, LABELS)).toEqual(
      new Set(LABELS),
    );
  });
});

describe("toggleLabel", () => {
  it("writes exclusion filters", () => {
    expect(toggleLabel(null, LABELS, "dog")).toEqual({
      values: ["dog"],
      exclude: true,
    });

    const one = toggleLabel(null, LABELS, "cat");
    expect(toggleLabel(one, LABELS, "dog")).toEqual({
      values: ["cat", "dog"],
      exclude: true,
    });
  });

  // The dblclick gesture arrives as click-click-dblclick and relies on
  // the two toggles cancelling
  it("is its own inverse", () => {
    const once = toggleLabel(null, LABELS, "dog");
    expect(toggleLabel(once, LABELS, "dog")).toBeNull();
  });

  // The clicks after a double click must go on editing its inclusion —
  // rewriting it as an exclusion is what un-isolated the solo'd class
  it("keeps editing an inclusion filter as an inclusion", () => {
    const solo = soloLabel(null, LABELS, "dog");
    const two = toggleLabel(solo, LABELS, "cat");
    expect(two).toEqual({ values: ["cat", "dog"], exclude: false });
    expect(toggleLabel(two, LABELS, "cat")).toEqual({
      values: ["dog"],
      exclude: false,
    });
  });

  it("clears the filter when the last shown class is clicked off", () => {
    // An empty inclusion reads as no filter at all, so it can't be
    // written — and an exclusion here would undo the solo
    const solo = soloLabel(null, LABELS, "dog");
    expect(toggleLabel(solo, LABELS, "dog")).toBeNull();
  });

  it("collapses to no filter when an exclusion turns every class back on", () => {
    expect(
      toggleLabel({ values: ["cat"], exclude: true }, LABELS, "cat"),
    ).toBeNull();
  });

  it("stays an inclusion when it grows to every class", () => {
    expect(
      toggleLabel({ values: ["cat", "dog"], exclude: false }, LABELS, "bird"),
    ).toEqual({ values: LABELS, exclude: false });
  });

  it("allows toggling every class off", () => {
    let filter = toggleLabel(null, LABELS, "cat");
    filter = toggleLabel(filter, LABELS, "dog");
    filter = toggleLabel(filter, LABELS, "bird");
    expect(filter).toEqual({
      values: ["cat", "dog", "bird"],
      exclude: true,
    });
    expect(onLabels(filter, LABELS).size).toBe(0);
  });

  it("preserves excluded sidebar values outside the legend's class list", () => {
    // e.g. a >top-N class the user excluded directly in the sidebar
    const filter = { values: ["zebra"], exclude: true };
    expect(toggleLabel(filter, LABELS, "cat")).toEqual({
      values: ["cat", "zebra"],
      exclude: true,
    });
  });

  it("preserves included sidebar values outside the legend's class list", () => {
    const filter = { values: ["zebra"], exclude: false };
    expect(toggleLabel(filter, LABELS, "cat")).toEqual({
      values: ["cat", "zebra"],
      exclude: false,
    });
  });

  it("preserves extra filter properties", () => {
    const filter = { values: ["cat"], exclude: true, isMatching: true };
    expect(toggleLabel(filter, LABELS, "dog")).toMatchObject({
      isMatching: true,
    });
  });
});

describe("legendLabels", () => {
  const meta = (labels: Array<string | number>) => ({
    style: "categorical" as const,
    classes: labels.map((label) => ({ label, count: 1 })),
  });

  it("derives the off-set from the filter", () => {
    expect(
      legendLabels(meta(["cat", "dog"]), { values: ["dog"], exclude: true }),
    ).toEqual({ labels: ["cat", "dog"], off: new Set(["dog"]) });
    expect(legendLabels(meta(["cat", "dog"]), null)).toEqual({
      labels: ["cat", "dog"],
      off: new Set(),
    });
  });

  // Numeric classes can't map to a value-list sidebar filter; the
  // legend must render inert rather than write a broken filter
  it("is null for non-string classes and non-categorical fields", () => {
    expect(legendLabels(meta(["cat", 7]), null)).toBeNull();
    expect(legendLabels({ style: "continuous" }, null)).toBeNull();
    expect(legendLabels(null, null)).toBeNull();
  });
});

describe("soloLabel", () => {
  it("writes an inclusion filter naming only the isolated class", () => {
    // Exclusion could only name the OTHER known classes, leaving
    // unlisted values (missing, or past the top-N cap) visible
    expect(soloLabel(null, LABELS, "dog")).toEqual({
      values: ["dog"],
      exclude: false,
    });
  });

  it("restores all classes when the lone visible class is solo'd again", () => {
    const solo = soloLabel(null, LABELS, "dog");
    expect(soloLabel(solo, LABELS, "dog")).toBeNull();
  });

  it("recognizes an inclusion filter reached by other means as already solo'd", () => {
    expect(
      soloLabel({ values: ["dog"], exclude: false }, LABELS, "dog"),
    ).toBeNull();
  });

  it("drops any prior filter's foreign values and extra properties", () => {
    const filter = { values: ["zebra"], exclude: true, isMatching: true };
    expect(soloLabel(filter, LABELS, "dog")).toEqual({
      values: ["dog"],
      exclude: false,
    });
  });
});
