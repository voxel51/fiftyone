import { describe, expect, it } from "vitest";
import { isGrayscale } from "./canvas-decoder";

const createData = (
  pixels: Array<[number, number, number, number]>
): Uint8ClampedArray => {
  return new Uint8ClampedArray(pixels.flat());
};

describe("isGrayscale", () => {
  it("should return true for a perfectly grayscale image", () => {
    // all pixels are (100, 100, 100, 255)
    const data = createData(Array(100).fill([100, 100, 100, 255]));
    expect(isGrayscale(data)).toBe(true);
  });

  it("should return false if alpha is not 255", () => {
    // one pixel with alpha < 255
    const data = createData([
      [100, 100, 100, 255],
      [100, 100, 100, 254],
      ...Array(98).fill([100, 100, 100, 255]),
    ]);
    expect(isGrayscale(data)).toBe(false);
  });

  it("should return false if any pixel is not grayscale", () => {
    // one pixel differs in g channel
    const data = createData([
      [100, 100, 100, 255],
      [100, 101, 100, 255],
      ...Array(98).fill([100, 100, 100, 255]),
    ]);
    expect(isGrayscale(data)).toBe(false);
  });
});
