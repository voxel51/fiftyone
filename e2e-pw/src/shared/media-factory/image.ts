/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { HorizontalAlign, Jimp, loadFont, VerticalAlign } from "jimp";
import type { MediaOptions } from "./types";
import { generateOnce } from "./write";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fonts = require("jimp/fonts");

/**
 * What to draw in a solid-color PNG; every field has a default.
 */
export interface ImageSpec {
  /**
   * The width of the image in pixels.
   * @default 50
   */
  width?: number;
  /**
   * The height of the image in pixels.
   * @default 50
   */
  height?: number;
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
}

export type ImageOptions = MediaOptions & ImageSpec;

export const DEFAULT_IMAGE_SPEC: Required<
  Pick<ImageSpec, "width" | "height" | "fillColor">
> = {
  width: 50,
  height: 50,
  fillColor: "#00ddff",
};

/**
 * Generates a PNG at `outputPath` (which must carry an extension) with an
 * optional fill color and centered watermark text.
 *
 * @example
 * await createImage({
 *   outputPath: "/tmp/images/42.png",
 *   width: 256,
 *   height: 256,
 *   fillColor: "#ff0000",
 *   watermarkString: "42",
 * });
 */
export const createImage = async (options: ImageOptions): Promise<void> => {
  const { outputPath, width, height, fillColor, watermarkString, hideLogs } = {
    ...DEFAULT_IMAGE_SPEC,
    ...options,
  };

  await generateOnce(
    "Image",
    options,
    async () => {
      const image = new Jimp({ width, height, color: fillColor });

      if (watermarkString) {
        const font = await loadFont(fonts.SANS_10_BLACK);
        image.print({
          font,
          x: 0,
          y: 0,
          text: {
            text: watermarkString,
            alignmentX: HorizontalAlign.CENTER,
            alignmentY: VerticalAlign.MIDDLE,
          },
          maxWidth: width,
          maxHeight: height,
        });
      }

      await image.write(outputPath as `${string}.${string}`);
    },
    hideLogs,
  );
};
