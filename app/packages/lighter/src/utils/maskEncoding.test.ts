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
});
