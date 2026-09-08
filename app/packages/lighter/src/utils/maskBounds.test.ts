/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, test } from "vitest";
import { maskBounds } from "./maskBounds";

/**
 * Builds an `ImageData`-shaped object large enough for `maskBounds` to
 * iterate. jsdom doesn't ship `ImageData`, but the function only reads
 * `data`, `width`, `height` — a plain object is enough.
 */
const makeImageData = (
  width: number,
  height: number,
  paint: (px: number, py: number) => boolean,
): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      if (paint(px, py)) {
        // Only the alpha byte matters for `maskBounds`.
        data[(py * width + px) * 4 + 3] = 255;
      }
    }
  }
  return { data, width, height } as ImageData;
};

describe("maskBounds", () => {
  test("returns null when fully transparent", () => {
    const image = makeImageData(8, 8, () => false);
    expect(maskBounds(image)).toBeNull();
  });

  test("computes a single-pixel bbox for one opaque pixel", () => {
    const image = makeImageData(8, 8, (px, py) => px === 3 && py === 5);
    expect(maskBounds(image)).toEqual({
      minX: 3,
      minY: 5,
      maxX: 3,
      maxY: 5,
    });
  });

  test("computes a tight bbox around a rectangular opaque region", () => {
    // Opaque rectangle from (2,1) to (5,4), inclusive.
    const image = makeImageData(
      8,
      8,
      (px, py) => px >= 2 && px <= 5 && py >= 1 && py <= 4,
    );
    expect(maskBounds(image)).toEqual({
      minX: 2,
      minY: 1,
      maxX: 5,
      maxY: 4,
    });
  });

  test("captures pixels at all four edges", () => {
    const image = makeImageData(
      4,
      4,
      (px, py) =>
        (px === 0 && py === 0) || // top-left
        (px === 3 && py === 0) || // top-right
        (px === 0 && py === 3) || // bottom-left
        (px === 3 && py === 3), // bottom-right
    );
    expect(maskBounds(image)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 3,
      maxY: 3,
    });
  });

  test("ignores the gap between sparse opaque pixels", () => {
    // Two opaque pixels at (1,1) and (5,3); bbox should span both.
    const image = makeImageData(
      8,
      8,
      (px, py) => (px === 1 && py === 1) || (px === 5 && py === 3),
    );
    expect(maskBounds(image)).toEqual({
      minX: 1,
      minY: 1,
      maxX: 5,
      maxY: 3,
    });
  });

  test("treats any non-zero alpha as opaque", () => {
    // Build an image with alpha = 1 (lowest non-zero) on a single pixel.
    const data = new Uint8ClampedArray(4 * 4 * 4);
    data[(2 * 4 + 1) * 4 + 3] = 1;
    const image = { data, width: 4, height: 4 } as ImageData;

    expect(maskBounds(image)).toEqual({
      minX: 1,
      minY: 2,
      maxX: 1,
      maxY: 2,
    });
  });
});
