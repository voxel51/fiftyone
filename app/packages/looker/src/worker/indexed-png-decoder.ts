export type ValidPngBitDepth = 1 | 2 | 4 | 8;
export type ColorPalette = number[][];

export const indexedPngBufferToRgb = (
  inputData: Uint8Array,
  bitDepth: ValidPngBitDepth,
  colorPalette: ColorPalette
) => {
  const inputDataLength = inputData.length;
  const indicesPerByte = 8 / bitDepth;
  const numIndices = inputDataLength * indicesPerByte;
  const resultSize = numIndices * 3;
  const newRgbArray = new Uint8Array(resultSize);

  let rgbOffset = 0;

  // Determine the initial bit mask based on the bit depth:
  const initialBitMask = ((1 << bitDepth) - 1) << (8 - bitDepth);

  // extract color indexes from data based on bit depth
  for (let i = 0; i < inputDataLength; i++) {
    const byte = inputData[i];
    let currentBitMask = initialBitMask;
    let remainingBits = 8;

    while (remainingBits >= bitDepth) {
      const index = (byte & currentBitMask) >> (remainingBits - bitDepth);
      const color = colorPalette[index];
      if (!color) {
        throw new Error("Incorrect index of palette color");
      }
      newRgbArray.set(color, rgbOffset);
      rgbOffset += 3;

      remainingBits -= bitDepth;
      currentBitMask >>= bitDepth;
    }
  }

  return newRgbArray;
};
