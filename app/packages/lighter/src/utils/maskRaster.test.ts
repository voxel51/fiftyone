/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { deserialize } from "@fiftyone/looker/src/numpy";
import { decodeMaskToRaster } from "./maskRaster";

// Real mask from a FiftyOne detection (base64 zlib numpy uint8). Shared with
// maskDecoding.test.ts / maskEncoding.test.ts.
const SAMPLE_MASK =
  "eJyb7BfqGxDJyFDGUK2eklqcXKRupaBek2SorqOgnpZfVFKUmBefX5SSChJ3S8wpTgWKF2ckFqQC+RoWhjoKRqaaOgq1CmQCLkZGBuyAEQJwSmDKMmIAnBJQKZIkGIeLBCOdJIaNRwZOgnHkSjAOE4mBDMRBmW2pWCRTTwJnRUE9CdJrKepJ4KwkGZABTglkSQwJqBw2cbAclAYAWfUiKw==";

describe("decodeMaskToRaster", () => {
  it("paints non-zero source pixels opaque white, leaves the rest transparent", () => {
    const overlayMask = deserialize(SAMPLE_MASK);
    const src = new Uint8Array(overlayMask.buffer);

    const { rgba, width, height, rawPixels } = decodeMaskToRaster(SAMPLE_MASK);
    expect(width).toBe(overlayMask.shape[1]);
    expect(height).toBe(overlayMask.shape[0]);
    expect(rgba.byteLength).toBe(width * height * 4);

    const px = new Uint8Array(rgba);
    let painted = 0;
    let transparent = 0;
    for (let i = 0; i < src.length; i++) {
      if (src[i] > 0) {
        // color-independent: opaque white (color applied later via GPU tint)
        expect(px[i * 4]).toBe(255);
        expect(px[i * 4 + 1]).toBe(255);
        expect(px[i * 4 + 2]).toBe(255);
        expect(px[i * 4 + 3]).toBe(255);
        expect(rawPixels[i]).toBe(1);
        painted++;
      } else {
        expect(px[i * 4 + 3]).toBe(0);
        expect(rawPixels[i]).toBe(0);
        transparent++;
      }
    }

    expect(painted).toBeGreaterThan(0);
    expect(transparent).toBeGreaterThan(0);
  });

  it("rejects a multi-channel mask", () => {
    const overlayMask = deserialize(SAMPLE_MASK);
    expect(() => decodeMaskToRaster({ ...overlayMask, channels: 3 })).toThrow(
      /single-channel/
    );
  });
});
