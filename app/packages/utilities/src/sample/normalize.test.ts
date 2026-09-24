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

  it("collapses the sample-read non-finite strings under gated keys", () => {
    expect(normalizeForCompare("nan", "points")).toBeNaN();
    expect(normalizeForCompare("inf", "confidence")).toBe(Infinity);
    expect(normalizeForCompare("-inf", "points")).toBe(-Infinity);
    // the key context survives array nesting: a points row keeps it
    expect(normalizeForCompare({ points: [["nan", "nan"]] })).toEqual({
      points: [[NaN, NaN]],
    });
  });

  it("leaves non-finite strings alone outside the gated keys", () => {
    // normalized trees feed patch payloads, so an ungated collapse would
    // rewrite a str attribute whose literal value is "nan" into float NaN
    expect(normalizeForCompare("nan")).toBe("nan");
    expect(normalizeForCompare({ material: "nan" })).toEqual({
      material: "nan",
    });
    expect(normalizeForCompare({ tags: ["inf", "-inf"] })).toEqual({
      tags: ["inf", "-inf"],
    });
  });

  it("does not leak a gated key's context into sibling or child keys", () => {
    expect(normalizeForCompare({ points: [{ note: "nan" }] })).toEqual({
      points: [{ note: "nan" }],
    });
  });

  it("leaves ordinary strings alone even under gated keys", () => {
    expect(normalizeForCompare("nano", "points")).toBe("nano");
    expect(normalizeForCompare("NaN", "confidence")).toBe("NaN");
    expect(normalizeForCompare("constructor", "points")).toBe("constructor");
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

  // Regression (2026-09-23): JSON drops `undefined` members, so a label
  // carrying one could never compare equal to its own persisted echo
  it("treats a member set to undefined as absent, as JSON does", () => {
    expect(equalsNormalized({ a: 1, index: undefined }, { a: 1 })).toBe(true);
    expect(equalsNormalized({ a: 1, index: 0 }, { a: 1 })).toBe(false);
    expect(normalizeForCompare({ a: 1, b: { c: undefined } })).toStrictEqual({
      a: 1,
      b: {},
    });
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
    // delivers non-finite doubles as strings; the transient holds real NaN.
    // Production compares label objects, so the `points` key is in the tree.
    expect(
      equalsNormalized(
        {
          points: [
            [0.4, 0.3],
            [NaN, NaN],
          ],
        },
        {
          points: [
            [0.4, 0.3],
            ["nan", "nan"],
          ],
        },
      ),
    ).toBe(true);
  });

  it("accepts a field-name seed for bare values", () => {
    // reconcile compares values already plucked out of the label; the caller
    // passes the governing key so the gate still applies
    expect(equalsNormalized([NaN, NaN], ["nan", "nan"], "points")).toBe(true);
    expect(equalsNormalized([NaN, NaN], ["nan", "nan"])).toBe(false);
  });

  it("keeps distinct non-finite values distinct", () => {
    expect(equalsNormalized("nan", "inf", "points")).toBe(false);
    expect(equalsNormalized(NaN, "inf", "confidence")).toBe(false);
  });
});
