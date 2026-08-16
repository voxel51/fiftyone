import { diff as diffImages, Jimp } from "jimp";
import { expect, Locator } from "src/oss/fixtures";

/**
 * Asserts that a locator's current screenshot matches a previously captured
 * screenshot buffer exactly.
 */
export const compareLocatorScreenshotToBuffer = async (
  locator: Locator,
  expected: Buffer,
  opts?: {
    beforeScreenshot?: () => void | Promise<void>;
  },
) => {
  if (opts?.beforeScreenshot) {
    await opts?.beforeScreenshot?.();
  }

  const actual = await locator.screenshot();

  const [expectedImage, actualImage] = await Promise.all([
    Jimp.read(expected),
    Jimp.read(actual),
  ]);

  expect(actualImage.bitmap.width).toBe(expectedImage.bitmap.width);
  expect(actualImage.bitmap.height).toBe(expectedImage.bitmap.height);

  const diff = diffImages(expectedImage, actualImage);
  expect(diff.percent).toBe(0);
};

/** Returns the sampled share of pixels matching the expected RGB color. */
export const getLocatorDominantColorShare = async (
  locator: Locator,
  expected: readonly [number, number, number],
): Promise<number> => {
  const image = await Jimp.read(await locator.screenshot());
  let matches = 0;
  let sampled = 0;
  for (let y = 0; y < image.bitmap.height; y += 4) {
    for (let x = 0; x < image.bitmap.width; x += 4) {
      const offset = (y * image.bitmap.width + x) * 4;
      const [red, green, blue] = image.bitmap.data.subarray(offset, offset + 3);
      sampled += 1;
      if (
        Math.abs(red - expected[0]) <= 12 &&
        Math.abs(green - expected[1]) <= 12 &&
        Math.abs(blue - expected[2]) <= 12
      ) {
        matches += 1;
      }
    }
  }
  return sampled === 0 ? 0 : matches / sampled;
};

/** Pixel count and bounding-box span that differ from a captured baseline. */
export interface LocatorScreenshotDifference {
  readonly changedPixels: number;
  readonly height: number;
  readonly width: number;
}

/**
 * Measures changed pixels and their spatial extent. This is useful for canvas
 * regressions where DOM point counts cannot prove that geometry was drawn or
 * that it did not collapse into one small clump.
 */
export const getLocatorScreenshotDifference = async (
  locator: Locator,
  baseline: Buffer,
  channelTolerance = 8,
): Promise<LocatorScreenshotDifference> => {
  const [expectedImage, actualImage] = await Promise.all([
    Jimp.read(baseline),
    Jimp.read(await locator.screenshot()),
  ]);
  expect(actualImage.bitmap.width).toBe(expectedImage.bitmap.width);
  expect(actualImage.bitmap.height).toBe(expectedImage.bitmap.height);

  let changedPixels = 0;
  let minX = actualImage.bitmap.width;
  let minY = actualImage.bitmap.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < actualImage.bitmap.height; y++) {
    for (let x = 0; x < actualImage.bitmap.width; x++) {
      const offset = (y * actualImage.bitmap.width + x) * 4;
      let changed = false;
      for (let channel = 0; channel < 4; channel++) {
        if (
          Math.abs(
            actualImage.bitmap.data[offset + channel] -
              expectedImage.bitmap.data[offset + channel],
          ) > channelTolerance
        ) {
          changed = true;
          break;
        }
      }
      if (!changed) continue;
      changedPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    changedPixels,
    height: maxY >= minY ? maxY - minY + 1 : 0,
    width: maxX >= minX ? maxX - minX + 1 : 0,
  };
};
