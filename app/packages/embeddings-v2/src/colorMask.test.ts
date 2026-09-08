import { describe, expect, it } from "vitest";
import { localColorMask } from "./colorMask";
import { MISSING_CATEGORY } from "./colors";
import type { ColorMeta, ColorValues } from "./protocol";

const META: ColorMeta = {
  style: "categorical",
  exact: true,
  classes: [
    { label: "cat", count: 2 },
    { label: "dog", count: 1 },
  ],
};

// Points: cat, dog, cat, missing
const COLUMN: ColorValues = {
  style: "categorical",
  indices: new Uint16Array([0, 1, 0, MISSING_CATEGORY]),
};

describe("localColorMask", () => {
  it("evaluates exclusion filters, keeping missing values", () => {
    const mask = localColorMask(
      { values: ["cat"], exclude: true },
      COLUMN,
      META,
    );
    expect(mask && [...mask]).toEqual([0, 1, 0, 1]);
  });

  it("evaluates inclusion filters, hiding missing values", () => {
    const mask = localColorMask(
      { values: ["cat"], exclude: false },
      COLUMN,
      META,
    );
    expect(mask && [...mask]).toEqual([1, 0, 1, 0]);
  });

  // The server's mask applies grid semantics we don't reproduce; every
  // shape we can't prove identical must fall back to it
  it("refuses anything it cannot evaluate faithfully", () => {
    const plain = { values: ["cat"], exclude: true };

    // Values the column has no vocabulary for (e.g. beyond the top-N cap)
    expect(
      localColorMask({ values: ["zebra"], exclude: true }, COLUMN, META),
    ).toBeNull();

    // Extra keys carry matching semantics (isMatching et al)
    expect(
      localColorMask({ ...plain, isMatching: true }, COLUMN, META),
    ).toBeNull();

    // Columns that collapsed list values are lossy
    expect(
      localColorMask(plain, COLUMN, { ...META, exact: undefined }),
    ).toBeNull();

    // Continuous filters are range-shaped, not value sets
    expect(
      localColorMask(
        plain,
        { style: "continuous", values: new Float32Array(4) },
        { style: "continuous" },
      ),
    ).toBeNull();

    // No value list at all (range or malformed filters)
    expect(localColorMask({ exclude: true }, COLUMN, META)).toBeNull();
  });
});
