import { describe, expect, it } from "vitest";
import { equalsNormalized, normalizeForCompare } from "./normalize";

const ISO = "2020-01-01T00:00:00.000Z";
const MS = Date.parse(ISO);

describe("normalizeForCompare", () => {
  it("collapses a DateTime wrapper to an ISO string", () => {
    expect(normalizeForCompare({ _cls: "DateTime", datetime: MS })).toBe(ISO);
  });

  it("collapses DateTime wrappers nested in objects and arrays", () => {
    expect(
      normalizeForCompare({
        created: { _cls: "DateTime", datetime: MS },
        history: [{ _cls: "DateTime", datetime: MS }],
      })
    ).toEqual({ created: ISO, history: [ISO] });
  });

  it("leaves a wrapper with a non-numeric datetime as a normalized object", () => {
    const input = { _cls: "DateTime", datetime: "nope" };
    expect(normalizeForCompare(input)).toEqual(input);
  });

  it("leaves a wrapper with an invalid (NaN) datetime untouched", () => {
    const input = { _cls: "DateTime", datetime: Number.NaN };
    expect(normalizeForCompare(input)).toEqual(input);
  });

  it("passes primitives through unchanged", () => {
    expect(normalizeForCompare(5)).toBe(5);
    expect(normalizeForCompare("x")).toBe("x");
    expect(normalizeForCompare(null)).toBeNull();
  });
});

describe("equalsNormalized", () => {
  it("treats a DateTime wrapper and its ISO string as equal", () => {
    expect(equalsNormalized({ _cls: "DateTime", datetime: MS }, ISO)).toBe(
      true
    );
  });

  it("compares deeply after normalization", () => {
    expect(
      equalsNormalized(
        { at: { _cls: "DateTime", datetime: MS }, n: 1 },
        { at: ISO, n: 1 }
      )
    ).toBe(true);
  });

  it("returns false for genuinely different values", () => {
    expect(equalsNormalized({ a: 1 }, { a: 2 })).toBe(false);
    expect(equalsNormalized(undefined, { a: 1 })).toBe(false);
  });
});
