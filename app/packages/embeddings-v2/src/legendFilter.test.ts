import { describe, expect, it } from "vitest";
import { onLabels, soloLabel, toggleLabel } from "./legendFilter";

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
  // Exclusion keeps a capped field's unlisted (>top-N) classes visible
  it("starts fresh toggles in exclusion mode", () => {
    expect(toggleLabel(null, LABELS, "dog")).toEqual({
      values: ["dog"],
      exclude: true,
    });
  });

  // The dblclick gesture arrives as click-click-dblclick and relies on
  // the two toggles cancelling
  it("is its own inverse", () => {
    const once = toggleLabel(null, LABELS, "dog");
    expect(toggleLabel(once, LABELS, "dog")).toBeNull();

    const solo = { values: ["cat"], exclude: false };
    const flipped = toggleLabel(solo, LABELS, "dog");
    expect(onLabels(toggleLabel(flipped, LABELS, "dog"), LABELS)).toEqual(
      onLabels(solo, LABELS),
    );
  });

  it("accumulates toggles in the filter's current mode", () => {
    const one = toggleLabel(null, LABELS, "cat");
    expect(toggleLabel(one, LABELS, "dog")).toEqual({
      values: ["cat", "dog"],
      exclude: true,
    });

    const included = { values: ["cat"], exclude: false };
    expect(toggleLabel(included, LABELS, "dog")).toEqual({
      values: ["cat", "dog"],
      exclude: false,
    });
  });

  it("collapses to no filter when every class is back on", () => {
    expect(
      toggleLabel({ values: ["cat"], exclude: true }, LABELS, "cat"),
    ).toBeNull();
    expect(
      toggleLabel({ values: ["cat", "dog"], exclude: false }, LABELS, "bird"),
    ).toBeNull();
  });

  it("allows toggling every class off", () => {
    let filter = toggleLabel(null, LABELS, "cat");
    filter = toggleLabel(filter, LABELS, "dog");
    filter = toggleLabel(filter, LABELS, "bird");
    expect(onLabels(filter, LABELS).size).toBe(0);
  });

  it("preserves sidebar values outside the legend's class list", () => {
    // e.g. a >top-N class the user filtered on directly in the sidebar
    const filter = { values: ["zebra"], exclude: true };
    expect(toggleLabel(filter, LABELS, "cat")).toEqual({
      values: ["cat", "zebra"],
      exclude: true,
    });
  });

  it("preserves extra filter properties", () => {
    const filter = { values: ["cat"], exclude: true, isMatching: true };
    expect(toggleLabel(filter, LABELS, "dog")).toMatchObject({
      isMatching: true,
    });
  });
});

describe("soloLabel", () => {
  it("isolates a class as an inclusion filter", () => {
    expect(soloLabel(null, LABELS, "dog")).toEqual({
      values: ["dog"],
      exclude: false,
    });
    expect(
      soloLabel({ values: ["cat"], exclude: true }, LABELS, "dog"),
    ).toEqual({ values: ["dog"], exclude: false });
  });

  it("restores all classes when the lone visible class is solo'd again", () => {
    expect(
      soloLabel({ values: ["dog"], exclude: false }, LABELS, "dog"),
    ).toBeNull();
  });
});
