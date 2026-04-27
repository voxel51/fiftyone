import { describe, expect, it } from "vitest";
import { deserialize } from "@fiftyone/looker/src/numpy";
import { float32ToCompressedNumpy } from "./conversion";

const roundTrip = (arr: Float32Array, shape: number[]) => {
  const encoded = float32ToCompressedNumpy(arr, shape);
  return deserialize(encoded);
};

const readMask = (buffer: ArrayBuffer): Uint8Array => new Uint8Array(buffer);

describe("float32ToCompressedNumpy", () => {
  describe("round-trip with looker deserialize", () => {
    it("preserves a 2D mask with mixed values", () => {
      const shape = [2, 3];
      const arr = new Float32Array([0.0, 0.6, 1.0, -0.1, 0.3, 0.9]);

      const result = roundTrip(arr, shape);

      expect(result.shape).toEqual(shape);
      expect(result.channels).toBe(1);
      expect(result.arrayType).toBe("Uint8Array");
      expect(Array.from(readMask(result.buffer))).toEqual([0, 1, 1, 0, 0, 1]);
    });

    it("thresholds values strictly greater than 0.5 to 1", () => {
      const arr = new Float32Array([0.5, 0.50001, 0.499, 0.5]);
      const result = roundTrip(arr, [2, 2]);

      // 0.5 is NOT > 0.5, so it becomes 0
      expect(Array.from(readMask(result.buffer))).toEqual([0, 1, 0, 0]);
    });

    it("maps negative values to 0", () => {
      const arr = new Float32Array([-1, -0.0001, -100, -1e-8]);
      const result = roundTrip(arr, [1, 4]);

      expect(Array.from(readMask(result.buffer))).toEqual([0, 0, 0, 0]);
    });

    it("maps values in (0.5, 1] to 1 and [0, 0.5] to 0", () => {
      const arr = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
      const result = roundTrip(arr, [1, 5]);

      expect(Array.from(readMask(result.buffer))).toEqual([0, 0, 0, 1, 1]);
    });

    it("supports 3D shapes with channels", () => {
      const shape = [2, 2, 3];
      // 2x2 mask with 3 channels
      const arr = new Float32Array([
        0.9,
        0.1,
        0.8, // row 0 col 0
        0.2,
        0.7,
        0.3, // row 0 col 1
        0.6,
        0.4,
        1.0, // row 1 col 0
        0.0,
        0.55,
        0.5, // row 1 col 1
      ]);

      const result = roundTrip(arr, shape);

      expect(result.shape).toEqual([2, 2]);
      expect(result.channels).toBe(3);
      expect(Array.from(readMask(result.buffer))).toEqual([
        1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      ]);
    });

    it("handles a single-pixel mask", () => {
      const result = roundTrip(new Float32Array([0.9]), [1, 1]);

      expect(result.shape).toEqual([1, 1]);
      expect(result.channels).toBe(1);
      expect(Array.from(readMask(result.buffer))).toEqual([1]);
    });

    it("handles a larger mask (64x64)", () => {
      const h = 64;
      const w = 64;
      const arr = new Float32Array(h * w);
      const expected: number[] = [];

      for (let i = 0; i < arr.length; i++) {
        // alternating pattern with some noise
        const v = (i % 3 === 0 ? 0.8 : 0.2) + (i % 7 === 0 ? -0.5 : 0);
        arr[i] = v;
        expected.push(v > 0.5 ? 1 : v < 0 ? 0 : 0);
      }

      const result = roundTrip(arr, [h, w]);

      expect(result.shape).toEqual([h, w]);
      expect(readMask(result.buffer)).toHaveLength(h * w);
      expect(Array.from(readMask(result.buffer))).toEqual(expected);
    });

    it("produces header padding that is a multiple of 16 bytes (small shape)", () => {
      // Exercises the header-padding branch; a bad alignment would make pako
      // or the uint16 header length mismatch and deserialize would throw.
      const result = roundTrip(new Float32Array([1, 0, 1, 0]), [2, 2]);
      expect(result.shape).toEqual([2, 2]);
    });

    it("produces header padding that is a multiple of 16 bytes (3D shape)", () => {
      const result = roundTrip(new Float32Array(12), [2, 2, 3]);
      expect(result.shape).toEqual([2, 2]);
      expect(result.channels).toBe(3);
    });
  });

  describe("validation", () => {
    it("throws when shape is empty", () => {
      expect(() => float32ToCompressedNumpy(new Float32Array([]), [])).toThrow(
        /Invalid numpy shape/
      );
    });

    it("throws when shape contains a negative dimension", () => {
      expect(() =>
        float32ToCompressedNumpy(new Float32Array(4), [2, -2])
      ).toThrow(/Invalid numpy shape/);
    });

    it("throws when shape contains a non-integer dimension", () => {
      expect(() =>
        float32ToCompressedNumpy(new Float32Array(4), [2, 2.5])
      ).toThrow(/Invalid numpy shape/);
    });

    it("throws when shape does not match array length", () => {
      expect(() =>
        float32ToCompressedNumpy(new Float32Array(5), [2, 3])
      ).toThrow(/does not match array length/);
    });

    it("throws when the array contains NaN", () => {
      const arr = new Float32Array([0.1, NaN, 0.9, 0.2]);
      expect(() => float32ToCompressedNumpy(arr, [2, 2])).toThrow(
        /Invalid float at index 1/
      );
    });

    it("throws when the array contains Infinity", () => {
      const arr = new Float32Array([0.1, 0.2, Infinity, 0.4]);
      expect(() => float32ToCompressedNumpy(arr, [2, 2])).toThrow(
        /Invalid float at index 2/
      );
    });
  });

  describe("output format", () => {
    it("returns a valid base64 string", () => {
      const encoded = float32ToCompressedNumpy(
        new Float32Array([0.6, 0.2]),
        [1, 2]
      );
      expect(typeof encoded).toBe("string");
      expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });
});
