import { describe, expect, test } from "vitest";
import sizeBytesEstimate from "./size-bytes-estimate";

describe("sizeBytesEstimate tests", () => {
  test("Array values are summed", () => {
    expect(sizeBytesEstimate([1, "2"])).toBe(10);
  });

  test("ArrayBuffer returns byteLength", () => {
    const buffer = new ArrayBuffer(8);
    expect(sizeBytesEstimate(buffer)).toBe(buffer.byteLength);
  });

  test("boolean returns 8", () => {
    expect(sizeBytesEstimate(false)).toBe(8);
  });

  test("null and undefined return 1", () => {
    expect(sizeBytesEstimate(null)).toBe(1);
    expect(sizeBytesEstimate(undefined)).toBe(1);
  });

  test("number returns 8", () => {
    expect(sizeBytesEstimate(1)).toBe(8);
  });

  test("objects entries are summed", () => {
    expect(sizeBytesEstimate({ "1": 1 })).toBe(10);
  });

  test("string returns chars*2", () => {
    expect(sizeBytesEstimate("chars")).toBe(10);
  });

  test("non-objects return 0", () => {
    expect(sizeBytesEstimate(() => null)).toBe(0);
  });
});
