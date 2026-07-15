/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Creates a 2D canvas suited for mask painting and pixel-level read-back.
 *
 * The context is configured with `willReadFrequently: true` so repeated
 * `getImageData` calls (used by hit-testing and `paintEnd`'s threshold pass)
 * stay on the CPU rather than incurring a GPU readback per call.
 *
 * @param width - Canvas width in pixels.
 * @param height - Canvas height in pixels.
 * @param xOffset - X offset (in canvas pixels) for the seeded bitmap.
 * @param yOffset - Y offset (in canvas pixels) for the seeded bitmap.
 * @param maskBitmap - Optional bitmap to draw onto the canvas at
 *   `(xOffset, yOffset)` — used to seed an editing canvas from an existing
 *   decoded mask.
 * @returns The created `<canvas>` element and its 2D context.
 * @throws If the browser cannot supply a 2D context.
 */
export const createMaskCanvas = (
  width = 0,
  height = 0,
  xOffset = 0,
  yOffset = 0,
  maskBitmap?: ImageBitmap,
) => {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;

  const maskContext = maskCanvas?.getContext("2d", {
    willReadFrequently: true,
  });

  if (!maskContext) throw new Error("Failed to get 2d context");

  if (maskBitmap) {
    maskContext.drawImage(maskBitmap, xOffset, yOffset);
  }

  return {
    maskCanvas,
    maskContext,
  };
};
