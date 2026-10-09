import { describe, expect, it } from "vitest";
import { scaleEnds, toNumber, valueAt, valueLabel } from "./values";

const DAY = 86_400_000;

describe("toNumber", () => {
  it("reads numbers, dates and ids on their scales", () => {
    expect(toNumber(0.25, "NUMBER")).toBe(0.25);
    expect(toNumber({ _cls: "DateTime", datetime: 1000 }, "DATE")).toBe(1000);
    // an ObjectId's first four bytes are its creation time in seconds
    expect(toNumber("00000064aaaaaaaaaaaaaaaa", "ID")).toBe(100_000);
    expect(toNumber("x", "NUMBER")).toBeUndefined();
  });
});

describe("scaleEnds", () => {
  const bounds = { min: 10, max: 30, scale: "NUMBER" as const };

  it("runs from the first value in view order to the last", () => {
    expect(scaleEnds(bounds, false)).toEqual({
      first: 10,
      last: 30,
      scale: "NUMBER",
    });
    expect(scaleEnds(bounds, true)).toEqual({
      first: 30,
      last: 10,
      scale: "NUMBER",
    });
  });

  it("has no ends without a scale (strings and booleans)", () => {
    expect(scaleEnds({ min: "a", max: "z", scale: null }, false)).toBe(
      undefined,
    );
    expect(scaleEnds(null, false)).toBe(undefined);
  });
});

describe("valueAt", () => {
  it("interpolates between the ends, clamped to them", () => {
    const ends = { first: 30, last: 10 };
    expect(valueAt(0, ends)).toBe(30);
    expect(valueAt(0.25, ends)).toBe(25);
    expect(valueAt(2, ends)).toBe(10);
  });
});

describe("valueLabel", () => {
  it("labels numbers at a precision fit for the range", () => {
    const unit = { first: 0, last: 1, scale: "NUMBER" as const };
    expect(valueLabel(0.4567, unit)).toBe("0.46");
    const wide = { first: 0, last: 5000, scale: "NUMBER" as const };
    expect(valueLabel(1234.5, wide)).toBe("1.23k");
    expect(valueLabel(12.5, wide)).toBe("13");
  });

  it("labels dates like a calendar for the range", () => {
    const start = Date.UTC(2020, 0, 15);
    const years = {
      first: start,
      last: start + 5 * 365 * DAY,
      scale: "DATE" as const,
    };
    expect(valueLabel(start, years)).toBe("Jan 2020");
    const weeks = {
      first: start,
      last: start + 30 * DAY,
      scale: "DATE" as const,
    };
    expect(valueLabel(start, weeks)).toBe("Jan 15, 2020");
    const hours = { first: start, last: start + DAY / 2, scale: "ID" as const };
    expect(valueLabel(start + 3_600_000, hours)).toBe("Jan 15, 01:00 AM");
  });
});
