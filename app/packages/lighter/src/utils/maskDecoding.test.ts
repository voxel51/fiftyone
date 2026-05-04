/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { deserialize } from "@fiftyone/looker/src/numpy";
import { decodeMask } from "./maskDecoding";

/**
 * Real mask from an existing FiftyOne detection (base64-encoded,
 * zlib-compressed numpy uint8 array). Identical to the fixture used by
 * `maskEncoding.test.ts`, so failures here vs. there localize the bug.
 */
const SAMPLE_MASK =
  "eJyb7BfqGxDJyFDGUK2eklqcXKRupaBek2SorqOgnpZfVFKUmBefX5SSChJ3S8wpTgWKF2ckFqQC+RoWhjoKRqaaOgq1CmQCLkZGBuyAEQJwSmDKMmIAnBJQKZIkGIeLBCOdJIaNRwZOgnHkSjAOE4mBDMRBmW2pWCRTTwJnRUE9CdJrKepJ4KwkGZABTglkSQwJqBw2cbAclAYAWfUiKw==";

describe("decodeMask", () => {
  /**
   * jsdom doesn't provide `ImageData` or `createImageBitmap`. Stub both so
   * tests can inspect the RGBA buffer that would have been rasterized.
   */
  type StubImageData = {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  };
  let lastImageData: StubImageData | undefined;

  beforeEach(() => {
    lastImageData = undefined;

    vi.stubGlobal(
      "ImageData",
      class {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      }
    );

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (data: StubImageData) => {
        lastImageData = data;
        return data as unknown as ImageBitmap;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("rawPixels normalizes source values for hit-testing", async () => {
    const overlayMask = deserialize(SAMPLE_MASK);
    const [height, width] = overlayMask.shape;

    const { rawPixels } = await decodeMask(SAMPLE_MASK, "#ffffff");

    expect(rawPixels.width).toBe(width);
    expect(rawPixels.height).toBe(height);
    expect(rawPixels.src.length).toBe(width * height);
    expect(rawPixels.src).toEqual(
      Uint8Array.from(new Uint8Array(overlayMask.buffer), (value) =>
        value > 0 ? 1 : 0
      )
    );
  });

  test("paints non-zero mask pixels with the requested color", async () => {
    await decodeMask(SAMPLE_MASK, "#ff0000");

    expect(lastImageData).toBeDefined();
    const { data, width, height } = lastImageData!;
    const overlayMask = deserialize(SAMPLE_MASK);
    const src = new Uint8Array(overlayMask.buffer);

    expect(width).toBe(overlayMask.shape[1]);
    expect(height).toBe(overlayMask.shape[0]);

    let paintedCount = 0;
    let transparentCount = 0;

    for (let i = 0; i < src.length; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3];

      if (src[i] > 0) {
        // Painted: full red, opaque.
        expect(r).toBe(255);
        expect(g).toBe(0);
        expect(b).toBe(0);
        expect(a).toBe(255);
        paintedCount++;
      } else {
        // Background: untouched (zeroed RGBA buffer).
        expect(a).toBe(0);
        transparentCount++;
      }
    }

    // Sanity: the fixture has a mix of mask and background pixels.
    expect(paintedCount).toBeGreaterThan(0);
    expect(transparentCount).toBeGreaterThan(0);
  });

  test("respects the alpha component of an rgba(...) color", async () => {
    await decodeMask(SAMPLE_MASK, "rgba(0, 128, 0, 0.5)");

    expect(lastImageData).toBeDefined();
    const { data } = lastImageData!;
    const overlayMask = deserialize(SAMPLE_MASK);
    const src = new Uint8Array(overlayMask.buffer);

    // Find one painted pixel and assert its RGBA matches the parsed color.
    const paintedIndex = src.findIndex((v) => v > 0);
    expect(paintedIndex).toBeGreaterThanOrEqual(0);

    const r = data[paintedIndex * 4];
    const g = data[paintedIndex * 4 + 1];
    const b = data[paintedIndex * 4 + 2];
    const a = data[paintedIndex * 4 + 3];

    expect(r).toBe(0);
    expect(g).toBe(128);
    expect(b).toBe(0);
    // 0.5 alpha → ~128 (Math.round(0.5 * 255) = 128).
    expect(a).toBe(128);
  });

  test("returns a bitmap promise", async () => {
    const { bitmap } = await decodeMask(SAMPLE_MASK, "#ffffff");
    expect(bitmap).toBeDefined();
  });
});
