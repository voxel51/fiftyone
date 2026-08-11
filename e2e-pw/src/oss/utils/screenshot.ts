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
