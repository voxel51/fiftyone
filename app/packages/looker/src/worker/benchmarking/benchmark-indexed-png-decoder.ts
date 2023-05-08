import { ValidPngBitDepth } from "../indexed-png-decoder";
import { indexedPngBufferToRgb } from "../indexed-png-decoder";

const generateSampleData = (size: number) => {
  const inputData = new Uint8Array(size);
  const colorPalette = [
    [0, 0, 0],
    [255, 255, 255],
    [128, 128, 128],
    [192, 192, 192],
  ];

  for (let i = 0; i < size; i++) {
    inputData[i] = Math.floor(Math.random() * 256);
  }

  return { inputData, colorPalette };
};

export const benchmarkIndexedPngDecode = () => {
  // realistic bit depth that supports four colors
  // bit depth 4 and 8 are significantly faster
  const bitDepth: ValidPngBitDepth = 2;
  const sampleSizes = [1e4, 1e5, 1e6, 1e7];

  for (const size of sampleSizes) {
    const { inputData, colorPalette } = generateSampleData(size);
    const startTime = performance.now();
    indexedPngBufferToRgb(inputData, bitDepth, colorPalette);
    const endTime = performance.now();
    const elapsedTime = endTime - startTime;

    console.log(
      `Sample size: ${size}, elapsed time: ${elapsedTime.toFixed(2)} ms`
    );
  }
};
