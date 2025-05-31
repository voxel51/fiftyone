import { describe, it, expect } from "vitest";
import { getDataView } from "./get-data-view";
import { PCDFieldType } from "./types";

const makeDataView = (buffer: ArrayBuffer) => {
  return new DataView(buffer);
};

describe("getDataView", () => {
  describe("type F (float)", () => {
    it("reads 4-byte float (Float32)", () => {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, 42.42, true);
      expect(getDataView(makeDataView(buf), 0, "F", 4, true)).toBeCloseTo(
        42.42
      );
      new DataView(buf).setFloat32(0, -13.5, false);
      expect(getDataView(makeDataView(buf), 0, "F", 4, false)).toBeCloseTo(
        -13.5
      );
    });
    it("reads 8-byte float (Float64)", () => {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, 123456.789, true);
      expect(getDataView(makeDataView(buf), 0, "F", 8, true)).toBeCloseTo(
        123456.789
      );
      new DataView(buf).setFloat64(0, -98765.4321, false);
      expect(getDataView(makeDataView(buf), 0, "F", 8, false)).toBeCloseTo(
        -98765.4321
      );
    });
  });

  describe("type I (signed int)", () => {
    it("reads 1-byte int (Int8)", () => {
      const buf = new ArrayBuffer(1);
      new DataView(buf).setInt8(0, -100);
      expect(getDataView(makeDataView(buf), 0, "I", 1, true)).toBe(-100);
    });
    it("reads 2-byte int (Int16)", () => {
      const buf = new ArrayBuffer(2);
      new DataView(buf).setInt16(0, -12345, true);
      expect(getDataView(makeDataView(buf), 0, "I", 2, true)).toBe(-12345);
      new DataView(buf).setInt16(0, 12345, false);
      expect(getDataView(makeDataView(buf), 0, "I", 2, false)).toBe(12345);
    });
    it("reads 4-byte int (Int32)", () => {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, -987654321, true);
      expect(getDataView(makeDataView(buf), 0, "I", 4, true)).toBe(-987654321);
      new DataView(buf).setInt32(0, 987654321, false);
      expect(getDataView(makeDataView(buf), 0, "I", 4, false)).toBe(987654321);
    });
  });

  describe("type U (unsigned int)", () => {
    it("reads 1-byte uint (Uint8)", () => {
      const buf = new ArrayBuffer(1);
      new DataView(buf).setUint8(0, 200);
      expect(getDataView(makeDataView(buf), 0, "U", 1, true)).toBe(200);
    });
    it("reads 2-byte uint (Uint16)", () => {
      const buf = new ArrayBuffer(2);
      new DataView(buf).setUint16(0, 54321, true);
      expect(getDataView(makeDataView(buf), 0, "U", 2, true)).toBe(54321);
      new DataView(buf).setUint16(0, 12345, false);
      expect(getDataView(makeDataView(buf), 0, "U", 2, false)).toBe(12345);
    });
    it("reads 4-byte uint (Uint32)", () => {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setUint32(0, 4000000000, true);
      expect(getDataView(makeDataView(buf), 0, "U", 4, true)).toBe(4000000000);
      new DataView(buf).setUint32(0, 1234567890, false);
      expect(getDataView(makeDataView(buf), 0, "U", 4, false)).toBe(1234567890);
    });
  });

  describe("invalid/unsupported cases", () => {
    it("returns undefined for unsupported type or size", () => {
      expect(
        getDataView(
          new DataView(new ArrayBuffer(4)),
          0,
          "X" as PCDFieldType,
          4,
          true
        )
      ).toBeUndefined();
    });
  });
});
