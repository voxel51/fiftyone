import { isObjectEmpty } from "./isObjectEmpty";
import { describe, expect, it } from "vitest";

describe("isObjectEmpty", () => {
  it("should return true for an object with all properties null", () => {
    const obj = {
      prop1: null,
      prop2: null,
      prop3: null,
    };
    expect(isObjectEmpty(obj)).toBe(true);
  });

  it("should return true for an object with all properties undefined", () => {
    const obj = {
      prop1: undefined,
      prop2: undefined,
      prop3: undefined,
    };
    expect(isObjectEmpty(obj)).toBe(true);
  });

  it("should return true for an object with all properties empty", () => {
    const obj = {
      prop1: "",
      prop2: [],
      prop3: {},
    };
    expect(isObjectEmpty(obj)).toBe(true);
  });

  it("should return true for an empty object", () => {
    const obj = {};
    expect(isObjectEmpty(obj)).toBe(true);
  });

  it("should return false for an object with some properties not null, undefined, or empty", () => {
    const obj = {
      prop1: "value",
      prop2: null,
      prop3: undefined,
    };
    expect(isObjectEmpty(obj)).toBe(false);
  });

  it("should return false if properties equal 0 or explicit false", () => {
    const obj = {
      prop1: 0,
      prop2: false,
    };
    expect(isObjectEmpty(obj)).toBe(false);
  });
});
