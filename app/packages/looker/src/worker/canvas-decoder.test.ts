import { describe, expect, it } from "vitest";
import { isGrayscale } from "./canvas-decoder";

const createData = (
  pixels: Array<[number, number, number, number]>
): Uint8ClampedArray => {
  return new Uint8ClampedArray(pixels.flat());
};

describe("isGrayscale", () => {
  it("should return true for a perfectly grayscale image", () => {
    const data = createData(Array(100).fill([100, 100, 100, 255]));
    expect(isGrayscale(data)).toBe(true);
  });

  it("should return false if alpha is not 255", () => {
    const data = createData([
      [100, 100, 100, 255],
      [100, 100, 100, 254],
      ...Array(98).fill([100, 100, 100, 255]),
    ]);
    expect(isGrayscale(data)).toBe(false);
  });

  it("should return false if any pixel is not grayscale", () => {
    const data = createData([
      [100, 100, 100, 255],
      [100, 101, 100, 255],
      ...Array(98).fill([100, 100, 100, 255]),
    ]);
    expect(isGrayscale(data)).toBe(false);
  });

  it("should detect a non-grayscale pixel placed deep enough to ensure at least 1% of pixels are checked", () => {
    // large image: 100,000 pixels. 1% of 100,000 is 1,000.
    // the function will check at least 1,000 pixels.
    // place a non-grayscale pixel after 800 pixels.
    const pixels = Array(100000).fill([50, 50, 50, 255]);
    pixels[800] = [50, 51, 50, 255]; // this is within the first 1% of pixels
    const data = createData(pixels);
    expect(isGrayscale(data)).toBe(false);
  });
});
