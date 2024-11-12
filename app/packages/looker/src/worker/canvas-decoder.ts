import { OverlayMask } from "../numpy";

export const decodeWithCanvas = async (blob: ImageBitmapSource) => {
  const imageBitmap = await createImageBitmap(blob);
  const width = imageBitmap.width;
  const height = imageBitmap.height;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(imageBitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);

  const overlayData = {
    width,
    height,
    data: imageData.data,
    // RGBA
    channels: 4,
  };

  const numChannels =
    overlayData.channels ??
    overlayData.data.length / (overlayData.width * overlayData.height);

  return {
    buffer: overlayData.data.buffer,
    channels: numChannels,
    arrayType: overlayData.data.constructor.name as OverlayMask["arrayType"],
    shape: [overlayData.height, overlayData.width],
  } as OverlayMask;
};
