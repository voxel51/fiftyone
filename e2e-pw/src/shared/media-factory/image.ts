/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { HorizontalAlign, Jimp, loadFont, VerticalAlign } from "jimp";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fonts = require("jimp/fonts");

/**
 * Generates a blank PNG image at the specified path, with optional fill color
 * and centered watermark text.
 *
 * @param options - Configuration for image generation.
 * @param options.outputPath - The absolute or relative file path where the image
 *   will be saved. Must include a file extension (e.g. `/tmp/dataset/0.png`).
 * @param options.width - The width of the image in pixels.
 * @param options.height - The height of the image in pixels.
 * @param options.fillColor - The background color of the image as a CSS hex string.
 *   @default "#00ddff"
 * @param options.watermarkString - Optional text to render centered over the image
 *   using a 10px black sans-serif font. If omitted, no text is rendered.
 * @param options.hideLogs - When `true`, suppresses console output for both the
 *   start and completion log messages.
 *   @default false
 *
 * @returns A `Promise` that resolves when the image has been written to disk.
 *
 * @example
 * // Minimal usage
 * await createBlankImage({
 *   outputPath: "/tmp/images/sample.png",
 *   width: 128,
 *   height: 128,
 * });
 *
 * @example
 * // With all options
 * await createBlankImage({
 *   outputPath: "/tmp/images/42.png",
 *   width: 256,
 *   height: 256,
 *   fillColor: "#ff0000",
 *   watermarkString: "42",
 *   hideLogs: true,
 * });
 */
export const createBlankImage = async (options: {
  /** The absolute or relative file path where the image will be saved. */
  outputPath: string;
  /** The width of the image in pixels. */
  width: number;
  /** The height of the image in pixels. */
  height: number;
  /**
   * The background fill color as a CSS hex string.
   * @default "#00ddff"
   */
  fillColor?: string;
  /**
   * Optional text to render centered over the image.
   * Rendered using a 10px black sans-serif font (`SANS_10_BLACK`).
   */
  watermarkString?: string;
  /**
   * When `true`, suppresses all console logging.
   * @default false
   */
  hideLogs?: boolean;
}) => {
  const { width, height, outputPath, fillColor, hideLogs } = options;
  const startTime = performance.now();

  if (!hideLogs) {
    console.log(
      `Creating blank image with options: ${JSON.stringify(options)}`
    );
  }

  const image = new Jimp({ width, height, color: fillColor ?? "#00ddff" });

  if (options.watermarkString) {
    const font = await loadFont(fonts.SANS_10_BLACK);
    image.print({
      font,
      x: 0,
      y: 0,
      text: {
        text: options.watermarkString,
        alignmentX: HorizontalAlign.CENTER,
        alignmentY: VerticalAlign.MIDDLE,
      },
      maxWidth: width,
      maxHeight: height,
    });
  }

  await image.write(outputPath as `${string}.${string}`);
  const endTime = performance.now();
  const timeTaken = endTime - startTime;

  if (!hideLogs) {
    console.log(
      `Image generation, path = ${outputPath}, completed in ${timeTaken} milliseconds`
    );
  }
};
