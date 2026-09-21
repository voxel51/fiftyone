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
      }),
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

  it("unwraps extended-JSON $numberDouble wrappers", () => {
    expect(normalizeForCompare({ $numberDouble: "NaN" })).toBeNaN();
    expect(normalizeForCompare({ $numberDouble: "Infinity" })).toBe(Infinity);
    expect(normalizeForCompare({ $numberDouble: "-Infinity" })).toBe(-Infinity);
    expect(normalizeForCompare({ $numberDouble: "0.5" })).toBe(0.5);
  });

  it("leaves objects with extra keys beside $numberDouble untouched", () => {
    const input = { $numberDouble: "NaN", note: "not a wrapper" };
    expect(normalizeForCompare(input)).toEqual(input);
  });

  it("collapses the sample-read non-finite strings to numbers", () => {
    expect(normalizeForCompare("nan")).toBeNaN();
    expect(normalizeForCompare("inf")).toBe(Infinity);
    expect(normalizeForCompare("-inf")).toBe(-Infinity);
  });

  it("leaves ordinary strings alone", () => {
    expect(normalizeForCompare("nano")).toBe("nano");
    expect(normalizeForCompare("NaN")).toBe("NaN");
    expect(normalizeForCompare("constructor")).toBe("constructor");
  });
});

describe("equalsNormalized", () => {
  it("treats a DateTime wrapper and its ISO string as equal", () => {
    expect(equalsNormalized({ _cls: "DateTime", datetime: MS }, ISO)).toBe(
      true,
    );
  });

  it("compares deeply after normalization", () => {
    expect(
      equalsNormalized(
        { at: { _cls: "DateTime", datetime: MS }, n: 1 },
        { at: ISO, n: 1 },
      ),
    ).toBe(true);
  });

  it("returns false for genuinely different values", () => {
    expect(equalsNormalized({ a: 1 }, { a: 2 })).toBe(false);
    expect(equalsNormalized(undefined, { a: 1 })).toBe(false);
  });

  it("treats a NaN keypoint hole and its server echo as equal", () => {
    // the server encodes a skipped node's [NaN, NaN] coordinate as
    // extended JSON; an unequal compare here re-sends the patch forever
    expect(
      equalsNormalized(
        [
          [0.4, 0.3],
          [NaN, NaN],
        ],
        [
          [0.4, 0.3],
          [{ $numberDouble: "NaN" }, { $numberDouble: "NaN" }],
        ],
      ),
    ).toBe(true);
  });

  it("still distinguishes different finite values inside wrappers", () => {
    expect(equalsNormalized([0.4], [{ $numberDouble: "0.5" }])).toBe(false);
  });

  it("treats a real-NaN hole and its read-shaped 'nan' string as equal", () => {
    // the PATCH echo rebases the source through the read transformer, which
    // delivers non-finite doubles as strings; the transient holds real NaN
    expect(
      equalsNormalized(
        [
          [0.4, 0.3],
          [NaN, NaN],
        ],
        [
          [0.4, 0.3],
          ["nan", "nan"],
        ],
      ),
    ).toBe(true);
  });

  it("keeps distinct non-finite values distinct", () => {
    expect(equalsNormalized("nan", "inf")).toBe(false);
    expect(equalsNormalized(NaN, "inf")).toBe(false);
  });
});
