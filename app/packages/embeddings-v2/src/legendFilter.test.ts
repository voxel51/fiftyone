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

  // Representation is a pure function of the toggle set: an inclusion
  // filter (e.g. hand-written in the sidebar) converts to the
  // equivalent exclusion on the first legend click
  it("converts inclusion filters to exclusion", () => {
    const included = { values: ["cat"], exclude: false };
    expect(toggleLabel(included, LABELS, "dog")).toEqual({
      values: ["bird"],
      exclude: true,
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

  it("drops an inclusion filter's foreign values", () => {
    // Inclusion of an unlisted value cannot survive in exclusion form —
    // carrying "zebra" into the exclusion list would invert its meaning
    const filter = { values: ["zebra"], exclude: false };
    expect(toggleLabel(filter, LABELS, "cat")).toEqual({
      values: ["dog", "bird"],
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
  it("writes the exclusion of every other class", () => {
    expect(soloLabel(null, LABELS, "dog")).toEqual({
      values: ["cat", "bird"],
      exclude: true,
    });
  });

  // Identical toggle states must produce identical filters no matter
  // the click path — otherwise the same legend state renders
  // differently (sidebar mode, grey/unlisted points) by history
  it("is exactly equivalent to single-clicking every other class off", () => {
    const viaSolo = soloLabel(null, LABELS, "dog");
    let viaToggles = toggleLabel(null, LABELS, "cat");
    viaToggles = toggleLabel(viaToggles, LABELS, "bird");
    expect(viaSolo).toEqual(viaToggles);
  });

  it("restores all classes when the lone visible class is solo'd again", () => {
    const solo = soloLabel(null, LABELS, "dog");
    expect(soloLabel(solo, LABELS, "dog")).toBeNull();
  });
});
