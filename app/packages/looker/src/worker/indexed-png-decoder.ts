export const indexedPngBufferToRgb = (
  data: Uint8Array,
  bitDepth: 1 | 2 | 4 | 8,
  colorPalette: number[][]
) => {
  const indicesPerByte = 8 / bitDepth;
  const numIndexes = data.length * indicesPerByte;
  const resultSize = numIndexes * 3;

  const rgbArray = new Uint8Array(resultSize);

  let rgbIdx = 0;
  let paletteIdx = 0;

  const colorIndices = new Uint8Array(numIndexes);

  // Determine the initial bit mask based on the bit depth:
  const initialBitMask = ((1 << bitDepth) - 1) << (8 - bitDepth);

  // extract color indexes from data based on bit depth
  for (const byte of data) {
    let currentBitMask = initialBitMask;
    let bitsToShift = 8 - bitDepth;

    while (currentBitMask) {
      colorIndices[paletteIdx++] = (byte & currentBitMask) >> bitsToShift;
      currentBitMask >>= bitDepth;
      bitsToShift -= bitDepth;
    }
  }

  // map color indices to rgb values
  for (const index of colorIndices) {
    const color = colorPalette[index];
    if (!color) {
      throw new Error("incorrect index of palette color");
    }
    rgbArray.set(color, rgbIdx);
    rgbIdx += 3;
  }

  return rgbArray;
};
