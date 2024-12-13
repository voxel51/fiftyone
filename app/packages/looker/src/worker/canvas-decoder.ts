import type { OverlayMask } from "../numpy";

/**
 * Decodes a given image source into an OverlayMask using an OffscreenCanvas
 */
export const decodeWithCanvas = async (blob: ImageBitmapSource) => {
  try {
    const imageBitmap = await createImageBitmap(blob);
  } catch (e) {
    console.error(e);
  }

  const width = imageBitmap.width;
  const height = imageBitmap.height;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(imageBitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);

  const numChannels = imageData.data.length / (width * height);

  const overlayData = {
    width,
    height,
    data: imageData.data,
    channels: numChannels,
  };

  // dispose
  imageBitmap.close();

  return {
    buffer: overlayData.data.buffer,
    channels: numChannels,
    arrayType: overlayData.data.constructor.name as OverlayMask["arrayType"],
    shape: [overlayData.height, overlayData.width],
  } as OverlayMask;
};
