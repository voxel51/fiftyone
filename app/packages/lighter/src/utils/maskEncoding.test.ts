/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, test } from "vitest";
import { deserialize } from "@fiftyone/looker/src/numpy";
import { encodeMaskData } from "./maskEncoding";

/**
 * Real mask from an existing FiftyOne detection (base64-encoded,
 * zlib-compressed numpy uint8 array).
 */
const SAMPLE_MASK =
  "eJyb7BfqGxDJyFDGUK2eklqcXKRupaBek2SorqOgnpZfVFKUmBefX5SSChJ3S8wpTgWKF2ckFqQC+RoWhjoKRqaaOgq1CmQCLkZGBuyAEQJwSmDKMmIAnBJQKZIkGIeLBCOdJIaNRwZOgnHkSjAOE4mBDMRBmW2pWCRTTwJnRUE9CdJrKepJ4KwkGZABTglkSQwJqBw2cbAclAYAWfUiKw==";

const readMask = (buffer: ArrayBuffer): Uint8Array => new Uint8Array(buffer);

const roundTrip = async (mask: Uint8Array, shape: readonly number[]) => {
  const encoded = await encodeMaskData(mask, shape);
  return deserialize(encoded);
};

describe("maskEncoding", () => {
  test("encode → decode round-trip preserves shape and data", async () => {
    // Decode the original mask
    const original = deserialize(SAMPLE_MASK);

    // Re-encode
    const reEncoded = await encodeMaskData(
      new Uint8Array(original.buffer),
      original.shape
    );

    // Decode the re-encoded mask using the same real deserializer
    const roundTripped = deserialize(reEncoded);

    // Shape must match
    expect(roundTripped.shape).toEqual(original.shape);

    // Data must match byte-for-byte
    expect(new Uint8Array(roundTripped.buffer)).toEqual(
      new Uint8Array(original.buffer)
    );
  });

  test("decoded mask has expected numpy properties", () => {
    const mask = deserialize(SAMPLE_MASK);

    // Shape should be [height, width] with positive dimensions
    expect(mask.shape[0]).toBeGreaterThan(0);
    expect(mask.shape[1]).toBeGreaterThan(0);

    // Data length should equal height * width
    const data = new Uint8Array(mask.buffer);
    expect(data.length).toBe(mask.shape[0] * mask.shape[1]);

    // Mask values should be 0 or 1
    for (let i = 0; i < data.length; i++) {
      expect(data[i] === 0 || data[i] === 1).toBe(true);
    }
  });

  describe("round-trip with looker deserialize", () => {
    test("preserves a 2D mask with mixed values", async () => {
      const shape = [2, 3];
      const mask = new Uint8Array([0, 1, 1, 0, 0, 1]);

      const result = await roundTrip(mask, shape);

      expect(result.shape).toEqual(shape);
      expect(result.channels).toBe(1);
      expect(result.arrayType).toBe("Uint8Array");
      expect(Array.from(readMask(result.buffer))).toEqual([0, 1, 1, 0, 0, 1]);
    });

    test("supports 3D shapes with channels", async () => {
      const shape = [2, 2, 3];
      // 2x2 mask with 3 channels
      const mask = new Uint8Array([
        1, 0, 1, // row 0 col 0
        0, 1, 0, // row 0 col 1
        1, 0, 1, // row 1 col 0
        0, 1, 0, // row 1 col 1
      ]);

      const result = await roundTrip(mask, shape);

      expect(result.shape).toEqual([2, 2]);
      expect(result.channels).toBe(3);
      expect(Array.from(readMask(result.buffer))).toEqual([
        1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
      ]);
    });

    test("handles a single-pixel mask", async () => {
      const result = await roundTrip(new Uint8Array([1]), [1, 1]);

      expect(result.shape).toEqual([1, 1]);
      expect(result.channels).toBe(1);
      expect(Array.from(readMask(result.buffer))).toEqual([1]);
    });

    test("handles a larger mask (64x64)", async () => {
      const h = 64;
      const w = 64;
      const mask = new Uint8Array(h * w);

      for (let i = 0; i < mask.length; i++) {
        // alternating pattern
        mask[i] = i % 3 === 0 ? 1 : 0;
      }

      const result = await roundTrip(mask, [h, w]);

      expect(result.shape).toEqual([h, w]);
      expect(readMask(result.buffer)).toHaveLength(h * w);
      expect(Array.from(readMask(result.buffer))).toEqual(Array.from(mask));
    });

    test("produces header padding aligned to 64 bytes (small shape)", async () => {
      // Exercises the header-padding branch; a bad alignment would make the
      // uint16 header length mismatch and deserialize would throw.
      const result = await roundTrip(new Uint8Array([1, 0, 1, 0]), [2, 2]);
      expect(result.shape).toEqual([2, 2]);
    });

    test("produces header padding aligned to 64 bytes (3D shape)", async () => {
      const result = await roundTrip(new Uint8Array(12), [2, 2, 3]);
      expect(result.shape).toEqual([2, 2]);
      expect(result.channels).toBe(3);
    });
  });

  describe("validation", () => {
    test("throws when shape is empty", async () => {
      await expect(encodeMaskData(new Uint8Array(0), [])).rejects.toThrow(
        /Mask shape must be 2D or 3D/
      );
    });

    test("throws when shape contains a negative dimension", async () => {
      await expect(
        encodeMaskData(new Uint8Array(4), [2, -2])
      ).rejects.toThrow(/Mask shape must be 2D or 3D/);
    });

    test("throws when shape contains a non-integer dimension", async () => {
      await expect(
        encodeMaskData(new Uint8Array(4), [2, 2.5])
      ).rejects.toThrow(/Mask shape must be 2D or 3D/);
    });

    test("throws when shape does not match array length", async () => {
      await expect(
        encodeMaskData(new Uint8Array(5), [2, 3])
      ).rejects.toThrow(/does not match shape/);
    });
  });

  describe("output format", () => {
    test("returns a valid base64 string", async () => {
      const encoded = await encodeMaskData(new Uint8Array([1, 0]), [1, 2]);
      expect(typeof encoded).toBe("string");
      expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });
});
