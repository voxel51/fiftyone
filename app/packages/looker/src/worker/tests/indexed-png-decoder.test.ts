import { describe, expect, it } from "vitest";
import {
  ColorPalette,
  ValidPngBitDepth,
  indexedPngBufferToRgb,
} from "../indexed-png-decoder";

describe("convertIndexedPngToRgb", () => {
  const palette: ColorPalette = [
    [0, 0, 0],
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
  ];

  it("works with 1-bit depth", () => {
    const inputData = new Uint8Array([0b10000000]);
    const bitDepth: ValidPngBitDepth = 1;
    // only two colors possible with 1 bit depth
    // for 0b10000000, only first bit has value, so the first index color (1, 1, 1) is chosen
    // other bits get 0 indexed color (0, 0, 0)
    const expectedResult = new Uint8Array([
      1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    const result = indexedPngBufferToRgb(inputData, bitDepth, palette);
    expect(result).toEqual(expectedResult);
  });

  it("works with 2-bit depth", () => {
    const inputData = new Uint8Array([0b11100000]);
    const bitDepth: ValidPngBitDepth = 2;
    // four colors possible with 2 bit depth
    // first two bits = 11 = 3, so the third index color (3, 3, 3) is chosen
    // second two bits = 10 = 2, so the second color is chosen
    // other two-two bits (00, 00) translate to (0,0,0), (0,0,0)
    const expectedResult = new Uint8Array([3, 3, 3, 2, 2, 2, 0, 0, 0, 0, 0, 0]);

    const result = indexedPngBufferToRgb(inputData, bitDepth, palette);
    expect(result).toEqual(expectedResult);
  });

  it("works with 4-bit depth", () => {
    const inputData = new Uint8Array([0b00110010]);
    const bitDepth: ValidPngBitDepth = 4;
    // 0011 = 3, so the third index color (3, 3, 3) is chosen
    // 0010 = 2, so the second index color is chosen
    const expectedResult = new Uint8Array([3, 3, 3, 2, 2, 2]);

    const result = indexedPngBufferToRgb(inputData, bitDepth, palette);
    expect(result).toEqual(expectedResult);
  });

  it("works with 8-bit depth", () => {
    const inputData = new Uint8Array([0b00000010, 0b00000011]);
    const bitDepth: ValidPngBitDepth = 8;
    // 00000010 = 2, so the second index color (2, 2, 2) is chosen
    // 00000011 = 3, so the third index color (3, 3, 3) is chosen
    const expectedResult = new Uint8Array([2, 2, 2, 3, 3, 3]);

    const result = indexedPngBufferToRgb(inputData, bitDepth, palette);
    expect(result).toEqual(expectedResult);
  });
});
