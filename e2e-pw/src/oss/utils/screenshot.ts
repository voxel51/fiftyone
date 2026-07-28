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
